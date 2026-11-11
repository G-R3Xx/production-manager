const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const actions = read('apps/web/src/app/(app)/quotes/actions.ts');
const server = read('apps/web/src/server/quotes.ts');
const moving = read('apps/web/src/server/quote-sub-jobs.ts');

const fastAction = actions.slice(actions.indexOf('export async function saveQuoteLineFastAction'), actions.indexOf('export async function', actions.indexOf('export async function saveQuoteLineFastAction') + 20));
const legacyUpdate = server.slice(server.indexOf('export async function updateQuoteLineForTenant'), server.indexOf('export type QuoteLineBundleSaveInput'));
const bundle = server.slice(server.indexOf('async function saveQuoteLineBundleForPrincipal'), server.indexOf('export async function saveQuoteLineBundleForTenant'));
const mainUpsert = bundle.slice(bundle.indexOf('    main_saved AS ('), bundle.indexOf('    dispatch_saved AS ('));
const dispatchUpsert = bundle.slice(bundle.indexOf('    dispatch_saved AS ('), bundle.indexOf('    access_saved AS ('));
const accessUpsert = bundle.slice(bundle.indexOf('    access_saved AS ('), bundle.indexOf('    SELECT\n      (SELECT id::text'));

// Both the UI and the server treat editing differently from creating.
assert.match(fastAction, /if \(!editingLineId && sectionValue && !validUuidOrNull\(sectionValue\)\)/);
assert.match(fastAction, /if \(editingLineId\) delete configurationSnapshot\.subJobId/);
assert.match(fastAction, /else if \(sectionValue\) configurationSnapshot\.subJobId = sectionValue/);
assert.match(bundle, /if \(!input\.lineId\) \{\s*\/\/ The browser/);
assert.match(bundle, /isEditing: Boolean\(input\.lineId\)/);
assert.match(bundle, /"isEditing" boolean/);
assert.match(bundle, /p\."isEditing" OR COALESCE\(p\."mainSnapshot" ->> 'subJobId'/);

// Older product-line edit handler must also preserve the existing section, not
// replace it with whatever was (or wasn't) in the submitted snapshot.
assert.match(legacyUpdate, /COALESCE\(\$9::jsonb, ql\.configuration_snapshot, '\{\}'::jsonb\)\s*- 'subJobId' - 'quoteLineTitleOverride'/);
assert.match(legacyUpdate, /WHEN ql\.configuration_snapshot \? 'subJobId'\s*THEN jsonb_build_object\('subJobId', ql\.configuration_snapshot -> 'subJobId'\)/);

// The fast upsert uses the saved row's subJobId on conflict, and does not
// blindly overwrite it with the browser's partial/stale quick-quote snapshot.
assert.match(mainUpsert, /EXCLUDED\.configuration_snapshot - 'subJobId' - 'quoteLineTitleOverride'/);
assert.match(mainUpsert, /WHEN ql\.configuration_snapshot \? 'subJobId'\s*THEN jsonb_build_object\('subJobId', ql\.configuration_snapshot -> 'subJobId'\)/);
assert.match(mainUpsert, /RETURNING id, configuration_snapshot/);

// Linked charges always obtain the *actual saved* main line's section,
// including newly created charges while editing a line.
for (const [name, sql] of [['dispatch', dispatchUpsert], ['access', accessUpsert]]) {
  assert.match(sql, /CROSS JOIN main_saved ms/, `${name} must use canonical parent`);
  assert.match(sql, /WHEN ms\.configuration_snapshot \? 'subJobId'\s*THEN jsonb_build_object\('subJobId', ms\.configuration_snapshot -> 'subJobId'\)/);
  assert.match(sql, /configuration_snapshot = \(EXCLUDED\.configuration_snapshot - 'quoteLineTitleOverride'\)/);
}

// An intentional Move action is independent and must still be able to set or
// remove subJobId, including all child lines.
assert.match(moving, /export async function assignQuoteLineSubJob/);
assert.match(moving, /WITH RECURSIVE allowed/);
assert.match(moving, /jsonb_set\(l\.configuration_snapshot, '\{subJobId\}'/);
assert.match(moving, /THEN l\.configuration_snapshot - 'subJobId'/);

// These are model-level expectations of Postgres JSONB merge semantics; the
// source assertions above ensure the same precedence is used by both edits.
function preserveSection(current, submitted) {
  const result = { ...submitted };
  delete result.subJobId;
  delete result.quoteLineTitleOverride;
  for (const key of ['subJobId', 'quoteLineTitleOverride']) {
    if (Object.hasOwn(current, key)) result[key] = current[key];
  }
  return result;
}
const chisholm = '11111111-1111-4111-8111-111111111111';
const kambah = '22222222-2222-4222-8222-222222222222';
const original = { subJobId: chisholm, quoteLineTitleOverride: 'Left Hand & Right Hand Windows', linkedDispatchLineId: 'child' };
for (const submitted of [
  { source: 'quick_quote_builder', widthMm: '1200' },
  { source: 'quick_quote_builder', widthMm: '1200', subJobId: kambah },
  { source: 'quick_quote_builder', widthMm: '1200', subJobId: null },
]) {
  const saved = preserveSection(original, submitted);
  assert.equal(saved.subJobId, chisholm, 'editing remains in Chisholm even when form is stale or empty');
  assert.equal(saved.quoteLineTitleOverride, original.quoteLineTitleOverride);
  assert.equal(saved.widthMm, '1200', 'other edits still save');
}
const intentionallyUnassigned = preserveSection({ some: 'field' }, { subJobId: kambah, widthMm: '900' });
assert.equal(Object.hasOwn(intentionallyUnassigned, 'subJobId'), false, 'editing an unassigned line does not move it');

console.log('PASS: editing a quote line preserves its Sub Job; linked charges follow the saved parent; explicit Move remains available');
