# Production Manager V26.11.02.07 — Sub Job TypeScript build fix

**Base:** V26.11.02.06. **No database migration.** If you have not already applied migration 064 for the Sub Jobs feature, apply `infra/sql/064_quote_sub_jobs.sql` before deploying.

## Fix

The prior release failed the web TypeScript check at `apps/web/src/server/quotes.ts` (lines 1056 and 1062), with four TS2339 errors: `subJobId` did not exist on the inferred type of `mainSnapshot`.

The underlying quote configuration is a `Record<string, unknown>`, which can include a Sub Job identifier and other saved product configuration fields. `mainSnapshot` is now explicitly typed `Record<string, unknown>`. This fixes the incorrect narrow inference while retaining the runtime `typeof ... === "string"` guards when the Sub Job ID is inherited by linked dispatch and access-equipment lines.

There is **no database, pricing, quote-line ID, or schema change**. The visible app version is updated to V26.11.02.07.

## Verification

- **Passed:** isolated `tsc --strict --noEmit` using the actual three snapshot expressions extracted from `quotes.ts`, including the two problematic `subJobId` references.
- **Passed:** `scripts/tests/quote-sub-jobs.cjs`, now extended with a runtime assertion that parent, dispatch and access-equipment snapshots retain the Sub Job ID and correct parent-line links.
- **Passed:** `scripts/tests/quote-status-performance.cjs`, `dispatch-pricing.cjs`, `quote-cost-access.cjs`, `quote-cost-report.cjs`, `staff-certificates.cjs`, and `staff-responsive-layout.cjs`.
- **ZIP integrity:** verified with archive CRC checks.
- **Not completed in this environment:** full monorepo `pnpm typecheck` / application build or live browser/database verification. The distributed source archive intentionally does not include `node_modules`. Running the web typecheck without dependencies produced missing Next.js/React module errors and is not an authoritative full check.

## Install

1. Replace your local Production Manager source with V26.11.02.07 (preserve your existing `.env` files and any local custom changes).
2. Run `pnpm typecheck` from your `production-manager` root.
3. If successful, deploy using your normal procedure. There is **no new SQL migration** for this version.

Previous features including Sub Jobs, courier/delivery pass-through pricing, cost breakdown access and training/certificate alerts are retained.
