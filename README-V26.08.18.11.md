# Production Manager V26.08.18.11

## Existing artwork Job reconciliation fix

- Job synchronisation now resolves existing Jobs by artwork approval ID as well as enquiry, survey, quote and production IDs.
- Prevents duplicate inserts against `jobs_tenant_artwork_uidx` when Calendar or a Job workspace synchronises workflow data.
- Fixes the server error on `/calendar` and `/jobs/[id]` without deleting or rebuilding any existing Job data.
