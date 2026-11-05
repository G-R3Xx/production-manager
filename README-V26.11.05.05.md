# Production Manager V26.11.05.05 — Project timelines (first release)

Based on **V26.11.05.04**, preserving the existing material finishing add-ons, default Corflute/ACM cutting, Sub Jobs, client quote, MYOB, staff certificate and performance improvements.

## Installation (required order)

1. In Supabase SQL Editor, apply **`infra/sql/065_project_timelines.sql`** before deploying this version. The SQL is also supplied alongside the ZIP.
2. Extract the full source ZIP over the matching project checkout, or merge the changed files into your Git branch.
3. Run `pnpm typecheck` in your Windows checkout (dependencies are not included in the source ZIP).
4. Test creating a project, scheduling a task, assigning staff, reopening it and changing its dates.
5. Deploy after your full typecheck and browser checks pass.

There are **no data migrations for existing quotes**, and this does not alter existing pricing or MYOB Orders.

## New Projects section

- Separate **Projects** navigation item at `/projects`.
- Create **one optional project timeline per existing Production Job**. Starting a timeline does not create another quote, production job, or production checklist.
- The Production Job page now links to Projects, with the selected job prefilled if it doesn't yet have a timeline.
- A project reads its **Sub Jobs from the existing accepted quote**. Tasks appear under their linked Sub Job, or **General / Unassigned**.

## Tasks and Gantt chart

- Add a new planning task under a specific Sub Job.
- Import an existing **Production Step** onto the schedule without duplicating its checklist entry.
- Set an individual task's **planned start** and **planned finish**, both with a date and time.
- Set **allocated work hours** separately from calendar duration. Example: Monday to Friday on the chart, with six hours of allocated work, remains six work hours—not forty.
- Set an assignee (active staff member), planning status, notes, and edit the section assignment later.
- Day, Week and Month timeline zoom modes; colour-coded statuses; task links to editing.
- Task totals show allocated work hours for each Sub Job and for the whole project.
- Removing a task from the timeline does **not** delete the linked Production Step or change quote prices.
- When an imported Production Step's checklist is marked complete, the chart reflects its actual production status after the page is reloaded.

The first Gantt view displays up to approximately **one year**, starting at the earliest task, to avoid rendering a huge chart. Tasks outside that period remain in the editable task list and can still be scheduled. The schedule uses **Australia/Sydney local wall-clock time** (also appropriate for Canberra); work-hour allocation is explicitly entered and does not automatically infer paid labour hours from the calendar span.

## Access and architecture

- All active workspace members can view their own workspace's Projects.
- Only **owners and managers** can create or edit project timelines.
- All project database reads and writes are scoped to the current tenant. Sub Job and staff selections are verified against the project and current workspace on the server.
- The project tasks link to `production.production_steps`, if imported, and to existing `sales.quote_sub_jobs` rather than introducing a separate checklist.
- Project data is read only when opening Projects, not polled globally on other Production Manager pages.

## First-release limitations

- **No drag-and-drop repositioning** yet: edit the start/end dates in each task form.
- **No dependency-based automatic rescheduling**, resource-capacity conflict resolution, or email/push alerts yet.
- Project allocated hours are planning metadata and **do not change quote labour cost calculations**.
- This initial release does not automatically populate project tasks for every Production Job; managers opt in to individual project schedules.

## Verification carried out

- Strict TypeScript check of all new routes, actions, service logic, schedule utility and Gantt component using isolated dependency interface stubs: **passed**.
- Node-based new Project timeline tests: **6 passed** (schedule arithmetic, validation, time allocation, grouping, Gantt positions and tenant-scoped wiring).
- Existing regression tests: material finishing add-ons, Materials table add-ons, standard Corflute/ACM cutting, Sub Job grouping/totals/heading, quote-line actions and quote-status polling: **passed**.
- ZIP integrity and SHA-256: verified.
- **Not completed in this environment:** full `pnpm typecheck`, live Supabase migration verification, interactive browser/layout testing, and a live integration run. Run these in the deployment environment before deploying.
