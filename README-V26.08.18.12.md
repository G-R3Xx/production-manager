# Production Manager V26.08.18.12

## Job navigation performance

- Calendar and individual Job workspaces now read the canonical Job data directly instead of resynchronising every workflow on every navigation.
- Dashboard workflow synchronisation is coalesced so simultaneous requests share one operation.
- Repeated Dashboard loads within 30 seconds reuse the current Job records instead of rewriting every Job and system task.
- Preserves the V26.08.18.11 artwork reconciliation fix and all existing workflows.
