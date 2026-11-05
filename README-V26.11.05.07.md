# Production Manager V26.11.05.07

Based on **V26.11.05.06**. No database migration is needed. Existing project schedules and Production Steps are retained.

## Projects: drag and resize Gantt tasks

- **Drag the middle of a task bar** horizontally to move its planned start and finish together.
- **Drag its left or right edge** to change the start or finish, extending or shrinking the duration. Resizing uses the visual edge grips when the bar is at least 24 pixels wide; zoom to **Day** for a short task.
- Dragging previews the new scheduled period live. Releasing the pointer saves the dates automatically; failed saves revert the bar and display an error.
- Snap increments: **Day = 15 minutes**, **Week = 30 minutes**, **Month = 1 day**. All times are the workspace-local Sydney wall clock.
- Only owner/manager roles can edit, consistent with the existing project task editor. Other staff may still view task bars and details.
- Save changes only `planned_start` and `planned_end`: allocated work hours, title, assignee, notes, planning status, and original Production Step status remain unchanged.
- A concurrency check rejects an update when another staff member has already changed the task's original schedule, avoiding silent overwrites.
- The existing date/time task form remains as a fallback, including keyboard-accessible editing.
- The existing task period navigation remains: use Week/Month to move tasks across calendar days and Day for precise short tasks. Visible bars cannot be dragged entirely outside the displayed calendar window.

## Performance

One schedule-only, tenant-scoped server action updates just the timestamps. There is no form redirect. The chart updates immediately when released; on a successful save a single background route refresh synchronises the task details.

## Files modified

- `apps/web/src/app/(app)/projects/[id]/GanttTimeline.tsx`
- `apps/web/src/app/(app)/projects/[id]/page.tsx`
- `apps/web/src/app/(app)/projects/actions.ts`
- `apps/web/src/server/project-timelines.ts`
- `apps/web/src/lib/project-timeline.ts`
- `apps/web/src/app/(app)/layout.tsx`
- `scripts/tests/project-timelines.mjs`

## Verification performed

- **14/14 project timeline tests passed**, including new drag/resize logic, boundaries, snap increments, month changes and tenant/optimistic-save wiring.
- Strict TypeScript check passed for the pure timeline helper.
- Isolated strict TypeScript check passed for the modified Gantt component using representative React/Next/server type stubs. This is NOT the full workspace typecheck.
- Changed TypeScript/TSX files passed TypeScript syntax/transpilation checks.
- Existing quote Sub Jobs, Delivery/Courier, quote polling, sheet cutting, finishing add-ons and line quick-action regression tests passed.
- ZIP integrity and checksum verified.

**Still to verify on your Windows checkout:** run `pnpm typecheck`, deploy to a staging environment and drag/resize real tasks in a browser to confirm save, permissions, smoothness and concurrent editing. No live Supabase deployment was modified.
