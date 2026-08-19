# Production Manager V26.08.19.17

- Adds clear job-process ownership for Enquiry, Survey, Quote, Artwork, Production, Pickup / delivery / install, and Invoicing.
- Supports multiple assigned staff and a separate due date for every process.
- Saves process assignments inline without reloading the job workspace.
- Shows the current process team in the Dashboard Assigned column, with the job owner retained as a fallback.
- Adds dated process work to the staff-filterable calendar alongside manual tasks and milestones.
- Makes production procedure steps inherit the Production or Dispatch team and due date automatically.
- Adds fast per-step staff and due-date overrides in Production, including a safe return to inherited process defaults.
- Keeps manual extra tasks separate from the main workflow ownership model.
- Adds database migration `045_job_process_staff_assignments.sql`.
