# Production Manager V26.08.10.10

## Artwork workspace follow-up

- Approval jobs are now sorted strictly by latest activity, newest first, regardless of draft/sent/viewed/approved status.
- Sync quote lines is now a true refresh, not add-missing-only. It refreshes existing quote-linked proof slot title, quantity, size, stock, colour/print, finishing and other production summaries from the current approved quote scope.
- Existing uploaded proof artwork is preserved while quote-derived production details are refreshed. Placeholder proof artwork is regenerated when its quote line changes.
- Missing approved artwork lines are still added automatically; cancelled/out-of-scope proof pages remain preserved for history.
- Sync now gives an explicit result message showing how many proof slots were added/refreshed and touches the artwork job activity time so it moves to the top of the job rail.
