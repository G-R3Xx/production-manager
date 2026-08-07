# Production Manager V26.08.07.05

## Configurable roll and ink billing increments

- Roll materials now have a Billable roll increment setting: Auto (0.5m), Exact, 0.25m, 0.5m or 1m.
- Existing roll materials default to the recommended 0.5m increment until explicitly changed.
- Roll usage is rounded once across the whole quote line/quantity, matching sheet-stock billing behaviour.
- Company settings now include an Ink billing increment in m²: Exact, 0.25, 0.5 or 1. Default is 0.5m².
- WordPress live pricing uses the same Production Manager rounding settings. No WordPress plugin update is required.
