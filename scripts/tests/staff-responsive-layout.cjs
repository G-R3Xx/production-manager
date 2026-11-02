// Dependency-free regression test for the staff screen's responsive, independent forms.
// Run from the monorepo root: node scripts/tests/staff-responsive-layout.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const view = fs.readFileSync('apps/web/src/app/(app)/users/page.tsx', 'utf8');
const action = fs.readFileSync('apps/web/src/app/(app)/users/actions.ts', 'utf8');
const memberUpdate = fs.readFileSync('apps/web/src/server/users.ts', 'utf8');

assert(!view.includes('<table'), 'Staff data must not use a fixed-width scrolling table');
assert(!view.includes('position: "sticky"'), 'No sticky Save column should cover controls');
assert(view.includes('gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))"'));
assert(view.includes('flexWrap: "wrap"'), 'Staff header actions must wrap on narrow screens');
assert(view.includes('users.map((row, index) =>'), 'Each member must have a separate card');
const formStart = view.indexOf('<form\n                  key={row.membershipId}');
const formEnd = view.indexOf('</form>', formStart);
assert(formStart >= 0 && formEnd > formStart);
const form = view.slice(formStart, formEnd);
for (const item of ['membershipId', 'fullName', 'shortName', 'tenantRole', 'membershipStatus', 'quoteLabourRate', 'quoteEntryLayout', 'quoteCostBreakdownEnabled']) {
  assert(form.includes(`name="${item}"`), `${item} must belong to the staff member's form`);
}
assert(form.includes('action={updateStaffMemberAction}'));
assert(form.indexOf('name="quoteCostBreakdownEnabled"') < form.indexOf('gridTemplateColumns:'), 'The permission must be visible next to Save, above the field grid');
assert(form.includes('defaultChecked={row.quoteCostBreakdownEnabled}'));
assert(form.includes('disabled={!canEditRow}'));
assert(form.includes('type="submit"'), 'Each member needs a Save action');
assert(action.includes('formData.get("quoteCostBreakdownEnabled") === "on"'));
assert(memberUpdate.includes('quote_cost_breakdown_enabled = $7'));
console.log('PASS: responsive staff cards, visible permission, per-person Save and permission wiring');
