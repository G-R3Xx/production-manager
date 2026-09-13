# Production Manager V26.09.13.01

## Small-format quote pricing correction

- Fixed a quantity multiplication bug in the Small format / print quick quote workflow.
- Small-format material, print, coating and one-off artwork costs are now normalised to a per-finished-item cost before markup/profit is applied.
- Quote quantity is applied exactly once when the final line total is calculated.
- Parent-sheet yield still rounds the total number of sheets required for the complete run, then allocates that actual run cost back across the quoted quantity.
- Managers/Owners now have an expandable **Manager costing** breakdown in the small-format quote editor showing per-item raw cost and total line cost before quote pricing. This makes incorrect material rates or setup costs much easier to identify.
- Existing saved quote lines are not silently repriced. Open/edit and save a line to apply the corrected calculation.

No database migration is required.
