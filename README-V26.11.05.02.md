# Production Manager V26.11.05.02

Based on **V26.11.05.01**. This is a TypeScript compilation correction for the configurable finishing material add-ons.

## Fix

- Corrected `apps/web/src/app/(app)/materials/page.tsx`, line 231, which converted the keys of `QUOTE_FINISHING_PRODUCT_GROUPS` to the broad `string` type through `String(option.key)`.
- `material.quoteAddOnProducts` is an array of the restricted `QuoteFinishingProductKey` union, so the earlier code triggered `TS2345: Argument of type 'string' is not assignable to parameter of type ...` during the web package typecheck.
- The product keys now retain their strongly typed literal union (`option.key`). Material card labels remain the same, and add-on selection, pricing and saved data are unchanged.
- Updated the displayed application version to **V26.11.05.02**.

## Verification

Passed in the provided source environment:

- Strict TypeScript compile of the finishing-product label expression and its imported definitions: `tsc --noEmit --strict --target es2022 --module commonjs --moduleResolution node scripts/tests/material-addon-label-types.ts`.
- TypeScript parser/transpiler syntax checks of the Materials page and application layout.
- `scripts/tests/material-finishing-addons.cjs` (including a regression guard against converting keys to generic strings).
- `scripts/tests/quote-line-quick-actions.cjs`, `quote-sub-jobs.cjs`, `quote-sub-job-heading.cjs`, `quote-cost-report.cjs`, `dispatch-pricing.cjs`, `quote-status-performance.cjs`, and `accepted-quote-client-recovery.cjs`.
- Source archive integrity and SHA-256 checksum.

**Full monorepo `pnpm typecheck` has not been run here.** The source archive does not include installed workspace dependencies, so verify it in the local development checkout before deploying.

## Upgrade

1. Replace the source files with V26.11.05.02.
2. Run `pnpm typecheck` at the repository root; then build/deploy using your normal workflow.
3. Verify the Materials page shows Stutcards configured for Corflute signs and it is offered in the quote finishing step.

**No SQL migration required.** Do not rerun migrations for this fix.
