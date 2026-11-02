// Run with NODE_PATH=$(npm root -g) node scripts/tests/dispatch-pricing.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const file = path.join(__dirname, '../../apps/web/src/lib/dispatch-pricing.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const out={}; vm.runInNewContext(compiled,{exports:out},{filename:file});
const { isPassThroughDispatchService, isPassThroughQuoteLine, enforcePassThroughLine, passThroughUnitPrice }=out;
for (const type of ['delivery','courier']) {
  assert.equal(isPassThroughDispatchService(type),true);
  const charge=66;
  const line={productName:type==='courier'?'Courier':'Delivery',unitPrice:'195.00',configurationSnapshot:{flowType:'service',serviceType:type,deliveryCharge:String(charge),unitPriceOverridden:true,pricingSnapshot:{rawCost:charge,markupMultiplier:1.5,profitMultiplier:1.2,priceLevelFactor:1.3,manualQuoteDiscountPercent:10}}};
  const fixed=enforcePassThroughLine(line);
  assert.equal(fixed.unitPrice,'66.00');
  assert.equal(fixed.configurationSnapshot.pricingSnapshot.markupMultiplier,1);
  assert.equal(fixed.configurationSnapshot.pricingSnapshot.profitMultiplier,1);
  assert.equal(fixed.configurationSnapshot.pricingSnapshot.priceLevelFactor,1);
  assert.equal(fixed.configurationSnapshot.pricingSnapshot.manualQuoteDiscountPercent,0);
  assert.equal(fixed.configurationSnapshot.pricingSnapshot.pricingSource,'pass_through');
  assert.equal(fixed.configurationSnapshot.unitPriceOverridden,false);
  assert.equal(fixed.configurationSnapshot.pricingSnapshot.rawCost,66);
  assert.equal(isPassThroughQuoteLine(line.configurationSnapshot),true);
}
assert.equal(isPassThroughDispatchService('install'),false);
assert.equal(isPassThroughDispatchService('pickup'),false);
assert.equal(isPassThroughQuoteLine({flowType:'signage',serviceType:'delivery'},'Delivery van graphics'),false);
assert.equal(isPassThroughQuoteLine({},'Courier'),true);
assert.equal(isPassThroughQuoteLine({},'Delivery'),true);
assert.equal(isPassThroughQuoteLine({},'Delivery boards'),false);
assert.equal(passThroughUnitPrice(-2),0);
assert.equal(passThroughUnitPrice(NaN),0);
assert.equal(enforcePassThroughLine({productName:'Sign Install',unitPrice:'175.00',configurationSnapshot:{flowType:'service',serviceType:'install',deliveryCharge:'60',pricingSnapshot:{markupMultiplier:1.5}}}).unitPrice,'175.00');
assert.equal(enforcePassThroughLine({productName:'Service',unitPrice:'100.00',configurationSnapshot:{flowType:'signage',serviceType:'courier'}}).unitPrice,'100.00');
console.log('PASS: courier and delivery pass-through, protection from markup/profit/discount/price-level, non-dispatch unchanged');
