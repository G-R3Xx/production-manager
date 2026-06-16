# Products visual recipe builder rebuild

This batch rebuilds the Product creation experience from the current PrintOS-style UI direction into a simpler visual recipe builder.

## Goal

Product setup should be usable without training. A user should be able to understand the flow as:

1. Create/open the product.
2. Add quote cards staff will answer.
3. Fill answer lines.
4. Each answer line says what it adds to the quote price.

## Main UX changes

- Replaced the old product setup page structure with a visual **Product recipe builder**.
- Reduced visible terminology around components, rules and configurators.
- Normal product setup now focuses on quote cards and answer-line pricing.
- Product basics are collapsed into a small side panel.
- Starter rows are collapsed into a side panel.
- Hidden component rows are now only shown in a developer/advanced data preview.
- Added common recipe hints beside the builder.
- Added quick-add cards for Size, Print type, White ink, Laminate, Finishing and Quantity.

## Answer-line pricing model

Each answer line supports simple language:

- No extra cost
- Material from size
- Parts per sheet
- Sheets per item
- Metres per item
- $ per m²
- $ each

Examples:

- `600 x 900 mm` → `Parts per sheet` → `8`
- `SAV 7YR` → `Material from size` → linked to roll stock
- `White ink: Yes` → `$ per m²` → `10`
- `Laminate: None` → `No extra cost`

The underlying configurator component rows are still created through the existing server actions, but they are no longer the main UI concept.

## Files changed

- `apps/web/src/app/(app)/products/page.tsx`

## Notes

No database migration required. This is a UI/flow rebuild using the existing product template definition shape and existing product actions.
