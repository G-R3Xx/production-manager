# Quote print method setup labour batch

## Goal
Add a print setup labour charge immediately after the quote-side print method selection, matching the laminate labour prompt pattern.

## Changes
- Added `printSetupHours` state to the signage quote builder.
- Selecting Direct print, Roll stock, or Cut vinyl now keeps the user on the Print method step and displays a required `Print setup labour hours` prompt.
- No print skips the print setup labour prompt and continues to finishing.
- Print setup labour is included as a cost row at the configured labour rate.
- The Print method step and quote save validation now require setup labour hours for printed methods.
- Current build and saved line summary now show the print setup labour hours.

## Files changed
- `apps/web/src/app/(app)/quotes/QuoteMaterialFlowBuilder.tsx`
