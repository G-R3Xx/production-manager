# Guided product setup flow batch

This rebuild replaces the confusing product/configurator-style layout with a guided single-page Products workflow.

## Goal

Make product creation foolproof without turning it into a multi-page wizard.

## Product setup flow

Products are now edited in one clear screen:

1. **Base product** - name, SKU/code, department, family and status.
2. **Components / materials** - purchased stock, media, laminate, hardware, consumables or labour/process rows the product can consume.
3. **Quote options** - choices staff select later during quoting, such as size, print type, roll stock, laminate, finishing, sides, GSM, copy count or quantity.

## Important product model

Product setup is not quoting.

Example base product:

- `Sign - ACM - 3mm`

Quote-time options for that product can then include:

- Size, which drives sheet allocation.
- Print type: direct print or roll stock.
- Roll stock: white or clear reverse print, only shown when roll stock is selected.
- Laminate: none, gloss or matt.
- Finishing: none, Jingwei cutting, CNC/router, drill holes, etc.
- Quantity.

## What changed

- Products page now shows a guided three-step progress strip at the top.
- Create Product is simplified to product name, SKU, product type, main material and stock usage.
- Product details are separated from quote options.
- Starter option packs are optional and clearly labelled as editable starter rows, not locked defaults.
- Components/materials have clearer add, edit and remove controls.
- Components can now be added as material/stock or labour/process rows.
- Components can be conditional on quote options through a dropdown instead of a hidden text-only key.
- Quote options have clearer add, edit, remove and reorder controls.
- Quote options can be required/optional and can be conditionally shown after another option.
- Tax remains GST by default and is not shown during product setup.
- No separate configurators page is exposed in navigation.

## Files changed

- `apps/web/src/app/(app)/products/page.tsx`
- `apps/web/src/app/(app)/products/actions.ts`

## Notes

The underlying database still stores product quote behaviour in the existing configurator template JSON structure for compatibility. The user-facing workflow no longer presents this as a separate configurator setup.
