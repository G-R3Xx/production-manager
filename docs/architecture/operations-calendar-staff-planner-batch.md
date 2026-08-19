# Operations calendar staff planner batch

## Purpose

Calendar is the daily scheduling surface for active work. It combines workflow-process ownership with manual job tasks while preserving the distinction between them.

## Behaviour

- Week is the default view, with staff rows and Monday-to-Sunday columns.
- Month provides workload scanning; Agenda provides a focused 30-day list.
- Active current processes are synthesised even before an assignment row exists, preventing unscheduled jobs from disappearing.
- Explicitly configured upcoming processes remain visible alongside the current process.
- Completed processes and tasks are hidden by default and can be shown with a filter.
- Multi-staff events appear on each assigned staff row but retain one shared scheduling record.
- Dragging changes only the due date. Staff changes are deliberate and occur in the details drawer.
- Production and Dispatch changes continue to synchronise inherited production-step assignments.
- Calendar filtering, navigation and edits are client-side and do not trigger full-page reloads.
