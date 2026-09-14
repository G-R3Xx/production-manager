# Production Manager V26.09.14.02

Small-format production costing release based on the supplied manager calculator workbook.

## Small-format costing profiles

Saved Small Format products can now opt into a dedicated digital-print costing profile. The profile adds:

- fixed waste / spoilage parent sheets;
- fixed print setup labour minutes;
- printer attendance labour as a percentage of print runtime;
- product-specific overhead percentage;
- product-specific profit percentage;
- default single/double-sided behaviour when the product does not expose a sides choice;
- default colour/mono behaviour when the product does not expose a print-colour choice.

The selling-price model is:

`total production cost × (1 + overhead %) × (1 + profit %)`

Client MYOB price-level factors and quote discounts still apply afterwards where configured.

## Digital click / impression costing

Machines now support separate:

- Colour click $ / printed side
- Mono click $ / printed side

When a Small Format product enables machine click costing, Production Manager calculates impressions from the required parent sheets (including configured waste) × printed sides. This replaces square-metre ink costing for that product.

## Printer runtime and attendance

Machines now support `A4 faces per minute` as a speed unit, which matches the supplied calculator's runtime method. For example, a speed of 100 A4 faces/minute is converted from parent-sheet count, printed sides and two A4 faces per SRA3/A3-class parent sheet for attendance calculations.

`sheets per hour` remains supported for machines configured that way.

To reproduce the manager spreadsheet most closely, configure the Small Format print labour operation at the required hourly labour rate and link it to the digital print process. If the click contract is intended to be the complete printer running charge, set that printer's separate machine $/hr cost to 0; speed is still used for operator-attendance calculations.

## Existing quotes

Existing saved or sent quote lines are not silently repriced. New Saved Product quote lines use the configured profile immediately. Existing lines only change when deliberately opened/recalculated and saved.

## Database

No database migration is required. Machine click rates are stored in the existing machine capabilities JSON and product costing profiles are stored in the existing configurator definition JSON.
