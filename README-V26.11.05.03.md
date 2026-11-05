# Production Manager V26.11.05.03

Based on V26.11.05.02. Adds editing of quote finishing add-on eligibility to the **Material Price Manager** spreadsheet/table view.

## Materials table

- Adds **Quote add-on** (enable/disable) and **Base products** (multi-select chooser) immediately beside the **Quote category** column.
- The Base products column shows the selected product names (e.g. `Corflute signs`) rather than just a count.
- Clicking Base products opens an accessible dialog with the same product groups as the existing Material Card editor; it doesn't enlarge or clip the table row.
- Selecting a base product enables the add-on; removing the last product disables it. The add-on checkbox is also directly editable.
- Changes are highlighted as unsaved and applied with the **Save changes** button, along with other edited material fields. Unsaved changes can be discarded.
- New and duplicated material rows also support add-on settings.
- Saving add-on settings updates the existing JSON fields on the same material record. No additional database table or migration is required.
- The existing material-card editor and quotes page are revalidated after add-on changes. Unrelated price saves retain the previous lightweight no-full-refresh behaviour.

## Data safety

- Server-side batch save validates allowed base product keys and rejects enabled add-ons without a product selection.
- The insert/update SQL writes `quoteAddOnEnabled` and `quoteAddOnProducts` through tenant-scoped material writes in the existing transaction; other `cost_json` settings are retained.
- Disabling an add-on removes the associated product selections; it does not delete the material.
- Historical quotes are not repriced. The special Eyelets workflow remains unchanged.

## Verification

- `scripts/tests/material-price-manager-addons.cjs` **passed** (TS/TSX parser, grid controls, real bulk-save function with mocked PostgreSQL transaction, valid/invalid products, insert/update, disabled, rollback).
- `scripts/tests/material-finishing-addons.cjs`, `quote-sub-jobs.cjs`, `quote-status-performance.cjs`, `quote-line-quick-actions.cjs`, `quote-cost-report.cjs`, `accepted-quote-client-recovery.cjs`, and `quote-sub-job-heading.cjs` **passed**.
- `tsc --noEmit --strict --target es2022 --module commonjs --moduleResolution node scripts/tests/material-addon-label-types.ts` **passed**.
- Full `pnpm typecheck` not run in this container because source ZIP does not include installed Next.js/React workspace dependencies. Run it from your local project checkout before deployment.

## Installation

Replace your checkout with this release, preserving your local environment settings, then run:

```powershell
pnpm typecheck
```

Deploy once the full check passes. No SQL migration required.
