# Production Manager V26.11.05.08 — Simplified Completion Calendar + Gantt Staff Assignment

**Base:** V26.11.05.07. No new SQL migration. Existing migration `065_project_timelines.sql` is still required for Projects if not previously applied.

## Main Calendar: job completion dates only

The Main Calendar has been simplified to show **one entry per Production Job**, placed on its **Completed by** date (`production.production_jobs.due_date`). It no longer renders individual production procedures, job-process assignments, generic tasks or Gantt task bars. Project Timeline retains detailed task scheduling.

The monthly calendar supports previous/next month, Today, job/customer search, optional completed-job display, and an expandable list of jobs without an assigned deadline. Click a job to set or clear its completion date (workspace owners/managers) or open its Production Job or Project Timeline.

The calendar now uses a small, tenant-filtered production deadline query, not the old heavy combination of production steps, assignments, jobs and project task records.

## Completion-date synchronisation

The Project Timeline now includes a **Completed by** date field above the Gantt chart. The Calendar and Project Timeline read and write the same existing Production Job due-date field. Updating it also updates the linked workflow job's due date. No duplicated deadline is created.

On two open browser tabs, changed deadlines broadcast immediately via `pm-completion-date`. Other staff/browser sessions refresh while visible (Calendar approximately 45 seconds; open Project completion-date editor approximately 60 seconds). This is near-live polling, **not true push synchronisation**. Stale simultaneous edits return a conflict message rather than overwriting the other user's change.

**Important:** Shifting or resizing an individual Gantt task does **not** change the overall completion date. This is deliberate: the deadline represents the agreed job target, not the end of the latest scheduled task. Set the completion date explicitly from either view.

The pre-existing Production Job due-date editor still controls the same Production Job field.

## Quick assignment on the Gantt chart

Every Gantt task now has a direct **Assign staff** dropdown for owners/managers. Staff selection saves immediately to the existing timeline task record and does not change its scheduled period, allocated hours, status, or its linked production checklist completion state. A compare-and-swap check detects another user changing the same assignment.

## Security and performance

- Date updates require an authenticated, active owner/manager in the job's workspace; read-only staff can view deadlines.
- A date update is scoped to the workspace and job, checks the prior saved date, and won't update a deleted job.
- The simplified Main Calendar has no per-task scheduling APIs; stale unused calendar-task routes/components were removed.
- The per-project due-date refresh reads one job row rather than reloading all quotes or production steps.
- Existing Gantt task drag/resize and allocated-work-hour functionality is retained.

## Verification completed

- New completion-date tests: **5 passed** (date validation, calendar month boundaries, single-source due date, role/conflict wiring, Gantt staff wiring).
- Existing Project Timeline tests: **14 passed**.
- Existing Sub Jobs, material table add-ons, standard cutting, Courier/Delivery, quote-line actions and accepted-quote MYOB recovery regression tests passed.
- Isolated strict TypeScript checks passed for the new Calendar, Project completion editor and Gantt component using local interface stubs; changed TypeScript/TSX files also passed transpiler syntax checks.
- **Not verified in this environment:** full `pnpm typecheck`, live Supabase permissions/queries, browser interactions and multi-user cross-device timing. Run locally and test before deploying.

## Installation

1. Extract the ZIP over the V26.11.05.07 source, retaining your `.env` files.
2. Confirm migration 065 is already applied (if Projects/Gantt already works, it should be).
3. Run `pnpm typecheck` and your normal deployment/build process.
4. Check a Production Job's Due date → Main Calendar → Project Timeline Completed by, and edit from the Calendar and Project screens.
5. Assign a staff member from the Gantt row dropdown, and verify the assigned name persists.

**No additional SQL migration required.**
