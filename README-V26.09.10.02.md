# Production Manager V26.09.10.02

Performance pass 2. This build focuses on the remaining 3–4 second page-load delay reported on client PCs, with Purchasing as the highest-priority bottleneck.

## Purchasing critical-path cleanup

- Purchasing no longer downloads the complete MYOB General Ledger account and tax-code collections on every page visit.
- MYOB purchasing reference data is fetched only when **Change MYOB setup** is explicitly opened.
- The page no longer loads full material records (including large MYOB payload JSON) just to populate the material picker.
- Materials are queried only for the selected supplier (plus shared materials) using a lightweight projection.
- Supplier rows use a lightweight purchasing-specific query instead of loading full supplier MYOB payloads.
- PO history/document queries are deferred until **Load history** is clicked.
- Selecting a PO uses Next.js client navigation and the selected PO is reused from the already-loaded list rather than being queried twice.
- Removed an unused company-settings query from Purchasing.

## Runtime schema-check overhead removed from production reads

Older builds intentionally performed `information_schema`, `ALTER TABLE`, `CREATE INDEX`, and related defensive schema checks in normal request paths. These were useful while the database was changing rapidly, but serverless cold starts could pay several database round trips before real page data was queried.

V26.09.10.02 trusts the checked-in SQL migrations in production. Local development retains the legacy self-healing checks automatically. Set `PM_RUNTIME_SCHEMA_FALLBACK=1` only if a production deployment temporarily needs the old fallback behaviour.

Migration `048_runtime_schema_hardening_and_purchasing_performance.sql` moves remaining purchasing/MYOB-sales schema pieces into the normal migration path and adds the selected-supplier material lookup index.

## Quote-page integration cleanup

- Normal quote page GETs no longer attempt a MYOB Order backfill over the network.
- Accepted quote/order creation remains in the actual acceptance workflow/actions.
- Legacy or failed MYOB Orders use the existing explicit retry control.
- MYOB sales-account reference data now loads only when the fallback account is actually needed and the user explicitly opens MYOB account setup.

## Expected effect

The biggest improvement should be Purchasing because its normal render now stays within Production Manager/Postgres and no longer waits for live MYOB collection reads. Other pages should also benefit, especially after cold starts, from removing defensive production-time schema DDL/readiness checks.

App version updated to **V26.09.10.02**.
