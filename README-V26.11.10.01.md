# Production Manager V26.11.10.01

Based on **V26.11.09.04**, retaining the fast Gantt task-saving fix from V26.11.09.03 and the collapsible Sub Job sections.

## Fix: Gantt staff assignment appears to save but displays the old person

The Gantt quick-assignment action previously returned only `{ ok: true }`, followed by a full `router.refresh()`. The Gantt also maintains confirmed in-page task snapshots for fast Add/Edit operations. On refresh, an older in-page snapshot could take precedence over the new server assignment: the success banner said “assigned to Connor”, but the dropdown reverted to “Unassigned” or its previous value.

**Changes:**
- The tenant- and manager-scoped assignment action now returns the **confirmed saved task** and project revision, using the existing indexed single-task lookup.
- The Gantt updates the selected staff from that database record and notifies the existing **pm-project-task-saved** listener; the Gantt, task cards and edited task data therefore use the same confirmed state.
- Removes `router.refresh()` from a successful Gantt staff assignment. Other tabs still receive the schedule notification.
- Preserves permission checks, compare-and-swap conflict protection, error recovery, task order, times, labour hours and completion status.

## Installation

1. Extract **Production-Manager-V26.11.10.01.zip** over your source checkout, preserving your local environment/configuration files.
2. Run `pnpm typecheck` in the project root.
3. Deploy the application. **No SQL migration required.**
4. In a manual or production-linked Gantt, assign a staff member on a recently added task. Verify the dropdown retains the selection, the task details agree, and the assignment still shows after reloading. Test **Unassigned** too.

## Verification completed here

- 6 new regression tests: confirmed assigned/unassigned rows, rejecting stale assignments, server-only permissions, tenant-scoped compare-and-swap and in-page UI update without full refresh.
- 56 available selected regression tests passed in total (Gantt, calendar, project, quote and material tests).
- Changed TypeScript/TSX files passed TypeScript syntax checks.
- ZIP archive integrity and SHA-256 verified.

**Not completed here:** full Next.js monorepo typecheck (source archive does not include installed dependencies), browser automation against a running application, or a live Supabase save. Run local typecheck before deployment.
