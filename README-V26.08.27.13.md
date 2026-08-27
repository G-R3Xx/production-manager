# Production Manager V26.08.27.13

## Performance pass

- Removed the global workflow activity scan and alerts query from the critical server-render path, so navigating to a page no longer waits for those background services before the requested screen can render.
- Alerts now load independently after the page is visible and refresh quietly in the background.
- Global cross-user/background refresh checks are throttled and reduced from an aggressive 5-second database-wide poll to a lightweight workflow-only safety check.
- The global activity fingerprint now watches active workflow records only (enquiries, surveys, jobs, quotes, artwork, production and purchasing) instead of repeatedly scanning master data and integration tables that do not need live page refreshes.
- Concurrent activity-pulse requests for the same workspace are deduplicated and briefly cached on the server to prevent multiple open screens/tabs from repeating the same database work.
- The dedicated large-screen Production Board keeps its existing 45-second refresh cadence instead of also running the normal global interval in parallel.
- The first background pulse after navigation establishes a baseline only; it cannot immediately trigger a second page reload.
- Existing unsaved-edit protection remains in place. Background refreshes still pause while staff are editing a form.

No database migration is required for this performance update.
