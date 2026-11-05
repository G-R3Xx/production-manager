# Production Manager V26.11.05.11 — Gantt drag reliability

Based on **V26.11.05.10**. No SQL migration needed.

## Changes

- **Fix unreliable horizontal dragging:** Gantt task bars are links, and the browser could start native link dragging instead of the custom pointer gesture. Native link dragging is now explicitly disabled on each bar.
- **Move and resize are unambiguous:** Drag any part of the bar other than the small, visible white end grips to move the entire task. Drag the end grips to adjust the start or finish. The previous broad invisible 11px end zones are gone.
- **Short task accessibility:** Bars shorter than 38px now have a larger invisible grab target, but their visible width still represents the true task duration. Resizing grips are hidden on bars under 52px; use Day zoom to resize those precisely.
- **No accidental navigation on a slight drag:** A gesture that is too small to change the snapped schedule will not open the task editor when released. A normal click still opens it.
- **Drag across horizontal scroll:** Changes in horizontal scroll offset are incorporated into the drag distance. Near-edge auto-scrolling starts only after the user has actually dragged, not simply clicked on a task.
- **Keyboard fallback:** Focus a task bar, press Left/Right arrow to move by the current zoom increment; Shift+Left/Right adjusts its finish. Day = 15 minutes; Week = 30 minutes; Month = 1 day.
- Dates are saved only on release, using the existing schedule-only server action. Allocated hours, staff, row order, status and Production Step links remain unchanged. Failed saves revert to the original dates.

## Files changed

- `apps/web/src/app/(app)/projects/[id]/GanttTimeline.tsx`
- `apps/web/src/app/(app)/layout.tsx` (version bump)
- `scripts/tests/project-timelines.mjs` (pointer reliability regression)

## Verification

- **41 available tests passed** across the timeline, completion calendar, quote and materials test suites.
- TypeScript TSX syntax/transpilation check passed.
- ZIP file integrity and SHA-256 checksum validated.
- Full monorepo `pnpm typecheck` and live browser drag testing were **not** completed in this source-only environment without installed dependencies or a connected live Supabase project. Please run `pnpm typecheck` in the development checkout before deploying.

## Install and test

1. Extract the ZIP into a clean/committed V26.11.05.10 source checkout.
2. Run `pnpm typecheck`, then deploy.
3. In Projects → Gantt Timeline, use Day view and drag the **middle** of a one-hour bar right by 60px: it should move by one hour, maintaining its duration. Drag the visible white left or right grip to resize. A small uncommitted drag should not open the task editor.
4. Use Week view for a short task: the enlarged grab target should allow moving it; zoom to Day for resizing. For a long project, drag toward the visible right edge to scroll while moving.

No changes to existing database schema or migration 065.
