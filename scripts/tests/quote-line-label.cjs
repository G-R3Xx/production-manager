const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
function compile(p) {
  const out = ts.transpileModule(read(p), {
    fileName: p,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  });
  const failures = (out.diagnostics ?? []).filter(x => x.category === ts.DiagnosticCategory.Error);
  assert.equal(failures.length, 0, failures.map(x => ts.flattenDiagnosticMessageText(x.messageText, '\n')).join('\n'));
  return out.outputText;
}
function execModule(p, imports = () => ({})) {
  const exports = {};
  new Function('exports', 'require', 'Buffer', compile(p))(exports, imports, Buffer);
  return exports;
}
const label = execModule('apps/web/src/lib/quote-line-label.ts');
const name = '2 Year Print White';
const a = { productName: name, configurationSnapshot: { quoteLineTitleOverride: 'Kambah — Window Graphics', mainMaterialId: 'stock-a', unitCost: 44 } };
const b = { productName: name, configurationSnapshot: { quoteLineTitleOverride: 'Chisholm — Window Graphics' } };
assert.equal(label.quoteLineDisplayTitle(a), 'Kambah — Window Graphics');
assert.equal(label.quoteLineDisplayTitle(b), 'Chisholm — Window Graphics');
assert.equal(label.quoteLineDisplayTitle({ productName: name, configurationSnapshot: {} }), name);
assert.equal(label.quoteLineDisplayTitle({ productName: name, configurationSnapshot: { quoteLineTitleOverride: '   ' } }), name);
assert.equal(a.configurationSnapshot.mainMaterialId, 'stock-a');
assert.equal(a.configurationSnapshot.unitCost, 44);
assert.equal(a.productName, name);

const server = read('apps/web/src/server/quotes.ts');
const func = server.match(/export async function updateQuoteLineTitleOverrideForTenant\([\s\S]*?\n\}/)?.[0];
assert.ok(func, 'Tenant-scoped label update exists');
for(const part of ['qd.tenant_id = $1::uuid', 'ql.quote_id = $2::uuid', 'ql.id = $3::uuid', 'qd.status NOT IN', "jsonb_set(", "'quoteLineTitleOverride'", 'updated_at = now()']) assert.ok(func.includes(part), part);
assert.doesNotMatch(func, /SET\s+product_name|SET\s+unit_price|line_total\s*=/i, 'Rename must not alter pricing or product identity');
assert.ok(server.includes('configuration_snapshot = EXCLUDED.configuration_snapshot || CASE'), 'Bundle re-edit retains overridden title');
assert.ok(server.includes('configuration_snapshot = COALESCE($9::jsonb, ql.configuration_snapshot) || CASE'), 'Direct line re-edit retains overridden title');

const api = 'apps/web/src/app/api/quotes/line/title/route.ts';
const ui = 'apps/web/src/app/(app)/quotes/QuoteLineLabelEditor.tsx';
const page = read('apps/web/src/app/(app)/quotes/page.tsx');
for(const p of [api, ui, 'apps/web/src/app/(app)/quotes/page.tsx', 'apps/web/src/app/public/quotes/[token]/page.tsx', 'apps/web/src/server/quote-pdf.ts', 'apps/web/src/server/quotes.ts']) compile(p);
assert.match(read(api), /updateQuoteLineTitleOverrideForTenant\(tenant.tenantId/);
assert.match(read(ui), /fetch\("\/api\/quotes\/line\/title"/);
assert.doesNotMatch(read(ui), /router\.refresh\(\)|<form\b/, 'Label saves should not start full refresh/overlay');
assert.match(page, /<QuoteLineLabelEditor/);
assert.match(page, /initialOverride=\{quoteLineTitleOverride\(line.configurationSnapshot\)\}/);
const client = read('apps/web/src/app/public/quotes/[token]/page.tsx');
assert.match(client, /if \(titleOverride\) return \{ title: titleOverride, detail: null \}/);
const pdf = execModule('apps/web/src/server/quote-pdf.ts', (name) => {
  if (name === '@/lib/quote-line-label') return label;
  if (name === 'server-only') return {};
  if (name === '@/lib/quote-sub-jobs') return execModule('apps/web/src/lib/quote-sub-jobs.ts', require);
  return require(name);
});
assert.equal(pdf.quoteLineClientTitle(a), 'Kambah — Window Graphics');
assert.equal(pdf.quoteLineClientTitle(b), 'Chisholm — Window Graphics');
(async () => {
  const build = await pdf.buildQuotePdf({
    quote: { clientName:'Customer', jobName:'Shop Windows', quoteNumber:'Q-TEST', notes:'', createdAt:'2026-11-11T00:00:00Z' },
    lines: [{ ...a, id:'line-a', optionSummary:'', quantity:'2', unitPrice:'100', lineTotal:'200', clientResponseStatus:'pending' }],
    subJobs: [], company:null
  });
  const bytes = Buffer.from(build.bytes).toString('latin1');
  assert.match(bytes, /Kambah/,'PDF renders custom line title');
  assert.doesNotMatch(bytes, /2 Year Print White/,'PDF omits underlying internal material name from visible title');
  assert.match(bytes, /\$220\.00/,'PDF pricing remains unchanged');
  console.log('PASS: per-line override, reset/fallback, tenant guard, persistence through edits, inline UI, client title, generated PDF and totals');
})().catch(error => {console.error(error);process.exitCode=1;});
