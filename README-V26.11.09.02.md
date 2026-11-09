# Production Manager V26.11.09.02 — Gantt task save UI latency

Based on V26.11.09.01. No database migration required.

## Diagnosis using live measurements

The browser log supplied from the deployed app showed a task-create server operation of **89 ms**, including authentication **38 ms**, database write **38 ms**, and task read **12 ms**. Browser server-action response was **218 ms**, yet the screen took around **20 seconds** to settle. This excludes the database write as the principal cause of the perceived delay.

## Root cause and changes

`ProjectTaskForm.tsx` still invoked `startRefresh(() => router.refresh())` after the confirmed write. On the dynamic `/projects/[id]` route, that refresh re-ran project, staff, sections, task and unscheduled-production-step queries and re-rendered the whole server component page. The refresh could take far longer than the save, including a React pending transition.

- **Removed the automatic full-page `router.refresh()` following Add task / Save task**. The confirmed server action remains the source of truth.
- **Live task sections and header totals:** `ProjectTaskSections.tsx` is now a client-managed view that receives the confirmed task record, updates existing records or inserts a new task, and recalculates section counts and allocated hours. The Gantt already receives this same update.
- **Cross-tab consistency:** The save action returns the updated project revision (in parallel with loading the saved row). The Gantt advances its revision baseline before broadcasting to other tabs, preventing its own subsequent revision check from reloading the page because of the local save. Other tabs continue to detect updates through lightweight revision checks.
- **Measured UI response:** the browser now logs `[pm:project-task-save] ui-visible-ms` after two animation frames following the confirmed update. Compare that with `[pm:project-task-save] confirmed` to distinguish network/write time from browser UI rendering time.
- **Unchanged:** permissions, manual projects, Production Step link, planned start/end, assigned staff, status, allocated labour and existing row-ordering behaviour.

The separate older form actions for adding linked Production Steps, removing tasks and editing manual project sections still perform full redirects; **this release targets the Add task / Save task latency reported in the supplied `mode: "create"` timing log**.

## Verification

- Project task save/regression, revision and live component-wiring tests passed.
- Calendar, Gantt scheduling/reordering, manual project, quote and material regressions passed: 46 selected tests passed using Node 22 with `--experimental-strip-types`.
- TS/TSX syntax parsing passed for all changed code files.
- Live Next.js browser/database testing and full monorepo `pnpm typecheck` **not run** here; this ZIP does not contain node_modules.

## Install

1. Extract the complete ZIP over the current project, preserving existing `.env` files.
2. Run `pnpm typecheck` and fix any errors before deployment.
3. Deploy to the existing environment. **No new SQL migration.**
4. Open a project and Add task / Save task; the bar, task card and totals should update as soon as the save responds, without a 20-second page refresh.
5. In DevTools Console inspect `[pm:project-task-save] confirmed` and `[pm:project-task-save] ui-visible-ms`. If the response is fast but visual update still takes a long time, compare these readings and check Network → Fetch/XHR for unexpected `/projects` refresh requests.

## Notes

The user's prior timing showed a 218 ms server response but 20 seconds of perceived latency; this code eliminates the confirmed unconditional post-save page refresh, but real-world speed improvement must be measured after deployment.
