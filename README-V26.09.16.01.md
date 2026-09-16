# Production Manager V26.09.16.01

## Small-format guillotine costing

- Keeps normal Trim / Guillotine costing time-based, matching the manager's updated small-format workbook.
- Replaces the misleading "Trim / cut items" quick template with a fixed-time Guillotine / trim template.
- Adds an optional calculated guillotine labour mode based on parent sheets, cuts per stack, maximum sheets per stack, cuts per minute and setup time.
- Adds `cuts per minute` and `maximum sheets per stack` to Machine setup. These values use the existing machine capabilities JSON, so no database migration is required.
- Adds quote-time guillotine controls for cuts per stack and stack capacity, plus an optional staff override for actual total minutes.
- Displays the complete stack/cut/time formula in the internal quote cost breakdown.
- Keeps digital print clicks/impressions separate from guillotine labour, preventing business-card quantities from being treated as individual sheet cuts.

## Verification

- Web TypeScript check passes.
- Focused guillotine calculations verified for one stack, multiple stacks and actual-time override.
