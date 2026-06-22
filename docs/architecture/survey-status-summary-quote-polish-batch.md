# Survey status, summary, and quote handoff polish

This batch polishes the Production Manager side of the working Install Scheduler survey bridge.

## Changes

- Added clearer survey workflow status wording:
  - Survey requested
  - Awaiting survey completion
  - Survey completed
  - Ready to quote
- Added a visual survey progress row on each survey card.
- Made the Install Scheduler link a clearer button: **Open in Install Scheduler**.
- Adjusted the quote action wording:
  - **Create quote from completed survey** when survey data has returned.
  - **Create quote from survey notes** when survey is not completed yet.
- Added a survey source summary panel on the Quotes page when creating a quote from a survey.
- The survey summary panel shows:
  - status
  - site address
  - returned survey details
  - returned survey photos
- Quote notes now automatically include returned survey photo links, so survey photos stay with the quote context.

## Notes

No new SQL is required. This uses the existing survey bridge fields and `install_scheduler_payload` JSON payload.
