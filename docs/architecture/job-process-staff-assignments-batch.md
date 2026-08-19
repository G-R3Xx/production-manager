# Job process staff assignments

## Ownership levels

1. A job has one assignment record for each major process: enquiry, survey, quote, artwork, production, dispatch and invoicing.
2. Each process supports multiple active staff, an optional due date and internal notes.
3. Production procedure steps inherit either the Production or Dispatch process assignment.
4. A procedure step can store a manual override. Changing a process assignment never overwrites a manual step override.

## User experience

- Process assignments are edited in the Job workspace and saved through a JSON API without a route refresh.
- The Dashboard uses the current process assignment for its Assigned column and process due date for its Due column.
- The Calendar combines dated process assignments with manual job tasks and milestones.
- Production exposes inherited ownership beneath each procedure step, with controls to save an override or restore process defaults.

## Persistence

- `app.job_process_assignments` stores process-level ownership.
- `app.job_tasks.process_key` allows the current system task to mirror its process assignment.
- `production.production_steps` stores inherited or manual staff, due date, assignment source and source process.
- Runtime schema guards and `infra/sql/045_job_process_staff_assignments.sql` are both idempotent.
