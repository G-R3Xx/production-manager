# Production Manager V26.10.22.01

## Machine save reliability + speed

- Machine edits now save through a dedicated Sydney API endpoint instead of a Server Action/RSC mutation.
- Machine names update immediately in the equipment card after a successful save.
- The edit dialog no longer closes before the save result is known.
- Server-rendered machine data refreshes in the background after the visible UI has already updated.
- Added `[machine-save-api]` and `[machine-save-client]` timing diagnostics for auth, database and total request time.
- Fixes edits such as removing `TEST -` appearing not to persist because the page was still displaying stale server-rendered values.
