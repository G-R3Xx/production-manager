# Production Manager V26.10.21.02

## Dashboard performance audit and refactor

The dashboard first-render path was doing substantially more work than the UI suggested.

### Root causes found

1. **Five tenant-wide dashboard reads were started together, but Vercel's Postgres pool is capped at two connections.**
   - active jobs
   - every job process assignment
   - full staff records
   - every customer logo summary
   - separate job metadata / quote-line aggregation

   In practice these queued in multiple DB waves rather than running truly in parallel.

2. **Loading the dashboard performed a database write.**
   `listJobProcessAssignmentsForTenant()` called `syncInheritedJobProcessDefaultsForTenant()` before reading assignments, causing an INSERT/UPSERT across jobs every time the dashboard opened.

3. **Workflow reconciliation checking blocked first render.**
   The dashboard waited for a large EXISTS/UNION query over enquiries, surveys, quotes, artwork approvals and production jobs before returning the current job list. The actual reconciliation was already background work, but the expensive "do I need it?" check was still blocking.

4. **Dashboard metadata scanned more data than needed.**
   Job type / logo enrichment was assembled in separate reads, including a full customer-logo list and a separate quote-line aggregation.

5. **The dashboard did not explicitly prefer the Sydney Vercel region.**
   Quote save endpoints had already been moved to Sydney for latency, but the main authenticated app/dashboard had not.

6. **Each table row had its own client component/router/state hook solely to provide hover + click navigation.**
   This is not the main 10-second-class problem, but it adds avoidable hydration work as the active-job list grows.

### Changes

- Added a dedicated dashboard read model in `server/dashboard.ts`.
- Active jobs, current process assignment, enquiry/survey metadata, quote-line type metadata and client logo are now read in one dashboard query.
- Active staff filter options use one small second query. These two reads fit the Vercel pool's two-connection limit and execute together.
- Removed the inherited-assignment write from dashboard loading. Inherited artwork assignment propagation now happens when task defaults are saved / workflow jobs are synchronised.
- Moved workflow consistency checking fully into `after()` so it is no longer part of first render; throttled per tenant on warm instances.
- Added Sydney (`syd1`) preference to the authenticated app shell, dashboard and optional weather API.
- Removed per-row `DashboardJobRow` state/router instances and replaced them with one delegated table click/keyboard handler.
- Added DB migration `054_dashboard_read_indexes.sql` for the dashboard read path.
- Added diagnostic logs:
  - `[app-shell]`
  - `[dashboard-snapshot]`
  - `[dashboard-page]`
  - `[dashboard-reconcile]`

These logs expose auth, workspace lookup, job query, staff query, full snapshot and page render timings plus the Vercel region.

### Expected impact

The critical dashboard path falls from roughly **8 database statements / several pool waves plus a blocking reconciliation check** to:

1. cached/local auth verification + one workspace membership lookup when required;
2. one DB wave containing the dashboard snapshot query and lightweight staff query.

Weather, alerts, app-pulse checks and workflow reconciliation remain non-critical background work after the dashboard can paint.
