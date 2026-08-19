# Production Manager V26.08.19.09

- Returns stored dashboard jobs immediately instead of blocking the first render on full workflow reconciliation.
- Runs stale job reconciliation after the response so workflow repairs no longer hold up the dashboard.
- Includes job updates in the app activity pulse so completed background repairs are detected automatically.
- Performs one controlled, non-blocking dashboard refresh when background reconciliation is required.
