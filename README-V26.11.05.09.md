# Production Manager V26.11.05.09 — Reorder Gantt task rows

Based on V26.11.05.08. No database migration is needed.

## Changes

- On **Projects → open project → Gantt timeline**, use the small grip (⠿) to drag the **task name** up or down inside its existing Sub Job. Drop above or below another task to choose its placement.
- Accessible **up/down controls** beside each task name provide an alternative to dragging.
- Task row order is saved in the existing `production.project_timeline_tasks.sort_order` column and persists across refreshes and sessions. Ordering is no longer driven by start dates.
- Newly created timeline tasks and newly scheduled Production Steps append to the end of their own Sub Job.
- Reordering does **not** move bars in time or modify task dates, labour allocation, status, assignments, linked production steps, or quote details.
- To preserve grouping, tasks can be reordered **within** a Sub Job (including General / Unassigned), not moved between Sub Jobs by dragging. To change a task's Sub Job, use the existing task editor.
- Only tasks appearing in the currently selected Day/Week/Month window show drag handles. Tasks outside the window retain their relative order.
- Owners/managers can reorder; other staff only view tasks. Server validation enforces workspace/project/sub-job membership. Atomic saves use a project lock and compare the expected ordering, rejecting stale tabs instead of silently overwriting changes.
- Browser shows the changed order immediately, then refreshes quietly; errors roll back the local preview.

## Modified files

- `apps/web/src/app/(app)/projects/[id]/GanttTimeline.tsx`
- `apps/web/src/app/(app)/projects/actions.ts`
- `apps/web/src/server/project-timelines.ts`
- `apps/web/src/lib/project-timeline.ts`
- `apps/web/src/app/(app)/layout.tsx`
- `scripts/tests/project-reorder.mjs` (new)

## Verification

- New task-reorder tests (6) and existing project timeline tests (14): **20 passed**.
- Available broader regression suites: **39 passed**.
- Three older integration test files could not start due to unavailable `playwright` and `@electric-sql/pglite` development packages; those are environment dependencies, not observed code regressions.
- Pure timeline library: **strict TypeScript check passed**.
- Gantt component: **isolated strict TypeScript check with dependency stubs passed**; all modified TS/TSX files passed TypeScript syntax parsing.
- **Full monorepo `pnpm typecheck` not run** because this source-only environment has no installed workspace dependencies. Run this in your Windows checkout before deploying.
- Live database concurrency testing and real-browser drag/drop testing remain outstanding.

## Installation

1. Extract the source ZIP over your Production Manager checkout (preferably after a git commit/backup).
2. Run `pnpm typecheck` and your regular build/deployment checks.
3. Deploy to your environment. Migration 065 from the earlier Projects release must already be applied; **no additional SQL is required**.
4. Open a Project Timeline and drag task names using the grip. Check the saved order after refreshing.
