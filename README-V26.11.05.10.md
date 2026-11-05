# Production Manager V26.11.05.10 — Client and job names on Calendar

Based on **V26.11.05.09**.

## Changes

- In **Calendar → Completed by**, each scheduled job tile now displays the **client name on the first line** and the **job name on the second line**.
- Distinct typography makes the client easy to identify without hiding the job title.
- Long names are truncated inside the calendar tile to keep the month grid usable; hovering over the entry displays the complete client and job names and the due date. Screen-reader labels also include both names and the completion date.
- The existing calendar search, due-date editing, status colouring, and sync with the Project completion date are unchanged.
- The calendar already receives both names from its existing minimal production-job projection; no additional database queries or migration are required.

## Files changed

- `apps/web/src/app/(app)/calendar/CompletionCalendar.tsx`
- `apps/web/src/app/(app)/layout.tsx` (version bump)
- `scripts/tests/completion-calendar.mjs` (regression test)

## Verification

- Calendar, project reordering and project timeline test suites: **26 passed**.
- Updated TSX components passed TypeScript syntax/transpilation checks.
- ZIP integrity verified and SHA-256 checksum generated.
- Full workspace typecheck and real-browser testing not performed in the source-only environment (no installed Next.js / React project dependencies). Run `pnpm typecheck` in the local checkout before deployment.

## Installation

1. Extract the ZIP over a clean/committed checkout of V26.11.05.09.
2. Run `pnpm typecheck` and your normal build checks.
3. Deploy. **No new SQL migration required.**
4. Check the Completed by calendar: an entry should show client above the job name, with both full names available on hover.
