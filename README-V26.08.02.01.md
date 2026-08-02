# Production Manager V26.08.02.01

## Loading-performance pass

- Removes database schema-alteration checks from normal read-only page loads. Schema creation and compatibility checks remain on the relevant write/setup paths.
- Product Library uses a compact product-card query and no longer downloads website descriptions or gallery/configuration JSON for every product.
- Quick Quote loads materials, pricing settings and saved-product definitions only after a quote is selected.
- Quick Quote retrieves saved products and their template definitions in one joined query instead of loading two complete catalogues.
- Quick Quote reuses the already-loaded client list instead of making another client lookup after the first request group.
- Product editor loads its template, production resources and price preview concurrently.
- Repeated production-resource reads are request-memoized, removing duplicate recipe/machine/labour queries during the same render.
- Dashboard requests only the active-material count, eight low-stock rows and compact customer-logo records instead of full material and customer catalogues.
- Production and artwork read pages no longer run production-table/schema setup before ordinary reads.

No database migration or WordPress plugin update is required.

Visible application/catalogue version: `V26.08.02.01`.
