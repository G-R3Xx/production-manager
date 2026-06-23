# Production explicit job selection batch

Production no longer auto-opens the first job.

Changes:
- Production starts with a current jobs list only.
- Job details, print-ready files and checkoff steps load only after a user clicks a production job card.
- The job cards now use a full-width responsive grid rather than a horizontal strip.
- If an old/deleted/invalid selected job URL is opened, the page shows a safe message and asks the user to pick a current job.

This keeps the page focused on current work and avoids accidentally editing the first production job.
