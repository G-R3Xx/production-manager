const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const p = {
  db: 'apps/web/src/server/quotes.ts',
  route: 'apps/web/src/app/api/quotes/line/quick/route.ts',
  controls: 'apps/web/src/app/(app)/quotes/QuoteLineQuickActions.tsx',
  page: 'apps/web/src/app/(app)/quotes/page.tsx'
};
for (const filename of Object.values(p)) {
  const compiled = ts.transpileModule(read(filename), {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX }
  });
  assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, `Syntax error in ${filename}`);
}
const db = read(p.db), route = read(p.route), controls = read(p.controls), page = read(p.page);
assert.match(db, /deleteQuoteLineBundleForTenant/);
assert.match(db, /tenant_id\s*=\s*\$1::uuid/);
assert.match(db, /WITH RECURSIVE owned/);
assert.match(db, /linkedDispatchLineId/);
assert.match(db, /linkedAccessEquipmentLineId/);
assert.match(db, /parentLineId/);
assert.match(db, /RETURNING l\.id::text AS id/);
assert.match(route, /mode === "delete"/);
assert.match(route, /assignQuoteLineSubJob/);
assert.match(route, /resolveActiveTenantForAuthUserId/);
assert.match(route, /authMs, dbMs, totalMs/);
assert.match(controls, /fetch\("\/api\/quotes\/line\/quick"/);
assert.match(controls, /window\.dispatchEvent\(new CustomEvent/);
assert.match(controls, /router\.refresh\(\)/);
assert.match(page, /QuoteLineVisibility lineId=\{line\.id\}/);
assert.match(page, /QuoteLineQuickActions/);
assert.doesNotMatch(page, /<form action=\{deleteQuoteLineAction\}/);
assert.doesNotMatch(page, /<form action=\{assignQuoteLineSubJobAction\}/);
assert.match(page, /<details id="sub-jobs"/);
console.log('PASS quote-line quick actions: syntax, tenant-scoped changes, linked deletion, asynchronous refresh, visible feedback and duplicate control removal');
