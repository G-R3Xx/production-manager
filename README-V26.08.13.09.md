# Production Manager V26.08.13.09

## MYOB full pagination

This build keeps the working V26.08.13.08 OAuth and `/accountright/Info` fix and removes the remaining single-page limits from MYOB collection reads.

### Changes

- Added a shared MYOB collection paginator using MYOB `NextPageLink`.
- Requests use `$top=1000`, the maximum documented MYOB page size, then follow every `NextPageLink` until the collection is complete.
- Read-only MYOB sync now reports the real total number of customers, suppliers and items instead of only the first 50.
- Customer import now imports all MYOB customers.
- Supplier import now imports all MYOB suppliers.
- Item import now imports all MYOB items.
- Item Price Matrix import now follows all pages so MYOB Price Level A-F / quantity-break pricing is not limited to the first page.
- Purchasing account and tax-code reference reads are also paginated.
- Pagination validates that every `NextPageLink` remains on a trusted MYOB API host and inside the selected company file, detects repeated links, and has a hard page-count safety limit.
- If an access token refresh occurs during a multi-page read, the refreshed token is reused for subsequent pages rather than repeatedly retrying the expired token.

### Preserved

- Working MYOB OAuth/token refresh flow and global `/accountright/Info` request.
- PM Clients ↔ MYOB Customers, PM Suppliers ↔ MYOB Suppliers, PM Materials ↔ MYOB Items.
- PM → MYOB push workflow.
- MYOB Price Levels A-F pricing model.
- Purchasing section and MYOB Item Purchase Order work.
- Existing quote, artwork, labour, bleed/spacing, WordPress and production workflows.

### Validation

- Modified TypeScript/TSX files transpile successfully with TypeScript 5.8.3.
- Static pagination assertions verify `NextPageLink`, `$top=1000`, customer/supplier/item/item-matrix pagination and purchasing reference pagination.
- Full `pnpm typecheck` cannot run in the source-only ZIP because `node_modules` is absent and pnpm is unavailable in the build environment.
- Final archive is tested with `unzip -t` and contains the required top-level `production-manager/` folder.
