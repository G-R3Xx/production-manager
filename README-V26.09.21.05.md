# Production Manager V26.09.21.05

Australian release date: 21 September 2026.

## Quote save performance

- Speeds up quote-line add/edit saves by avoiding a full re-fetch of low-volatility quote reference data after every save.
- Materials, saved products, customers, logos, company pricing settings, MYOB sales defaults, processes, machines, labour and production recipes now use short-lived server data caching in the quote workspace.
- Artwork approval and production-job lookups use a shorter cache because their status changes more often.
- Quote drafts and quote lines themselves remain uncached, so the saved line and totals still reload from the database immediately.
- Quote-line schema readiness checks now run in parallel on a fresh server instance instead of serially.

No database migration is required for this release.

## Expected effect

The quote page already loads the reference data before a user edits or adds a line, so subsequent line saves can reuse that data instead of repeating the entire reference-data load. This specifically targets the long pause after clicking Save/Add on a quote line.
