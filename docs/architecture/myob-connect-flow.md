# MYOB Connect Flow Batch

This batch adds the first tenant-scoped MYOB connect scaffolding:

- connection metadata storage in `integration.myob_connections`
- sync-run logging in `integration.sync_runs`
- integration dashboard cards
- `/integrations` UI actions to:
  - save metadata
  - start a scaffolded connect flow
  - queue a sample sync run
  - disconnect the scaffolded connection

This does not yet call MYOB OAuth or company-file APIs. It prepares the app state and operational data model for the real connect flow.
