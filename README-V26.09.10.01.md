# Production Manager V26.09.10.01

## Performance & data-growth pass

This build is a performance-focused cleanup. It deliberately avoids changing the approved workflow or visual design.

### Faster Job Workspace loading
- Job history no longer loads the tenant's complete enquiry, survey, quote, artwork and production collections just to build one job timeline.
- Timeline generation now retrieves only records linked to the current job, and the Job Workspace reuses records it already loaded instead of querying them again.
- This removes a query pattern that would otherwise become progressively slower as historical data grows.

### Lighter quote pages on client PCs
- Existing quote-line editors are now deferred until a staff member actually expands a line.
- The heavy Add quote line configurators are deferred until the Add quote line section is opened.
- Saved-product and Quick/custom configurators are split so the large custom builder is not loaded unless it is actually selected.
- This reduces JavaScript parsing/hydration work on normal quote viewing, particularly on older office PCs.
- Client logos and non-critical survey thumbnails now use lazy/asynchronous image decoding so they do not compete with the main page content.

### Faster in-app navigation
- High-use internal navigation on Quotes, Production, Clients, Materials, Settings and Job Workspace now uses Next.js client navigation instead of forcing a complete browser document reload.
- Dense record lists disable automatic prefetch to avoid generating a burst of unnecessary background requests.

### Data-growth indexes
- Added `infra/sql/047_performance_growth_indexes.sql` for jobs, tasks, quote lines, invoices and products.
- Runtime-created Job Workspace tables also create their matching indexes automatically.
- The migration is safe to run repeatedly.

### Deployment
- Apply `infra/sql/047_performance_growth_indexes.sql` as part of the normal database migration deployment for the full performance benefit.
- No workflow data conversion is required.

App version updated to **V26.09.10.01**.
