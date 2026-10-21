# Production Manager V26.10.21.03

## Site-wide performance pass

This release follows the V26.10.21.02 Dashboard audit with a broader review of the authenticated Production Manager application. The goal is to remove background request amplification, database writes from read paths, avoidable full-record loading, request-time schema maintenance, N+1/correlated queries and remote-service calls that block normal navigation.

### Main findings

1. **Navigation was generating work the user did not request.** The global route transition component had been pre-rendering several heavyweight workflow pages after navigation, and normal Next.js links could also prefetch dynamic database-backed routes as they entered the viewport. Sidebar hover could start additional route renders immediately.
2. **Read paths were performing writes.** Dashboard/task-assignment and production-step readers could materialise inherited defaults or production steps while a page was opening. Enquiry reconciliation, artwork legacy proof repair and MYOB order backfill could also block normal reads.
3. **The database pool was too small for pages that legitimately have independent reads.** With two Vercel connections, Promise.all often still executed in several waves. Supabase managed-pooler deployments now default to six PM connections; direct PostgreSQL remains conservative and `PM_DB_POOL_MAX` can override it.
4. **Some workflow pages loaded complete tenant-wide records just to display a name, logo, staff option or count.** Dedicated lightweight read models now cover dashboard, quote customer options, production logo summaries, survey logos, active staff options and MYOB/local counts.
5. **Polling/refresh traffic was multiplied across the app.** Global pulse checks ran on pages that already had their own narrow status watcher, and Materials also performed an unconditional timed RSC refresh. Polling is now scoped and less frequent.
6. **Several request paths still performed schema inspection/DDL on cold serverless instances.** Production now trusts checked-in migrations by default. Legacy self-healing is retained for local development or `PM_RUNTIME_SCHEMA_FALLBACK=1`.
7. **A few database patterns scaled poorly with job volume.** Production step summaries used multiple correlated subqueries per job and invoice lines could be fetched N+1. These are now aggregated/batched.
8. **Normal pages could block on external MYOB calls.** Purchasing and Quotes already gate remote reference lookups behind explicit setup UI; Company MYOB price-level names are now cached for one hour instead of being fetched from MYOB every visit.

## Changes in this pass

- Removed the global eight-route background prefetch storm.
- Disabled automatic Next.js Link prefetch on database-heavy app content links. Sidebar navigation uses a single 220 ms hover-intent prefetch instead of immediate/multiple prefetches.
- Changed Supabase middleware routing checks from network `getUser()` to session inspection. Security-sensitive server pages/actions continue to verify authenticated claims/user state.
- Root and authenticated app route segments prefer Vercel Sydney (`syd1`).
- Managed Supabase pooler default raised to 6 connections; direct database connections remain at 2. Warm idle connections are retained for 120 seconds with TCP keepalive.
- Added `[db-slow-query]` instrumentation with SQL preview, elapsed time and pool waiting/idle counts. Production threshold defaults to 750 ms and can be changed using `PM_DB_SLOW_QUERY_MS`.
- Scoped global workflow pulse to Dashboard/Jobs, Calendar, Enquiries and Production. Quotes, Surveys and Artwork keep their narrow status watchers instead of also scanning the entire workflow.
- Reduced Quotes/Surveys/Artwork/public portal status polling to 10 seconds; pending-state browser activity requests reduced from 2 to 5 seconds.
- Removed the 60-second unconditional Materials page RSC refresh. Supabase Realtime plus focus refresh remain.
- Dashboard uses one purpose-built snapshot plus a small staff read; reconciliation runs after the response and assignment propagation no longer happens on Dashboard reads.
- Enquiry workflow reconciliation runs after the response instead of blocking GET.
- Artwork legacy proof-page self-healing runs after the response.
- Production MYOB order backfill runs after the response.
- Removed inherited job-process/default-assignment writes from assignment readers.
- Removed RIP/default-assignment writes from production-step readers. They are now materialised when production records are created/synchronised.
- Calendar uses lightweight active staff rows and pre-groups process assignments by job instead of filtering the full array for every job.
- Added lightweight customer options for Enquiries/Quotes rather than loading complete MYOB/customer payloads.
- Quote entry layout is returned with the active tenant membership, removing a separate quote-layout DB query.
- Added active-only lightweight quote material rows. Quote workspace no longer transfers archived materials, MYOB payload JSON or unused material cost blobs.
- Quote visual and labour-operation schema checks no longer run request-time information_schema/ALTER work in production.
- Production list no longer loads all quotes, customers and enquiries just to resolve customer logos.
- Production step summaries aggregate production steps once in a CTE rather than running three correlated subqueries per job.
- Artwork list uses quote summaries + lightweight logo summaries instead of full quote/customer/enquiry datasets.
- Integrations local counts use one counts query; mappings/sync-run histories are bounded.
- Invoice lines use one batch query instead of one query per invoice.
- Surveys use a dedicated client-logo summary query instead of full customer/enquiry tables.
- Job/Calendar/Production staff selectors use a lightweight active-staff read model.
- Company MYOB custom price-level names are cached for one hour rather than fetched remotely on every page visit.
- Domain auto-join schema setup is now memoised per warm server instance instead of executing CREATE TABLE/INDEX and seeding on every call.

## Database migrations

- `054_dashboard_read_indexes.sql` — dashboard read indexes from V26.10.21.02.
- `055_site_performance_indexes.sql` — tenant-first indexes for workflow pulse, jobs, quotes, artwork, production, purchasing and frequently sorted master data.
- `056_quote_visual_categories.sql` — moves quote visual category column creation out of normal request paths.

Production should run the checked-in migrations as part of deployment. Runtime self-healing remains available for development/legacy recovery with `PM_RUNTIME_SCHEMA_FALLBACK=1`.

## Performance diagnostics after deploy

Useful Vercel log events:

- `[app-shell]` — auth/workspace shell timing.
- `[dashboard-snapshot]` — Dashboard snapshot/staff query timing.
- `[dashboard-page]` — Dashboard auth, tenant and snapshot timing.
- `[dashboard-reconcile]` — background workflow reconciliation timing.
- `[db-slow-query]` — any PostgreSQL query over the configured threshold, including pool pressure.
- `[quote-line-save]` / `[quote-line-save-client]` — quote save server/browser breakdown.
- `[quote-email-api]` — quote email/PDF send timing/errors.

Target behaviour after warm-up is roughly: ordinary navigation under 1 second, cold page loads under 2 seconds where possible, and normal database saves well under 1 second. External operations such as MYOB, PDF generation and SMTP are kept out of normal page-load critical paths wherever possible.

## Validation

- All 257 non-declaration TypeScript/TSX files under `apps/web/src` and `packages/db/src` passed TypeScript `transpileModule` syntax validation after this performance pass.
- All `<Link>` elements in the web app now make an explicit prefetch decision; no database-heavy content link is left on default viewport prefetch.
