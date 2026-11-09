# Production Manager V26.11.09.03 — Gantt save overlay fix

Based on V26.11.09.02. **No database migration required.**

## Root cause confirmed from live timings

The user's live logs showed `authMs:39`, `writeMs:29`, `readMs:15`, `totalMs:83`, `responseMs:190` and `ui-visible-ms:210`. Those results show that authentication, database write, response and local rendering all complete in a fraction of a second.

Despite this, the UI appeared blocked for approximately 20 seconds. In the source, `RouteTransitionOverlay` registers a capture-phase `document.addEventListener('submit', ...)` handler. This starts a full-screen **“Saving your changes…”** overlay for any form that doesn't explicitly opt out. That overlay is cleared on navigation, explicit loading-done, or an **18,000 ms** safety timer. Since the task form now intentionally saves inline without navigation, the overlay remained on top of the already-updated UI until its timeout.

## Fix

- Added `data-no-global-loader="true"` to the shared `ProjectTaskForm` component. This covers both **Add task** and **Save task**.
- Preserved inline database-confirmed updates to the Gantt, task lists and allocated-hour totals from V26.11.09.02.
- Preserved the global route overlay for forms that genuinely navigate. No broad changes to application-wide navigation.
- Did not alter task SQL, pricing, scheduling, assigned staff, permissions, or revision tracking.

## Tests

- New `scripts/tests/project-task-global-overlay.mjs` exercises the actual overlay submit handler under controlled React/document stubs. It verifies inline Gantt saves schedule **no** overlay timers, while ordinary form submissions still schedule the existing 0 ms and 18,000 ms timers.
- Project task save/create/edit action tests pass; full selected regression suite: **50 passing tests, 0 failures**.
- Changed TSX files pass TypeScript parsing/syntax checks.
- **Full workspace `pnpm typecheck`, Next.js browser integration and live Supabase testing were not performed** in this source-only environment; run these locally before deployment.

## Installation

1. Extract the complete ZIP over your current V26.11.09.02 checkout, preserving `.env` configuration.
2. Run `pnpm typecheck` and resolve any reported errors.
3. Deploy V26.11.09.03; **no new SQL migration** is necessary.
4. Create and edit a project task. The task should become usable after `[pm:project-task-save] confirmed` and `[pm:project-task-save] ui-visible-ms`, without a full-screen 18-second loading overlay.
5. If there is still a delay, note **what remains on the screen** (loading overlay, editor still open, task missing, button disabled, or another symptom) alongside the two console timings. This distinguishes any additional issue from the now-fixed overlay.
