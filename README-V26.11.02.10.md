# Production Manager V26.11.02.10

Based on V26.11.02.09. This update focuses on slow Move / Delete operations in Quote lines and redundant quote controls.

## Quote line operations

- **Move** and **Delete** no longer use server actions that redirect to `/quotes` and synchronously rebuild the entire quote page.
- Both use a small, tenant-authorised JSON request to `/api/quotes/line/quick`. Client buttons show a pending state and report success or failure without forcing a navigation.
- Successful deletions immediately remove deleted lines from the visible quote. Related dispatch and access-equipment lines are also deleted, in **one database request**, including legacy parent-child links.
- Successful moves show confirmation immediately; the quote sections are refreshed in the background. The line will appear in its new section when that background refresh completes. This is not a fully optimistic section reorder.
- The API records `[quote-line-quick-action]` with auth, database and server milliseconds. The browser console records `[quote-line-quick-client]` with click-to-response timing. These provide actual live diagnostics on a deployed site.
- The separate **Remove line** button inside an expanded quote line editor has been removed, retaining the Delete line action on the line itself.
- The redundant expanded Sub Jobs management panel is now collapsed under **Manage Sub Jobs**, retaining Rename and Remove Section functions without dominating the quote entry screen.

## Deployment

1. Replace source with V26.11.02.10 while preserving your `.env` values and local deployment configuration.
2. No additional SQL migration is required. Prior schema migrations, including 064 for Sub Jobs, remain required if they have not already been applied.
3. Run `pnpm typecheck` in the Windows checkout and deploy only if it passes.
4. Check browser DevTools and Vercel server logs for the new timing tags while moving and deleting quote lines.
5. Confirm that both parent and linked dispatch/access-equipment lines are removed together and section subtotals update after refresh.

## Verification performed here

- TypeScript/TSX syntax transpilation passed on all changed source files.
- Static checks of the quick action route, tenant-scoped SQL, linked-line deletion, browser feedback and duplicate-control removal passed.
- Existing local test scripts passed for Sub Jobs, quote status polling, courier/delivery pricing, staff layout and quote cost permissions/reporting.
- ZIP content integrity was checked.

**Not verified here:** Live Supabase query timing, browser layout/interaction against a running app, full monorepo `pnpm typecheck` (the source ZIP does not include installed dependencies), or real-world end-to-end latency. The latency improvement is based on removing the forced full-page navigation, not on a claimed measured speedup.
