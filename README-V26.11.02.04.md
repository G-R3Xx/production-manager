# Production Manager V26.11.02.04 — Performance diagnosis and reduced quote polling load

**Base:** V26.11.02.03. All existing features retained, including Courier/Delivery pass-through pricing, quote cost reports, staff-card permissions and client-company contacts.

## Confirmed source-code issue addressed

The active quote screen requests `/api/quotes/[id]/status` about every 10 seconds. In V26.11.02.03 that endpoint loaded the complete `sales.quote_drafts` record and each `sales.quote_lines` row, including the potentially large `configuration_snapshot` JSON, to compute a fingerprint from a handful of status fields.

V26.11.02.04 replaces those full-data reads with a **tenant-scoped status projection** plus compact line-status fields. The UI still receives the same fingerprint, status and updatedAt response. Parent/child quote-line ordering is preserved exactly so merely switching to the optimised endpoint does not trigger spurious refreshes. Normal quote editing, saving, PDF/export and pricing continue to use their original full-data query paths.

This reduces data transferred from Postgres to the application by each background status check, **but does not prove that this was the only cause of slow interactive page loads**. That requires real production timing from Vercel and Supabase.

## Diagnostics added

- `/api/quotes/[id]/status`: `Server-Timing` header with `auth`, `workspace` and `quote-status-db` timings. Log `[quote-status-timing]` for slow requests (> 750 ms total or > 500 ms read).
- `/api/app-pulse`: `Server-Timing` with `auth`, `workspace` and `activity-db` timings. Log `[app-pulse-timing]` for slow background activity checks.
- Quote page: `[quotes-page-timing]` logged if the main data load exceeds 750 ms, with draft, line, material and client counts (no customer or contact details).
- Existing `[app-shell]`, `[dashboard-page]`, `[dashboard-snapshot]` and `[db-slow-query]` logging remains available.
- Visible build version label updated to V26.11.02.04 (it was still showing V26.10.28.01).

## Production verification after deploy

1. From your Windows checkout, run `pnpm typecheck`, followed by your normal build/deployment checks. **The full workspace typecheck was not run in the packaging environment** (dependencies are absent in the source archive).
2. Open a quote and leave it on screen for one minute. Confirm no quote reload occurs without a real update; another staff member changing a quote should still trigger the usual refresh.
3. Open Chrome DevTools → **Network**, select an `/api/quotes/.../status` request and review **Timing** and the `Server-Timing` response header. Note the payload size and the request time.
4. If the app remains slow, collect Vercel function logs around the lag using the tags above, especially `[app-shell]` and `[db-slow-query]`. Compare `authMs`, `workspaceMs`, `dbMs` and request total. This determines the *measured* bottleneck before changing infrastructure or adding more indexes.
5. Check existing Supabase indexes/migrations **054** and **055** have been applied if slow queries show missing index usage. No new migration accompanies this release.

No SQL migration required. No pricing, permission or dispatch behaviour has been changed.

## Checks performed here

- New quote status test: parent/child line ordering matches the original full quote line list, status fingerprint parity, empty/unknown quote and tenant filter, compact field selection and payload-size regression.
- Existing regression tests: Courier/Delivery pass-through pricing, quote-cost report, cost-report permission gating and responsive staff settings all passed.
- TypeScript/TSX transpile syntax checks passed for modified files.
- Full `pnpm typecheck`, live Supabase timing, Vercel timing and full browser validation are outstanding; do not treat these as tested.
