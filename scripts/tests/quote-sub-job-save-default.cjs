const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }
const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const libCode = ts.transpileModule(read('apps/web/src/lib/quote-sub-jobs.ts'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
const lib = {};
new Function('exports', libCode)(lib);
const { assignCurrentSubJobToNewQuoteLine, groupQuoteLinesBySubJob } = lib;

const chisholm = '11111111-1111-4111-8111-111111111111';
const kambah = '22222222-2222-4222-8222-222222222222';
const main = { source: 'quick_quote', subJobId: chisholm, quantity: 2 };
const dispatch = { parentLineId: 'main-id' };
const access = { parentLineId: 'dispatch-id', subJobId: chisholm };
assignCurrentSubJobToNewQuoteLine(kambah, main, dispatch, access);
for (const snapshot of [main, dispatch, access]) assert.equal(snapshot.subJobId, kambah);
assert.equal(main.quantity, 2);
assert.equal(dispatch.parentLineId, 'main-id');
assert.equal(access.parentLineId, 'dispatch-id');
const grouped = groupQuoteLinesBySubJob([
  { id: 'new', lineTotal: '50', configurationSnapshot: main },
  { id: 'delivery', lineTotal: '10', configurationSnapshot: dispatch },
  { id: 'access', lineTotal: '15', configurationSnapshot: access },
], [
  { id: chisholm, quoteId: 'quote', title: 'Chisholm', sortOrder: 0 },
  { id: kambah, quoteId: 'quote', title: 'Kambah', sortOrder: 1 },
]);
assert.deepEqual(grouped.map(group => ({ title: group.title, count: group.lines.length })), [
  { title: 'Chisholm', count: 0 }, { title: 'Kambah', count: 3 }
]);
const stale = { subJobId: chisholm, price: 100 };
assignCurrentSubJobToNewQuoteLine(null, stale, null, null);
assert.equal('subJobId' in stale, false);
assert.equal(stale.price, 100);

const server = read('apps/web/src/server/quotes.ts');
const start = server.indexOf('    if (!input.lineId) {\n      // The browser');
const end = server.indexOf('    result = await client.query', start);
assert.ok(start > 0 && end > start, 'New-line section resolver must be executed before the INSERT');
const block = server.slice(start, end);
assert.match(block, /ORDER BY sj\.sort_order DESC, sj\.created_at DESC, sj\.id DESC/);
assert.match(block, /qd\.tenant_id = \$1::uuid/);
assert.match(block, /m\.tenant_id = qd\.tenant_id/);
assert.match(block, /assignCurrentSubJobToNewQuoteLine\(activeSection\.rows\[0\]\?\.id \?\? null,/);
const compiled = ts.transpileModule(`
async function run(input: { lineId: string | null }, client: any, principal: { id: string; kind: string }, quoteId: string,
  mainSnapshot: Record<string, unknown>, dispatchSnapshot: Record<string, unknown> | null, accessSnapshot: Record<string, unknown> | null,
  assignCurrentSubJobToNewQuoteLine: typeof import('../../apps/web/src/lib/quote-sub-jobs').assignCurrentSubJobToNewQuoteLine) {
${block}
}
return run;
`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const run = new Function(compiled)();
(async () => {
  let calls = 0;
  const client = { query: async (sql, args) => {
    calls++;
    assert.match(sql, /FROM sales\.quote_sub_jobs sj/);
    assert.deepEqual(args, ['user-id', 'quote-id', 'auth_user']);
    return { rows: [{ id: kambah }] };
  } };
  const original = { subJobId: chisholm };
  await run({ lineId: null }, client, { id: 'user-id', kind: 'auth_user' }, 'quote-id', original, null, null, assignCurrentSubJobToNewQuoteLine);
  assert.equal(original.subJobId, kambah, 'new line uses DB latest even if form is stale');
  assert.equal(calls, 1);
  const editing = { subJobId: chisholm };
  await run({ lineId: 'existing-line-id' }, client, { id: 'user-id', kind: 'auth_user' }, 'quote-id', editing, null, null, assignCurrentSubJobToNewQuoteLine);
  assert.equal(editing.subJobId, chisholm, 'editing does not reassign sections');
  assert.equal(calls, 1, 'editing must skip latest-section database read');

  const page = read('apps/web/src/app/(app)/quotes/page.tsx');
  assert.match(page, /key=\{`new-quote-line:\$\{selectedQuote\.id\}:\$\{activeSubJob\?\.id \?\? "general"\}`\}/);
  const builders = ['QuoteLineBuilder.tsx', 'QuoteMaterialFlowBuilder.tsx'];
  for (const builder of builders) {
    const src = read(`apps/web/src/app/(app)/quotes/${builder}`);
    assert.match(src, /name="subJobId" value=\{subJobId \?\? ""\}/);
  }
  console.log('PASS: newest Sub Job assigned to new main + linked lines; preserved on edits; both builders remount with current section');
})().catch((error) => { console.error(error); process.exitCode = 1; });
