# Products route crash guard batch

This batch stops the Products menu/page from hard-crashing when one of the product setup data sources fails during housekeeping or schema drift.

## Changed

- Products page now loads products, materials and selected product data with `Promise.allSettled`.
- If one source fails, the page stays open and shows a clear error banner instead of the generic Vercel error page.
- Product template loading is also guarded so a broken/missing configurator template does not crash the whole Products page.
- This is intended as a workflow safety fix while the underlying Supabase/Vercel error can still be inspected in logs if needed.

## No SQL

No new SQL is required.
