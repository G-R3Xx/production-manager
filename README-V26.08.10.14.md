# Production Manager V26.08.10.14

## MYOB create/link button reliability

- Adds visible pending states to MYOB link/create actions so a click responds immediately.
- Wraps the complete Create in MYOB flow so API/database failures are returned visibly on the Quotes page instead of failing silently.
- Revalidates the Quotes page after customer link/create/send operations.
- Runs exact MYOB duplicate checks in parallel to reduce wait time.
- Keeps the top-level `production-manager/` folder in the full-project ZIP.
