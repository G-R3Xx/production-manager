// Regression tests for lightweight quote status polling. Run: node scripts/tests/quote-status-performance.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '../../apps/web/src/server/quotes.ts'), 'utf8');
const file = ts.createSourceFile('quotes.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = ['statusTimestamp', 'quoteActivityFingerprint', 'orderQuoteStatusLines', 'getQuoteStatusSnapshotForTenant'];
const functions = names.map(name => {
  const node = file.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(node, `${name} exists`);
  return node.getText(file).replace(/^export /, '');
});
const runtime = `${functions.join('\n')}\nmodule.exports = { ${names.join(', ')} };`;
const compiled = ts.transpileModule(runtime, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
const ctx = { module: { exports: {} }, pool: { query: null }, Date, JSON, Map, Set, String };
vm.runInNewContext(compiled.outputText, ctx, { filename: 'quotes-isolated.js' });
const { quoteActivityFingerprint, orderQuoteStatusLines, getQuoteStatusSnapshotForTenant } = ctx.module.exports;

const now = new Date('2026-11-02T12:00:00.000Z');
const quote = {
  status: 'sent', updatedAt: now, sentAt: now, emailStatus: 'sent', emailSentAt: now,
  emailLastError: null, viewedAt: null, acceptedAt: null, declinedAt: null,
  changesRequestedAt: null, myobOrderStatus: 'not_synced', myobOrderSyncedAt: null,
  myobOrderSyncError: null,
};
const lines = [
  { id: 'child', parentLineId: 'parent', configurationSnapshot: { parentLineId: 'parent', largeImage: 'x'.repeat(250_000) }, clientResponseStatus: 'approved', clientRespondedAt: now, updatedAt: now },
  { id: 'parent', parentLineId: null, configurationSnapshot: {}, clientResponseStatus: 'pending', clientRespondedAt: null, updatedAt: now },
  { id: 'other', parentLineId: null, configurationSnapshot: {}, clientResponseStatus: 'changes_requested', clientRespondedAt: now, updatedAt: now },
];

function baselineOrdering(rows) {
  const byId = new Map(rows.map(r => [r.id, r]));
  const childrenByParent = new Map();
  const linked = new Set();
  for (const line of rows) {
    const rawParentId = line.configurationSnapshot?.parentLineId;
    const parentId = typeof rawParentId === 'string' ? rawParentId.trim() : '';
    if (!parentId || parentId === line.id || !byId.has(parentId)) continue;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(line); childrenByParent.set(parentId, children); linked.add(line.id);
  }
  const ordered = []; const added = new Set();
  const append = line => { if (added.has(line.id)) return; ordered.push(line); added.add(line.id); for (const c of childrenByParent.get(line.id) ?? []) append(c); };
  for (const l of rows) if (!linked.has(l.id)) append(l);
  for (const l of rows) append(l);
  return ordered;
}

assert.equal(JSON.stringify(orderQuoteStatusLines(lines).map(r => r.id)), JSON.stringify(baselineOrdering(lines).map(r => r.id)));
for (const fixture of [
  lines,
  [{ id:'a', parentLineId:'b', configurationSnapshot:{parentLineId:'b'} }, { id:'b', parentLineId:'a', configurationSnapshot:{parentLineId:'a'} }],
  [{ id:'o', parentLineId:'missing', configurationSnapshot:{parentLineId:'missing'} }, { id:'self', parentLineId:'self', configurationSnapshot:{parentLineId:'self'} }],
  [{ id:'r', parentLineId:null, configurationSnapshot:{} }, { id:'c', parentLineId:'r', configurationSnapshot:{parentLineId:'r'} }, { id:'g', parentLineId:'c', configurationSnapshot:{parentLineId:'c'} }],
]) {
  assert.equal(JSON.stringify(orderQuoteStatusLines(fixture).map(x=>x.id)), JSON.stringify(baselineOrdering(fixture).map(x=>x.id)), 'display order matches old full line list');
}

(async () => {
  let calls = [];
  ctx.pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM sales.quote_drafts')) return { rows: [quote] };
    assert.match(sql, /configuration_snapshot\s*->>\s*'parentLineId'/);
    assert.doesNotMatch(sql, /configuration_snapshot\s+as\s+/i);
    assert.doesNotMatch(sql, /line_total|unit_price|option_summary|client_response_notes/i);
    return { rows: lines.map(({ configurationSnapshot, ...line }) => line) };
  };
  const result = await getQuoteStatusSnapshotForTenant('tenant-a','quote-a');
  assert.equal(result.fingerprint, quoteActivityFingerprint(quote, baselineOrdering(lines)));
  assert.equal(result.status, quote.status);
  assert.equal(result.updatedAt, now.toISOString());
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(calls[0].params), JSON.stringify(['tenant-a','quote-a']));
  assert.equal(JSON.stringify(calls[1].params), JSON.stringify(['quote-a']));
  const responseBytes = Buffer.byteLength(JSON.stringify(result));
  const oldLineBytes = Buffer.byteLength(JSON.stringify(lines));
  assert.ok(responseBytes < oldLineBytes / 50, `lightweight status result (${responseBytes} bytes) is far smaller than full configuration (${oldLineBytes} bytes)`);

  calls = [];
  ctx.pool.query = async (sql, params) => { calls.push(params); return { rows: [] }; };
  assert.equal(await getQuoteStatusSnapshotForTenant('tenant-a', 'missing-quote'), null);
  assert.equal(calls.length, 1, 'does not disclose another tenant quote lines');
  console.log('PASS quote status projection, ordering/fingerprint parity, tenant filter, payload size, and missing quote');
})().catch(e => { console.error(e); process.exitCode = 1; });
