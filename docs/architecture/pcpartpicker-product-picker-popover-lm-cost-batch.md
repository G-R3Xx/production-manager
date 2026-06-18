# PCPartPicker Product Picker: Popover + Roll $/lm Cost

## Why
The first PCPartPicker-style product builder opened the material selector underneath the build table. On taller/longer product screens this made the chooser feel like it had not opened at all.

Roll-stock rows were also showing the full roll purchase price in the picker, which made material selection confusing when the quote calculation uses linear metres.

## What changed

- Material selection now opens as a fixed popover/modal picker when a Product Builder row is clicked.
- The picker displays only applicable materials for the selected part/slot.
- The picker can be closed without selecting a material.
- The picker uses a scrollable table so long material lists do not push the page down.
- Roll-stock materials now show a calculated `$ / lm` cost in the picker and supplier summary.
- The old full roll cost is kept as supporting text, e.g. `$450.00 per 40lm roll`.

## Roll $/lm display rules

For roll-like materials, the UI displays `$ / lm` using this order:

1. If purchase UOM is already linear metre, show purchase cost as `$ / lm`.
2. If purchase UOM is roll and stock quantity is in lm, show `purchase cost / stock quantity`.
3. If stock quantity is in lm, derive `$ / lm` from `purchase cost / stock quantity`.
4. If purchase UOM is sqm and roll width is known, derive `$ / lm` from `$/sqm × roll width`.
5. Otherwise show `Set roll length` so the user knows the material needs stock quantity entered as roll length.

## Files changed

- `apps/web/src/app/(app)/products/page.tsx`
