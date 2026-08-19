# Production Manager V26.08.19.21

- Fixes Site Surveys not updating after a survey is completed or changed in Install Scheduler.
- Adds a dedicated five-second Survey status watcher using a lightweight database fingerprint rather than reloading the full survey payload.
- Checks immediately on page open, browser focus, page restore and tab visibility changes.
- Refreshes the open Surveys screen inline without route navigation or a full-page loading screen.
- Protects unsaved survey form changes by postponing the refresh until the form is clean.
- Remounts only the changed survey card so returned measurements, details, status and photos replace stale onscreen values.
- Adds survey changes to the app-wide activity pulse so Dashboard and linked workflow pages can also react to external survey completion.
