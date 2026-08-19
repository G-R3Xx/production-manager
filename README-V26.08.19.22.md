# Production Manager V26.08.19.22

- Completes an app-wide audit of automatic updates instead of fixing stale screens one at a time.
- Adds a resilient five-second tenant activity pulse covering enquiries, surveys, quotes and lines, artwork and proof pages, jobs, tasks, assignments, production, alerts, clients, suppliers, materials, products, purchasing, MYOB and WordPress activity.
- Isolates optional or partially migrated database modules so one unavailable table cannot stop every screen from updating.
- Refreshes inline on changes and on browser focus, page restore or tab visibility recovery, without route navigation or full-page loading screens.
- Protects unsaved mutation forms and coordinates global/page-specific watchers to avoid interrupted edits and duplicate refreshes.
- Adds automatic status updates to the public quote and artwork approval pages.
- Keeps public quote totals, quote-line decisions, artwork page decisions, alerts and production/staff assignment controls in sync with refreshed server state.
- Makes quote and artwork first-view writes idempotent, preventing repeated refresh loops.
- Makes MYOB background customer, supplier and material sync transitions visible by updating their activity timestamps.
- Replaces blind timer-based full refreshes on the Dashboard, production board and pending-sync controls with lightweight activity checks.
- Documents the two current integration boundaries: no scheduled MYOB pull daemon and no Install Scheduler installation-completed callback.
