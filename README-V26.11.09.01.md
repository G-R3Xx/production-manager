# Production Manager V26.11.09.01 — Gantt task create/edit latency

Based on **V26.11.07.01**, with all existing manual-project, production-linked project, Gantt scheduling, Materials, MYOB, Calendar, Quotes and Sub Job functionality retained.

## Cause found

Creating or editing a Gantt task previously submitted a redirecting Next.js server action. After the database mutation, it invalidated `/projects/<id>` and `/projects`, then redirected to the full project page. The UI had to rebuild the project, its tasks, sections, staff list and unscheduled production steps before confirming the save. This is definite avoidable work but does **not** prove the entire reported 30 seconds was spent there: live Supabase/auth timings weren't accessible in this environment.

## Changes

- **Create and edit tasks now save inline:** submitting either form calls `saveProjectTaskInlineAction`, which performs tenant/role checks, a scoped database write, then reads only the saved task. No `redirect()` or `revalidatePath()` occurs on this fast save path.
- **Immediate confirmation:** the Add/Save button shows `Saving…` as soon as it is submitted, and `Task added` or `Task updated` appears as soon as the database confirms success. Errors appear inline and retain entered values.
- **Gantt update before full-page reload:** the saved task record is passed to the chart via an in-page event. Existing tasks update in place, and new tasks appear immediately. The chart switches to the relevant date if necessary, even when a project was previously empty.
- **One background refresh:** remaining server-rendered sections update in a non-blocking React transition. No duplicate same-tab BroadcastChannel refresh. Other tabs use the existing lightweight revision checks.
- **Compatible writes:** retained the tenant-scoped SQL and assignee/sub-job validation, the same task record fields, linked Production Steps and manual sections. The fast create path assigns a server-generated UUID so it can return its confirmed row without loading the entire task list.
- **No changes to task allocation, scheduling, employee assignments, status, or Gantt row ordering.**

## Timing diagnostics

When creating or editing a task, inspect browser **DevTools → Console**:

- `[pm:project-task-save] confirmed`: `responseMs` (browser submit → server action result) and server `authMs`, `writeMs`, `readMs`, `totalMs`.
- `[pm:project-task-save] project-refresh-ms`: time for the background server-component refresh (no longer blocks task confirmation).
- In your Vercel/server logs, look for `[pm:project-task-save]` with `mode`, `authMs`, `writeMs`, `readMs`, `totalMs`.

If saves still take ~30 seconds, these fields will distinguish Supabase/database execution from auth/network time and rendering. For example, large `writeMs` implies a slow database call, while a small `totalMs` but high `responseMs` suggests the network/Next server-action transport.

## Installation

1. Extract the source ZIP over a clean **V26.11.07.01** working copy, keeping your `.env`/deployment settings.
2. Run `pnpm typecheck` in your Windows checkout; the full monorepo typecheck could not be run in the current isolated source environment because `node_modules` was not provided.
3. Deploy.
4. In Projects, test creating a task in a manual project, editing its title/times/assignee, and creating a task in a production-linked project. Verify the Gantt updates immediately after the server confirms the write.
5. If delay remains, copy the browser/server timing values above for further targeted diagnosis.

**SQL:** No new migration. The existing project migrations **065** and **066** remain required if not already applied.

## Verification

- **52 available regression tests passed**, including 5 new tests for inline creates/edits, saved task reads, tenant/role validation, absence of forced redirect/revalidation and chart update wiring.
- Changed TS/TSX files passed TypeScript syntax diagnostics; these are **not** a full monorepo typecheck.
- Three additional existing integration suites could not execute because the archive/environment has no Playwright or PGlite dependency (`machine-latency.mjs`, `machine-rpc-timing.cjs`, `staff-profile.cjs`).
- No live Supabase or deployed browser latency was measured here, so a specific post-deployment save time cannot be claimed.
