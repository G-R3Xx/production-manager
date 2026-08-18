# Production Manager V26.08.18.13

## Instant Dashboard loading

- Dashboard now reads the canonical Job table directly and no longer blocks rendering on a complete workflow reconciliation.
- Adds an explicit `Refresh stages` control for on-demand reconciliation.
- Loads Jobs, tasks, staff and client logos in parallel.
- Calendar and Job pages retain the direct-read performance changes from V26.08.18.12.
