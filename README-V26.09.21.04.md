# Production Manager V26.09.21.04

Australian release date: 21 September 2026.

This release adds automatic staff routing for production work and calendar pre-population.

## Default task assignments

Owners and Managers now have **Settings → Task assignment defaults**.

Default teams can be set for:

- Artwork / prepress
- Signage printing
- Signage manufacture / finishing
- Small format
- Installation
- Pickup / delivery

Multiple people can be selected for any rule. When matching active staff exist and no defaults have been saved yet, the screen initially suggests the agreed Tender Edge mapping: Connor for artwork, Christine for signage print, Joel + James for manufacture/install, and Daniel for small format. Nothing is locked to those names; the settings remain editable.

## Job and calendar behaviour

- New jobs inherit the Artwork default automatically.
- Generated production procedures are classified and assigned from the company defaults.
- Artwork checks remain with the Artwork default even when the job itself is Small Format.
- Small Format print/finishing procedures use the Small Format default.
- Signage RIP/Print uses Signage Printing.
- Signage manufacture/finishing uses Signage Manufacture.
- Installation handoff uses Installation when the job dispatch type is Install.
- Pickup / delivery handoff uses the Pickup / Delivery default.
- A saved job-level Production or Dispatch assignment overrides company defaults for that job.
- An individual procedure override remains the most specific rule and is never overwritten by inherited defaults.
- Procedure overrides can still be restored to inherited company/job defaults.

The job due date is used as the inherited calendar date for generated procedures unless a job/process/procedure gets its own date. Work without a date remains visible in Calendar → Needs scheduling with its inherited assignee(s).

## Audit trail

Production checkoff continues to record the actual signed-in user and timestamp separately from the assigned staff. Assignment therefore controls responsibility/queueing without changing who PM records as having actually completed the step.

## Database migration

Run `infra/sql/050_default_task_assignments.sql` once in the Supabase SQL Editor after the existing migrations. It is idempotent and adds:

- `app.task_assignment_defaults`
- inherited/manual source metadata on `app.job_process_assignments`
- `assignment_default_key` on `production.production_steps`

The application also contains runtime schema guards, but the migration should be run as part of deployment.

## Verification

- Changed TypeScript/TSX files pass TypeScript syntax/transpile validation.
- Full dependency-backed pnpm build cannot be run in this packaging environment because the source archive does not contain `node_modules`.
