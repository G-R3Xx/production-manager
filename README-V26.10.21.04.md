# Production Manager V26.10.21.04

## Shared stock / sales variants

- One physical material/SKU can now back multiple sales materials.
- Materials editor adds **Physical stock source** and **Sales markup multiplier**.
- Sales variants inherit supplier, SKU, purchase cost, dimensions, purchase UOM, stock UOM and stock-on-hand from the physical stock item.
- Quote builders use the sales variant name/image and its optional material-specific markup while costing from the shared physical stock.
- Purchasing and MYOB material sync resolve variants back to the physical stock item, preventing duplicate supplier/MYOB inventory items.
- Bulk MYOB material sync and Material Price Manager operate on physical stock records only.
- Dashboard low-stock warnings only count physical stock records.

## Database

Run `infra/sql/057_material_shared_stock.sql` in Supabase before deploying this build. The same idempotent migration is also mirrored at `packages/db/drizzle/057_material_shared_stock.sql`.
