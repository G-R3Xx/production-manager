# Production Manager V26.10.19.18

Australian release date: 19 October 2026.

## Quote-line save performance

- Adds a fast quote-line save path for Quick / Custom and Saved Product builders.
- Quote-line save no longer waits for a full `/quotes` redirect and complete Server Component workspace rebuild before returning control to the user.
- After the database write succeeds, the editor/modal closes immediately and the quote workspace refreshes in the background.
- Main quote lines plus linked Delivery / Install and Access Equipment lines are written as one bundled PostgreSQL statement instead of several sequential read/update/insert round trips.
- Editing no longer re-reads the quote line simply to discover linked child IDs; the saved configuration snapshot carries those links into the bundled save.
- Saved-product fast saves avoid an extra product lookup. The bundled SQL only accepts a product ID that belongs to the active tenant.
- Save buttons show `Saving…` and prevent duplicate submissions while the write is in flight.
- Fast saves emit a server log entry with `elapsedMs` (`[quote-line-save]`) so any remaining database/auth latency can be measured directly in Vercel logs.

## Compatibility

- The previous server-action save remains in place for other workflows; the quote builders use the new fast path.
- Existing quote configuration snapshots, linked service lines, pricing snapshots, survey context and client-response reset behaviour are retained.
- V26.10.19.17 image/performance fixes are retained.
