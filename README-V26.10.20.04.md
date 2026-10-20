# Production Manager V26.10.20.04

Australian release date: 20 October 2026.

## Quote-line save performance — direct fast path

This update replaces the quote builders' Next.js Server Action save call with a dedicated minimal JSON/API mutation path so saving a line no longer has to travel through the Server Action/RSC response pipeline.

- Quick / Custom and Saved Product quote lines now POST directly to `/api/quotes/line`.
- The quote save endpoint is pinned to Vercel Sydney (`syd1`) for the Canberra/Sydney Production Manager workspace.
- Quote-save POSTs bypass the duplicate middleware Supabase Auth lookup; authentication is still performed inside the save endpoint.
- Server authentication now prefers Supabase cryptographically verified JWT claims and only falls back to `auth.getUser()` when claims cannot be verified locally, removing an avoidable Auth network round-trip on current Supabase Auth projects.
- The Postgres pool now keeps a small warm connection pool for up to two minutes on Vercel instead of discarding idle connections after ten seconds. This is important because configuring a quote line normally takes longer than ten seconds.
- Vercel's quote-save pool remains deliberately small (`max: 2`) and enables TCP keep-alive to avoid exhausting Supabase/Postgres connections.
- The global full-screen route/form loading overlay is explicitly disabled for quote-line save forms. These forms already have their own Saving state; previously the global submit listener could make a completed async save still appear blocked.
- The main quote line plus linked Delivery / Install / Access Equipment lines remain one authorised PostgreSQL statement.

## Save diagnostics

The quote save response now breaks database time into:

- schema readiness
- pool/connection wait
- SQL execution
- authentication
- total server time
- browser request time
- Vercel execution region

Browser console output remains under `[quote-line-save-client]`, while Vercel logs use `[quote-line-save-api]`. The API response also includes a `Server-Timing` header so the same timings are visible in browser Network diagnostics.

These timings make any remaining delay attributable to a specific layer rather than the generic "save took 10 seconds" path.

## Compatibility

- No database migration is required.
- Quote snapshots and existing quote lines are unchanged.
- V26.10.20.03 quote catalogue imagery and V26.10.20.02 client-description fixes are retained.
