const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let ts;
try { ts = require("typescript"); } catch { ts = require("/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript"); }
const base = path.resolve(__dirname, "../..");
const read = (name) => fs.readFileSync(path.join(base, name), "utf8");
const helper = read("apps/web/src/lib/quote-sub-jobs.ts");
const moduleExports = {};
const compiled = ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
new Function("exports", compiled)(moduleExports);
const { quoteLineSubJobId, groupQuoteLinesBySubJob } = moduleExports;
const a = { id: "a", quoteId: "q", title: "Vehicle 123 Wrap", sortOrder: 0 };
const b = { id: "b", quoteId: "q", title: "Vehicle 456 Wrap", sortOrder: 1 };
const lines = [
  { id: "root-b", lineTotal: "150", configurationSnapshot: { subJobId: "b" } },
  { id: "child-b", lineTotal: "20", configurationSnapshot: { parentLineId: "root-b" } },
  { id: "root-a", lineTotal: "200", configurationSnapshot: { subJobId: "a" } },
  { id: "child-a", lineTotal: "30", configurationSnapshot: { parentLineId: "root-a" } },
  { id: "cancelled-a", lineTotal: "50", clientResponseStatus: "cancelled", configurationSnapshot: { subJobId: "a" } },
  { id: "unassigned", lineTotal: "40", configurationSnapshot: {} },
];
assert.equal(quoteLineSubJobId({ subJobId: "a" }), "a");
assert.equal(quoteLineSubJobId(null), null);
const groups = groupQuoteLinesBySubJob(lines, [b, a]);
assert.deepEqual(groups.map((group) => group.title), [a.title, b.title, "General / Unassigned"]);
assert.deepEqual(groups.map((group) => group.lines.map((line) => line.id)), [["root-a", "child-a", "cancelled-a"], ["root-b", "child-b"], ["unassigned"]]);
assert.deepEqual(groups.map((group) => group.subtotal), [230, 170, 40]);
assert.deepEqual(groupQuoteLinesBySubJob(lines, []).map((group) => group.lines.length), [6]);
assert.equal(groupQuoteLinesBySubJob([{ id: "x", lineTotal: "5", configurationSnapshot: { subJobId: "not-real" } }], [a])[1].title, "General / Unassigned");
assert.equal(groupQuoteLinesBySubJob([{ id: "x", lineTotal: "5", configurationSnapshot: { parentLineId: "x" } }], [a])[1].subtotal, 5);
// Ensure both builder layouts transmit section assignment to the same fast save action.
for (const file of ["QuoteLineBuilder.tsx", "QuoteMaterialFlowBuilder.tsx"]) {
  const src = read(`apps/web/src/app/(app)/quotes/${file}`);
  assert.match(src, /name="subJobId" value=\{subJobId \?\? ""\}/);
  assert.match(src, /saveQuoteLineFast\(new FormData\(form\)\)/);
}
for (const file of ["QuoteLineStartBuilder.tsx", "VisualQuoteCatalogue.tsx"]) {
  const src = read(`apps/web/src/app/(app)/quotes/${file}`);
  assert.match(src, /subJobId=\{subJobId\}/);
}
// Execute the same snapshot-building expressions used by the bundle save path.
// This guards that linked dispatch/access rows inherit their parent's Sub Job.
const quotesServerSource = read("apps/web/src/server/quotes.ts");
const snapshotStart = quotesServerSource.indexOf("  const mainSnapshot: Record<string, unknown> = {");
const snapshotEnd = quotesServerSource.indexOf("  const deleteIds = [", snapshotStart);
assert.ok(snapshotStart !== -1 && snapshotEnd > snapshotStart, "bundle snapshot block must exist with a typed configuration record");
const snapshotBlock = quotesServerSource.slice(snapshotStart, snapshotEnd);
const snapshotJavascript = ts.transpileModule(`${snapshotBlock}\nreturn { mainSnapshot, dispatchSnapshot, accessSnapshot };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;
const buildSnapshots = new Function("input", "mainLineId", "dispatchLineId", "accessEquipmentLineId", snapshotJavascript);
const inheritedSnapshots = buildSnapshots({
  configurationSnapshot: { subJobId: "vehicle-123", customOption: "keep" },
  dispatchLine: { configurationSnapshot: {} },
  accessEquipmentLine: { configurationSnapshot: {} }
}, "main", "dispatch", "access");
for (const snapshot of [inheritedSnapshots.mainSnapshot, inheritedSnapshots.dispatchSnapshot, inheritedSnapshots.accessSnapshot]) {
  assert.equal(snapshot.subJobId, "vehicle-123");
}
assert.equal(inheritedSnapshots.mainSnapshot.customOption, "keep");
assert.equal(inheritedSnapshots.dispatchSnapshot.parentLineId, "main");
assert.equal(inheritedSnapshots.accessSnapshot.parentLineId, "dispatch");
assert.match(quotesServerSource, /sj\.quote_id = qd\.id AND sj\.id::text = p\."mainSnapshot" ->> 'subJobId'/);
assert.match(read("apps/web/src/server/quote-sub-jobs.ts"), /WITH RECURSIVE allowed/);
assert.match(read("apps/web/src/server/quote-pdf.ts"), /sectionLabels/);
console.log("PASS: Sub Job grouping, inheritance, cancellations, unassigned, both builders, SQL authorization, PDF labels");

// Sequential section entry: each new section becomes the automatic destination
// for subsequent lines in either builder until the next section is created.
const { currentQuoteSubJob } = moduleExports;
assert.equal(currentQuoteSubJob([]), null);
assert.equal(currentQuoteSubJob([a]), a);
assert.equal(currentQuoteSubJob([b, a]), b); // database/UI order need not match
assert.equal(currentQuoteSubJob([a, { ...b, sortOrder: 0 }])?.id, b.id); // later creation wins ties
const newSection = { id: "c", quoteId: "q", title: "Vehicle 789 Wrap", sortOrder: 2 };
assert.equal(currentQuoteSubJob([b, newSection, a]), newSection);
const lastSectionRemoved = [a, b];
assert.equal(currentQuoteSubJob(lastSectionRemoved), b);
const firstLine = { id: "first", lineTotal: "55", configurationSnapshot: { subJobId: currentQuoteSubJob([a]).id } };
const secondLine = { id: "second", lineTotal: "70", configurationSnapshot: { subJobId: currentQuoteSubJob([b, a]).id } };
const resultSections = groupQuoteLinesBySubJob([firstLine, secondLine], [a, b]);
assert.deepEqual(resultSections.map((section) => section.lines.map((line) => line.id)), [["first"], ["second"]]);
const startBuilder = read("apps/web/src/app/(app)/quotes/QuoteLineStartBuilder.tsx");
assert.match(startBuilder, /const activeSubJob = currentQuoteSubJob\(subJobs\)/);
assert.match(startBuilder, /const subJobId = activeSubJob\?\.id \?\? null/);
assert.doesNotMatch(startBuilder, /setSubJobId|General \/ Unassigned<\/option>/);
assert.match(startBuilder, /subJobId=\{subJobId\}/g);
const quotePage = read("apps/web/src/app/(app)/quotes/page.tsx");
assert.match(quotePage, /\+ Start next Sub Job/);
assert.match(quotePage, /open=\{message === "Sub job created" \? true : undefined\}/);
assert.match(read("apps/web/src/app/(app)/quotes/actions.ts"), /message=Sub%20job%20created#quote-builder/);
console.log("PASS: sequential section creation, automatic current section, line assignment and both quote builders");

// Per-section totals must reconcile with the quote total (rounding at the
// overall-quote level, not GST independently on every small section).
const sectionsWithGst = groupQuoteLinesBySubJob([
  { id: "a1", lineTotal: "100.00", configurationSnapshot: { subJobId: "a" } },
  { id: "a2", lineTotal: "25.00", configurationSnapshot: { subJobId: "a" } },
  { id: "b1", lineTotal: "80.00", configurationSnapshot: { subJobId: "b" } },
  { id: "cancel", lineTotal: "200.00", clientResponseStatus: "cancelled", configurationSnapshot: { subJobId: "b" } },
], [a, b]);
assert.deepEqual(sectionsWithGst.map((group) => ({ title: group.title, subtotal: group.subtotal, gst: group.gst, total: group.totalIncGst })), [
  { title: a.title, subtotal: 125, gst: 12.5, total: 137.5 },
  { title: b.title, subtotal: 80, gst: 8, total: 88 },
]);
const tinyLines = [
  { id: "tiny1", lineTotal: "0.05", configurationSnapshot: { subJobId: "a" } },
  { id: "tiny2", lineTotal: "0.05", configurationSnapshot: { subJobId: "b" } },
  { id: "tiny3", lineTotal: "0.05", configurationSnapshot: {} },
];
const tinyGroups = groupQuoteLinesBySubJob(tinyLines, [a,b]);
const cents = (n) => Math.round(n * 100);
assert.equal(tinyGroups.reduce((sum, group) => sum + cents(group.subtotal), 0), 15);
assert.equal(tinyGroups.reduce((sum, group) => sum + cents(group.gst), 0), 2);
assert.equal(tinyGroups.reduce((sum, group) => sum + cents(group.totalIncGst), 0), 17);
// A negative line (credit) must not break cent allocation.
const negativeGroups = groupQuoteLinesBySubJob([
  { id: "a-credit", lineTotal: "-0.05", configurationSnapshot: { subJobId: "a" } },
  { id: "b-charge", lineTotal: "0.10", configurationSnapshot: { subJobId: "b" } },
], [a,b]);
assert.equal(negativeGroups.reduce((sum, group) => sum + cents(group.gst), 0), 1);
assert.equal(negativeGroups.reduce((sum, group) => sum + cents(group.totalIncGst), 0), 6);
const pageSource = read("apps/web/src/app/(app)/quotes/page.tsx");
const clientPageSource = read("apps/web/src/app/public/quotes/[token]/page.tsx");
assert.match(pageSource, /showSectionTotal && section/);
assert.match(clientPageSource, /showSectionTotal && section/);
assert.match(pageSource, /formatMoney\(section\.totalIncGst\)/);
assert.match(clientPageSource, /formatMoney\(section\.totalIncGst\)/);
assert.match(read("apps/web/src/server/quote-pdf.ts"), /money\(group\.totalIncGst\)/);
console.log("PASS: section ex GST, allocated GST, inc GST totals, cancelled lines, rounding and staff/client/PDF outputs");
