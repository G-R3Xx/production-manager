# Roll stock auto-detection costing fix

This batch fixes quote material costing for roll media such as SAV vinyl and laminate.

## Problem fixed

Some option answer rows were left on the simple default usage mode. For sheet materials that is fine, but for roll materials it made the quote page treat a 600 x 900mm roll item like a fraction/multiple of a sheet.

Example bad result:

- 600 x 900mm sign
- SAV 7yr roll stock
- app calculated 8.67 sheets

That was wrong because SAV is roll stock. It should be costed as linear metres used from the selected quote size and roll width.

## What changed

The quote calculator now auto-detects roll materials when the product option row is left on the normal automatic usage mode.

It treats a material as roll stock when any of these are true:

- material has a roll width
- purchase/stock UOM is lm/metre
- purchase/stock UOM says roll
- material type/name suggests roll, vinyl, SAV, laminate, or media

## Roll length calculation

If the selected size can fit both ways across the roll width, the calculator uses the shorter roll length.

Example with a 1220mm wide roll:

- 600 x 900mm can fit both ways
- it rotates to save material
- roll length becomes 0.6lm, plus any waste percentage

If only one direction fits, it uses the direction that fits. If neither fits, it warns in the breakdown that paneling should be checked.

## Material rate calculation

For roll stock, the quote calculator uses a linear metre rate.

- If purchase UOM is lm/metre, purchase cost is used as cost per linear metre.
- If purchase UOM is roll and stock quantity is set in lm, purchase cost is divided by roll length.
- If the material looks like roll stock and stock quantity is set in lm, the same roll-length division is used as a safe fallback.

## Product setup guidance

For normal staff setup, use **Auto from material type** for the option answer row.

- Sheet material automatically uses area against the parent sheet.
- Roll material automatically uses quoted size against roll width.

Only use the other modes when the answer needs a fixed override.
