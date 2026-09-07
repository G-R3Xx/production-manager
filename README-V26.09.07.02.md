# Production Manager V26.09.07.02

## Change
- Replaced the unused top-header space with a live **Needs attention** operations strip.
- The strip automatically selects the highest-priority actionable job in this order: overdue, changes requested, due today, artwork approved, new enquiry, quote required, then invoice required.
- The selected item links directly to the job's current workflow screen.
- Added compact **Today** counts for due tasks/processes and installs, linked to today's calendar agenda.
- Added a compact **Latest** alert summary with direct navigation.
- When nothing urgent is waiting, the strip shows an all-clear state, active job count and the next upcoming due job.
- The operations strip loads after the page so it does not block navigation, refreshes every 60 seconds, and refreshes when the browser regains focus.
- App version updated to **V26.09.07.02**.
- No database migration required.
