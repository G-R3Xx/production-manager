# Production Manager V26.08.28.03

Hotfix for route pages remaining on the loading shell.

- removes schema DDL from the normal hot read path when the current schema is already present
- deduplicates concurrent schema checks within a server runtime
- reduces background alert/global-pulse pressure during navigation
- stops the global pulse from unnecessarily ensuring the notifications schema
- tunes the Vercel Postgres pool to avoid connection bursts
- narrows enquiry reconciliation updates to rows that actually need a status change
