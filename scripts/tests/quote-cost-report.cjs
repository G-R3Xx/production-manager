// Run without application dependencies: node scripts/tests/quote-cost-report.cjs
// Validates saved-figure costing, incomplete history, reconciliation and cancelled items.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const file=path.join(__dirname,'../../apps/web/src/lib/quote-cost-report.ts');
const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const compiledExports={};vm.runInNewContext(compiled,{exports:compiledExports,require}, {filename:file});
const {buildQuoteCostReport,costCategory}=compiledExports;
const line=(overrides={})=>({
 productName:'Printed ACM sign',quantity:'2',unitPrice:'120.00',lineTotal:'240.00',clientResponseStatus:'pending',
 configurationSnapshot:{pricingSnapshot:{rawCost:50,markupMultiplier:1.5,profitMultiplier:1.2,priceLevelFactor:1,manualQuoteDiscountPercent:0,pricingSource:'pm_calculated',pricingBreakdown:[
 {label:'Base material',detail:'3mm ACM',amount:1,unit:'sheet',rate:22,cost:22,note:'sheet minimum'},
 {label:'CMYK ink',detail:'Print',amount:1,unit:'sqm',rate:8,cost:8},
 {label:'Artwork',detail:'Design',amount:20,unit:'min',rate:.5,cost:10},
 {label:'Print machine',detail:'Mimaki',amount:1,unit:'item',rate:10,cost:10}]}},...overrides
});
const report=buildQuoteCostReport([line()]);
assert.equal(report.complete,true);
assert.equal(report.revenue,240);
assert.equal(report.knownCost,100);
assert.equal(report.grossProfit,140);
assert.equal(report.categoryTotals.Materials,44);
assert.equal(report.categoryTotals.Ink,16);
assert.equal(report.categoryTotals.Labour,20);
assert.equal(report.categoryTotals.Machines,20);
assert.equal(report.lines[0].parts[0].lineCost,44);
assert.equal(report.marginPercent,140/240*100);
assert.equal(costCategory('Fixing allowance'),'Finishing / consumables');
assert.equal(costCategory('CMYK print'),'Ink');
const missing=buildQuoteCostReport([line(),line({productName:'Manual',configurationSnapshot:{},lineTotal:'30'})]);
assert.equal(missing.complete,false);
assert.equal(missing.knownCost,100);
assert.equal(missing.grossProfit,null);
assert.equal(missing.marginPercent,null);
assert(missing.lines[1].warnings.some(x=>x.includes('No itemised')));
const mismatch=buildQuoteCostReport([line({configurationSnapshot:{pricingSnapshot:{rawCost:100,pricingBreakdown:[{label:'Artwork',amount:1,rate:30,cost:30}]}}})]);
assert.equal(mismatch.complete,false);
assert(mismatch.lines[0].warnings.some(x=>x.includes('Cannot reconcile')));
const cancelled=buildQuoteCostReport([line(),line({clientResponseStatus:'cancelled',unitPrice:'500',lineTotal:'1000'})]);
assert.equal(cancelled.complete,true);
assert.equal(cancelled.revenue,240);
assert.equal(cancelled.knownCost,100);
assert.equal(cancelled.lines.length,2);
assert(cancelled.lines[1].warnings.some(x=>x.includes('Cancelled')));
const override=buildQuoteCostReport([line({configurationSnapshot:{...line().configurationSnapshot,unitPriceOverridden:true}})]);
assert(override.lines[0].warnings.some(x=>x.includes('overridden')));
const matrix=buildQuoteCostReport([line({configurationSnapshot:{...line().configurationSnapshot,pricingSnapshot:{...line().configurationSnapshot.pricingSnapshot,pricingSource:'myob_item_matrix'}}})]);
assert(matrix.lines[0].warnings.some(x=>x.includes('MYOB matrix')));
console.log('PASS: six cost report scenarios (complete, historical missing, discrepancy, cancelled, manual override, MYOB matrix)');
