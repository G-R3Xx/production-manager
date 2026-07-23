# Quote print setup minutes

Version: V26.07.23.06

## Goal
Allow print setup labour to be entered as normal minutes instead of decimal hours.

## Behaviour
- Quick quote and guided print steps accept whole minutes, such as 15, 30, or 45.
- Print setup minutes are converted to decimal hours internally before applying the configured hourly labour rate.
- The current-item panel and quote summary display the entered time in minutes.
- Changing print setup minutes immediately refreshes the calculated price unless the user has manually overridden the unit price.
- Laminate application remains in hours; existing finishing operations continue to use minutes.

## Files changed
- `apps/web/src/app/(app)/quotes/QuoteMaterialFlowBuilder.tsx`
- `apps/web/src/app/(app)/layout.tsx`
