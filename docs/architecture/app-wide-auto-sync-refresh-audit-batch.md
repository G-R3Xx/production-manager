# App-wide automatic update audit

## Purpose

Production Manager receives changes from staff actions, public client links and connected systems. Every open screen must notice relevant changes without the operator having to discover stale pages individually, while never overwriting unsaved form work.

## Shared behaviour

- Authenticated screens poll one lightweight tenant activity fingerprint every five seconds.
- The fingerprint is built from the latest update time for each available workflow source, not full records or table counts.
- Optional or not-yet-migrated modules are isolated. One missing table cannot disable updates for the rest of the app.
- Checks also run immediately on browser focus, page restore and tab visibility changes.
- A changed fingerprint uses an inline Next.js server refresh. It does not navigate away or show a route loading screen.
- Dirty mutation forms and active content-editable fields postpone refresh until local work is safe.
- Page-specific watchers and the global watcher share a refresh claim so the same update cannot trigger duplicate refreshes.
- Optimistic client controls reconcile with new server props after a refresh instead of continuing to show their original state.

## Audited update paths

| Update source | Database activity covered | Open surfaces updated | Result |
|---|---|---|---|
| Staff enquiry, survey, quote, job and task actions | Enquiries, surveys, quotes, quote lines, jobs and tasks | Dashboard, Calendar, Enquiries, Surveys, Quotes and job workspaces | Covered by the shared tenant pulse |
| Install Scheduler survey callback | Survey request status, returned details/photos and linked job | Surveys, Dashboard, Calendar and job workspace | Covered; Surveys also has a focused five-second fingerprint |
| Public quote view and line/client response | Quote lifecycle and every quote-line response | Internal Quotes, Dashboard, jobs and the public quote itself | Covered; public and internal quote fingerprints include line decisions and MYOB state |
| Public artwork page/final response | Approval lifecycle and every proof-page decision | Artwork workspace, Production, Dashboard, jobs and the public approval itself | Covered; fingerprints include every page decision |
| Artwork proof upload, replacement, reopen and scope sync | Approval and proof page timestamps | Artwork workspace and client approval page | Covered |
| Production checklist and staff allocation | Production jobs, items, steps and job-process assignments | Production, Calendar, Dashboard and job workspace | Covered; local unsaved assignments are preserved |
| Alerts created or marked read | Notification create/read timestamps | Global Alerts popover | Covered; popover state now reconciles after server refresh |
| MYOB queued customer, supplier and material pushes | Local record sync state, mappings, connections and sync runs | Clients, Suppliers, Materials, Purchasing and integration status | Covered; background state transitions now advance `updated_at` |
| MYOB order creation from an accepted quote | Quote MYOB status, mapping and job/order state | Quotes, Dashboard and job workspace | Covered by quote fingerprint and tenant pulse |
| WordPress order ingestion and connection activity | WordPress orders/connections plus created enquiry, quote and production records | Dashboard and linked workflows | Covered |
| Purchasing, products, materials, users and workspace settings | Their tenant-scoped update timestamps | Current authenticated page and dependent workflow screens | Covered |

## Public portal safeguards

- Public quote and artwork pages have token-scoped, no-cache status endpoints that return only a fingerprint.
- They poll every five seconds and on focus/restore/visibility recovery.
- Quote totals, line response controls and artwork page controls now accept refreshed server state.
- First-view writes are idempotent, preventing a view timestamp from changing on every poll and causing a refresh loop.

## Deliberate integration boundaries

- The current worker application is a scaffold, not a scheduled recurring MYOB pull daemon. MYOB background updates in this release are initiated by existing app actions/queues.
- Install Scheduler currently sends Production Manager a survey-completed callback. There is no inbound installation-completed callback in this source, so installation completion is not advertised as automatically synchronised.

These boundaries require integration work, not another browser auto-refresh change.
