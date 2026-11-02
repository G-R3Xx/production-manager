const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const clientPage = read('apps/web/src/app/public/quotes/[token]/page.tsx');
const internalEditor = read('apps/web/src/app/(app)/quotes/page.tsx');
const pdfSource = read('apps/web/src/server/quote-pdf.ts');
const quoteHelpers = read('apps/web/src/lib/quote-sub-jobs.ts');
// The staff quote editor has a separate section heading from the public quote.
// Its title bar must NOT duplicate totals already displayed after the lines.
const internalHeading = internalEditor.match(/\{showSectionHeading && section \? <div[\s\S]*?<\/div> : null\}/)?.[0];
assert.ok(internalHeading, 'The internal Sub Job heading still renders.');
assert.match(internalHeading, /\{section\.title\}/);
assert.doesNotMatch(internalHeading, /section\.lines\.length|formatMoney|subtotal|totalIncGst|ex GST|inc GST/);
const internalTotals = internalEditor.match(/\{showSectionTotal && section \? <div[\s\S]*?<\/div> : null\}/)?.[0];
assert.ok(internalTotals, 'The internal Sub Job total row still renders.');
for (const field of ['subtotal', 'gst', 'totalIncGst']) {
  assert.match(internalTotals, new RegExp(`formatMoney\\(section\\.${field}\\)`));
}
const sectionHeading = clientPage.match(/\{showHeading && section \? <div[\s\S]*?<\/div> : null\}/)?.[0];
assert.ok(sectionHeading, 'The online Sub Job heading still renders.');
assert.match(sectionHeading, /<strong>\{section\.title\}<\/strong>/);
assert.doesNotMatch(sectionHeading, /formatMoney|subtotal|totalIncGst|Sub Job:/);
const sectionTotals = clientPage.match(/\{showSectionTotal && section \? <div[\s\S]*?<\/div> : null\}/)?.[0];
assert.ok(sectionTotals, 'The separate Sub Job total still renders.');
assert.match(sectionTotals, /formatMoney\(section\.subtotal\)/);
assert.match(sectionTotals, /formatMoney\(section\.gst\)/);
assert.match(sectionTotals, /formatMoney\(section\.totalIncGst\)/);
const transform = (s, name) => {
  const out = ts.transpileModule(s, { fileName: name, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }});
  const errors = (out.diagnostics||[]).filter(d=>d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
  return out.outputText;
};
transform(clientPage, 'page.tsx');
const helperExports = {};
new Function('exports', 'require', transform(quoteHelpers, 'quote-sub-jobs.ts'))(helperExports, require);
const pdfExports = {};
const stubRequire = (name) => name === 'server-only' ? {} : name === '@/lib/quote-sub-jobs' ? helperExports : require(name);
new Function('exports', 'require', 'Buffer', transform(pdfSource, 'quote-pdf.ts'))(pdfExports, stubRequire, Buffer);
(async () => {
  const result = await pdfExports.buildQuotePdf({
    quote: {clientName:'Sample Client', quoteNumber:'Q-TEST', jobName:'Fleet Signage', createdAt:'2026-11-02T12:00:00Z', notes:''},
    lines: [{id:'line1', productName:'Printed Vinyl', optionSummary:'', quantity: '1', unitPrice:'100', lineTotal:'100', clientResponseStatus:'approved', configurationSnapshot:{subJobId:'vehicle1'}}],
    subJobs: [{id:'vehicle1', quoteId:'quote1', title:'Vehicle Wrap', sortOrder:0}],
    company:null
  });
  const pdf = Buffer.from(result.bytes).toString('latin1');
  assert.match(pdf, /SUB JOB: Vehicle Wrap/);
  assert.doesNotMatch(pdf, /SUB JOB: Vehicle Wrap[^\n]* \| \$100/);
  assert.ok(pdf.includes('Total \\(inc GST\\)'), 'PDF grand total label is preserved.');
  assert.match(pdf, /\$110\.00/);
  console.log('PASS: Internal + public headings are title-only; separate GST totals remain; generated PDF heading is title-only and quote total is preserved.');
})().catch(error => {console.error(error);process.exitCode=1;});
