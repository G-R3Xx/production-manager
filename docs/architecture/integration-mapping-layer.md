# Integration mapping layer

This batch adds the first MYOB-safe bridge layer without introducing live MYOB API calls yet.

## What it adds

- `integration.myob_connections`
- `integration.external_mappings`
- `integration.sync_runs`
- `/integrations` page in the app shell
- server helpers for loading and saving connection metadata

## Purpose

- MYOB remains the commercial source of truth.
- The app database remains the operational source of truth.
- External mappings link local app records to MYOB IDs.
- Sync runs provide auditable history for import/export/reconcile jobs.

## Next phase

- start MYOB OAuth connection flow
- store company file selection
- begin customer and product mapping writes
- add worker-driven sync runs
