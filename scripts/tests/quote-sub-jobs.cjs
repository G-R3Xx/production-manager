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
