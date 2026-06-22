# Quote preset settings labour rate typecheck fix

Fixed a TypeScript scope issue in `QuoteMaterialFlowBuilder.tsx` where helper components referenced `labourRate` from outside their component scope.

Changes:
- `LabourPrompt` now receives `labourRate` as a prop.
- `SelectedLabourHours` now receives `labourRate` as a prop.
- All call sites pass the quote builder's resolved labour rate from Settings.

This fixes:
- `TS2304: Cannot find name 'labourRate'`
