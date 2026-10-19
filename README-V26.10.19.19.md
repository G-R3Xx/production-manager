# Production Manager V26.10.19.19

Australian release date: 19 October 2026.

## Process editor popup containment

- Replaces the Processes page card-attached `<details>` edit popover with a true modal dialog.
- The edit dialog is rendered in the browser top layer and is capped to the available viewport (`100dvh - 32px`).
- Long forms scroll inside the dialog instead of extending above or below the browser window.
- Only one process editor can be active at a time.
- Adds a top-right **×** close button that closes without saving and resets any unsaved form changes.
- **Cancel**, Escape, and clicking the backdrop also close/discard without saving.
- Keeps Save changes as the only action that persists edits.

## Compatibility

- No database migration is required.
- No process, machine or Shop Operation data model changes are included.
