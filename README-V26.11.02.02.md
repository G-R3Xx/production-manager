# Production Manager V26.11.02.02 — Staff & Roles layout fix

**Based on:** V26.11.02.01, retaining confidential quote cost breakdown, client multiple contacts, and previous changes.

## Fixed

- Replaced the oversized **Staff & Roles** table with individual responsive staff cards. This removes the fixed 1320px table width, clipped Quote layout selector, horizontal overflow and sticky Save column obscuring later fields.
- Each person now has a visible **Show cost breakdown** checkbox in their card header, directly alongside **Save**, with no sideways scrolling required. The field grid wraps at narrow screen widths.
- Each card remains a single, independent server-action form, so saving one staff member updates only that person's fields and the permission status.
- Active owners/managers can edit eligible cards. Managers see owner accounts read-only to match the existing server-side restriction. Other non-admin users view read-only fields.
- All existing staff fields remain: full name, short name, email, role, status, labour rate, quote entry layout, membership dates, and confidential cost-breakdown permission.
- The internal cost report and the standard client quote remain separate.

## Database

**No new SQL migration.** If `062_quote_cost_breakdown_permission.sql` has already been run for V26.11.02.01, do not run it again. If not, run `infra/sql/062_quote_cost_breakdown_permission.sql` in Supabase before saving the permission.

## Deploy

1. Replace the previous source with V26.11.02.02, keeping local secrets/.env files unchanged.
2. Install dependencies if needed: `pnpm install --frozen-lockfile`.
3. Run `pnpm typecheck` in your local Windows checkout, followed by your normal deployment process.
4. Open **Staff & Roles** and confirm each person shows **Show cost breakdown** beside their **Save** button. Tick the permission and save the applicable staff record.
5. Open **Quotes** with an enabled staff account: **Show cost breakdown** appears separately from **Open client quote**.

## Verification

- TypeScript transpile/syntax check for updated Staff page: PASS.
- `node scripts/tests/staff-responsive-layout.cjs`: PASS (layout structure, form association, permission wiring).
- `node scripts/tests/quote-cost-access.cjs`: PASS (server permission checks and default deny).
- `node scripts/tests/quote-cost-report.cjs`: PASS (six cost report scenarios).
- `node --check scripts/tests/staff-profile.cjs`: PASS (integration test syntax; also updated its browser expectations for the new card layout and narrow screens).
- **Full `pnpm typecheck` / live Chromium integration tests were not run in this environment:** package dependencies are not installed and package registry access is unavailable. Run them in your Windows checkout before deployment. No live Supabase data was modified.
