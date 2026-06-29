# Production large-screen board batch

Adds a Todoist-style production board to Production Manager.

## What changed

- Added `/production/board` as a large-screen production display.
- Groups active production items into department columns:
  - Printing
  - Finishing
  - Install
  - Deliver
  - Pickup
- Cards are assigned to the department based on the first unfinished production step.
- Board cards show client logo, client name, quote number, job/project name, product details, due date, assignee, priority and step progress.
- Added a board-only `Mark done` action that checks off the next step and returns to the board.
- Added 45 second auto-refresh for wall/TV use.
- Added a button from the normal Production page to open the large-screen board.
- Updated visible app version to `V26.06.29.03`.

## Notes

This is a live display view using the current production jobs/items/steps already in the system. It does not replace the detailed production job page.
