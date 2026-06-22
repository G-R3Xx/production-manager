# PCPartPicker-style product builder batch

This batch changes the Products screen direction from a form/rule builder into a visual part-list builder.

## Goal

Make product setup feel like building a product from parts:

- Substrate
- Print media
- Ink / print charge
- Laminate
- Finishing / hardware
- Labour / process
- Outsourced supplier item
- Quote questions staff answer

The normal screen should feel closer to PCPartPicker: each row has a part category, current selection, cost basis, and a Choose/Change button.

## What changed

- Added a dark product-build header and part-list style main table.
- Added a left Product List summary showing selected/missing build parts.
- Added Choose/Change flows for substrate, print media, laminate and finishing materials.
- Material picker shows supplier, SKU, stock, size and purchase cost.
- Added simple panels for ink charges, labour rows, outsourced rows and quote questions.
- Moved the older spreadsheet-style recipe editor into an Advanced section so it is still available but no longer the main workflow.
- Added a supplier pricing / ordering direction panel to show how material detail pages can later become purchase order pages.

## Notes

This is a UI/process rebuild. It reuses the existing product definition JSON and server actions so existing quote calculations still work.

The next deeper batch should add first-class supplier price rows and purchase-order creation from a material detail page.
