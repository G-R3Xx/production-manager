const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const file = 'apps/web/src/app/(app)/materials/MaterialPriceManager.tsx';
const table = read(file);
const page = read('apps/web/src/app/(app)/materials/page.tsx');
const server = read('apps/web/src/server/materials.ts');
const actions = read('apps/web/src/app/(app)/materials/actions.ts');
for (const [name, content, mode] of [
  [file, table, ts.ScriptKind.TSX],
  ['apps/web/src/app/(app)/materials/page.tsx', page, ts.ScriptKind.TSX],
  ['apps/web/src/server/materials.ts', server, ts.ScriptKind.TS],
  ['apps/web/src/app/(app)/materials/actions.ts', actions, ts.ScriptKind.TS]
]) {
  const source = ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true, mode);
  assert.equal(source.parseDiagnostics.length, 0, `${name}: ${source.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('; ')}`);
}
assert.match(table, /"Quote category", "Quote add-on", "Base products", "Quote image"/);
assert.match(table, /finishingProductsSummary\(row.quoteAddOnProducts\)/);
assert.match(table, /checked=\{row.quoteAddOnEnabled\}/);
assert.match(table, /toggleAddOnProduct\(editingAddOnRow.key, option.key, event.target.checked\)/);
assert.match(table, /quoteAddOnProducts: row.quoteAddOnEnabled \? row.quoteAddOnProducts : \[\]/);
assert.match(table, /quoteAddOnProducts: normalizeFinishingProducts\(material.quoteAddOnProducts\)/);
assert.match(page, /quoteAddOnProducts: material.quoteAddOnProducts/);
assert.match(actions, /revalidatePath\("\/quotes"\)/);
assert.match(server, /quoteAddOnProducts',\$25::jsonb/);
assert.match(server, /quoteAddOnProducts',\$26::jsonb/);

// Exercise the actual bulk-save server function against a mocked transaction.
const parsed = ts.createSourceFile('materials.ts', server, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = parsed.statements.filter(s => ts.isFunctionDeclaration(s) && [
  'cleanMaterialManagerText','cleanMaterialManagerNumber','cleanMaterialManagerGroup','cleanMaterialManagerType',
  'cleanPriceCheckedDate','cleanQuoteVisualCategory','saveMaterialPriceManagerChanges'
].includes(s.name?.text));
assert.equal(functions.length, 7);
const body = functions.map(s => server.slice(s.getStart(parsed), s.end)).join('\n');
const { outputText } = ts.transpileModule(body, { compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}});
const helperSource = read('apps/web/src/lib/quote-finishing-addons.ts');
const exportsHelper = {};
new Function('exports', ts.transpileModule(helperSource, {compilerOptions:{target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText)(exportsHelper);
const calls = [];
const client = {query: async (sql, params = []) => {
  calls.push({sql, params});
  if (/SELECT id\s+FROM app\.suppliers/.test(sql)) return {rows: [{id:'supplier-id'}]};
  if (/INSERT INTO catalog\.materials/.test(sql)) return {rows: [{id:'new-material-id'}]};
  if (/UPDATE catalog\.materials/.test(sql) && /RETURNING id/.test(sql)) return {rows: [{id:'material-id'}]};
  return {rows: []};
}, release() {}};
const out = {};
new Function('exports', 'pool', 'ensureMaterialPricingColumns', 'ensureMaterialVisualColumns', 'normalizeMaterialType', 'toLegacyMaterialType', 'normalizeFinishingProducts', outputText)(
  out, {connect: async () => client}, async () => {}, async () => {}, x => x, x => x, exportsHelper.normalizeFinishingProducts
);
const save = out.saveMaterialPriceManagerChanges;
assert.equal(typeof save, 'function');
const base = {id:'material-id',action:'KEEP',materialGroup:'signage',materialType:'finishing',name:'Stutcards',customerFacingName:null,supplierName:'Sample Supplier',sku:'ABC',purchaseUom:'box',stockUom:'each',stockQuantity:'100',purchaseCost:'40',wastagePercent:'0',showAsInstallationOption:false,reversePrintable:false,widthMm:null,lengthMm:null,rollWidthMm:null,gsm:null,priceCheckedAt:null,quoteVisualCategory:null,minimumBillableSheetFraction:null,rollBillingIncrementMetres:null};
(async () => {
  await save('tenant-id', [{...base, quoteAddOnEnabled:true, quoteAddOnProducts:['corflute','corflute','bad-key']}]);
  let q = calls.find(c => /UPDATE catalog\.materials/.test(c.sql) && /RETURNING id/.test(c.sql));
  assert.ok(q);
  assert.equal(q.params[24],true);
  assert.deepEqual(JSON.parse(q.params[25]),['corflute']);
  assert.equal(q.params[26], null);
  assert.match(q.sql, /quoteAddOnProducts',\$26::jsonb/);
  calls.length=0;
  await save('tenant-id', [{...base,id:null,action:'ADD',quoteAddOnEnabled:true,quoteAddOnProducts:['acm','corflute']}]);
  q = calls.find(c => /INSERT INTO catalog\.materials/.test(c.sql));
  assert.equal(q.params[23],true);
  assert.deepEqual(JSON.parse(q.params[24]),['acm','corflute']);
  assert.equal(q.params[25], null);
  calls.length=0;
  await save('tenant-id', [{...base,quoteAddOnEnabled:false,quoteAddOnProducts:['corflute']}]);
  q = calls.find(c => /UPDATE catalog\.materials/.test(c.sql) && /RETURNING id/.test(c.sql));
  assert.equal(q.params[24],false);
  assert.deepEqual(JSON.parse(q.params[25]),[]);
  assert.equal(q.params[26], null);
  calls.length=0;
  await save('tenant-id', [{...base, quoteAddOnEnabled:false, quoteAddOnProducts:[], standardCutMinutesPerSheet:'7.5'}]);
  q = calls.find(c => /UPDATE catalog\.materials/.test(c.sql) && /RETURNING id/.test(c.sql));
  assert.equal(q.params[26], '7.5');
  assert.match(q.sql, /standardCutMinutesPerSheet',\$27::numeric/);
  calls.length=0;
  await assert.rejects(() => save('tenant-id',[{...base,quoteAddOnEnabled:false,quoteAddOnProducts:[],standardCutMinutesPerSheet:'-4'}]),/cannot be negative/);
  calls.length=0;
  await assert.rejects(() => save('tenant-id',[{...base,quoteAddOnEnabled:false,quoteAddOnProducts:[],standardCutMinutesPerSheet:'241'}]),/cannot exceed 240/);
  calls.length=0;
  await assert.rejects(() => save('tenant-id',[{...base,quoteAddOnEnabled:true,quoteAddOnProducts:[]}]),/Select at least one base product/);
  assert.ok(calls.some(c => c.sql === 'ROLLBACK'));
  console.log('PASS materials grid add-on controls, TS/TSX syntax and actual bulk SQL write/save semantics');
})().catch(e=>{console.error(e);process.exitCode=1});
