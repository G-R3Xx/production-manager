# Production Manager V26.11.07.01 — Manual Project Timelines

Based on **V26.11.05.11**. All previous functionality is retained.

## New: Standalone projects (no quote or Production Job required)

From **Projects** there are now two separate starting points:

1. **New manual project** — Enter a project name and optional client/reference, then create your own Sub Jobs and tasks.
2. **From an existing Production Job** — Existing, quote-linked workflow remains unchanged.

Manual projects live in the same Projects/Gantt area, but have **no quote, Production Job, MYOB Order or invoice linkage**. They do not create placeholder records in those systems.

Each manual project includes:
- Editable project name, client/reference and optional target completion date.
- Any number of manually named Sub Job sections (add, rename, remove).
- Tasks under each Sub Job or General / Unassigned, with dates/times, allocated work hours, staff and status.
- Existing Gantt drag/resize, task ordering, quick staff assignment, and Day/Week/Month views.
- Removing a manual Sub Job **keeps its tasks**, moving them to General / Unassigned.
- Existing linked project timelines keep their quote/production step associations and their previous behaviour.

**Scope note:** The Main Calendar remains the deliberately simple Production Job deadline calendar. Manual-project target dates are visible in Projects, not in the Main Calendar. A manual project cannot retroactively turn into a quote or create a MYOB Order in this release.

## Migration (required)

1. Make sure SQL migration **065_project_timelines.sql** was applied previously.
2. Run **infra/sql/066_manual_project_plans.sql** in your Supabase SQL Editor **before** deploying V26.11.07.01.
3. Deploy the updated source.
4. Run `pnpm typecheck` on your Windows development checkout before production deployment.

Migration 066 makes `production_job_id` optional for manual projects only; adds manual project detail fields, manual Sub Job sections, and a separate manual section reference on timeline tasks. Existing quote Sub Job IDs and their foreign key remain intact. There is no mass data migration or modification of existing quotes or production jobs.

## Verification completed in this environment

- **43 automated tests passed** across project scheduling/reordering, manual project logic, calendar, quote, cost and materials workflows.
- **Strict isolated TypeScript typecheck passed** for the changed `project-timelines.ts` server module using a local type stub for the DB dependency.
- All changed TS/TSX files **passed TypeScript parsing/transpilation**.
- ZIP integrity and checksum verified.

**Not completed:** Full monorepo `pnpm typecheck`, browser UI testing, and a live Supabase/PostgreSQL migration/integration run (dependencies and live database not available in this environment). Do not interpret source-level tests as a successful live DB deployment.

## Safety and compatibility

- Only active **Owner/Manager** accounts may create or edit projects, Sub Jobs and tasks.
- All manual project and section server writes are scoped to the current tenant and manual project type.
- Tasks can be assigned only to active staff from the same tenant.
- Existing linked projects remain compatible, including production step status and Gantt task scheduling.
- The project revision check still works for manual and production-linked plans.

## Files

- `infra/sql/066_manual_project_plans.sql`
- `apps/web/src/server/project-timelines.ts`
- `apps/web/src/app/(app)/projects/page.tsx`
- `apps/web/src/app/(app)/projects/[id]/page.tsx`
- `apps/web/src/app/(app)/projects/actions.ts`
- `scripts/tests/manual-projects.mjs`
- `apps/web/src/app/(app)/layout.tsx`
