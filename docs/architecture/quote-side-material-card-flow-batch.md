# Quote-side material card flow batch

This batch moves the main product-building experience out of Products and onto the Quotes page.

## Reason

The previous product builder was becoming cluttered because it tried to make users build products, questions, materials and costing rules before quoting. Glen clarified that the normal workflow should be quote-first:

1. Choose the base material/category.
2. Answer visual card steps for the real job.
3. Calculate from the selected material, size and process choices.
4. Save the configured quote line.

Products/templates are still allowed to exist as future shortcuts, but they are no longer the main quoting experience.

## New Quotes workflow

The selected quote now shows a card/carousel style line builder:

1. Base material/category: Acrylic, ACM, Corflute, PVC, Vinyl/Roll Stock, or other sheet.
2. Thickness, derived from material names or GSM/thickness fields.
3. Colour/finish, derived from the matching material names.
4. Finished sign size.
5. Print method: No print, Direct print, Roll stock, or Cut vinyl.
6. Roll media/cut vinyl material picker when roll/cut is selected.
7. Ink: CMYK, White, or CMYK + White, when print method needs ink.
8. Sides and clear-acrylic print direction.
9. Laminate: None or actual laminate material.
10. Finishing: Jingwei, router/CNC, drill holes, and eyelets.
11. Review and save the quote line.

No default print, ink or laminate choice is silently selected.

## Pricing

The builder calculates live cost from:

- main sheet or roll material usage,
- roll media linear metres,
- ink sell charge at $10/m² for CMYK and $10/m² for white,
- laminate linear metres,
- finishing labour,
- eyelet material and labour if available,
- global markup multiplier,
- global profit multiplier.

Quote lines can now be saved without a product ID. The `sales.quote_lines.product_id` column is nullable, so material-built quote lines save using a generated product/line name such as `Acrylic sign`.

## Files changed

- `apps/web/src/app/(app)/quotes/page.tsx`
- `apps/web/src/app/(app)/quotes/QuoteMaterialFlowBuilder.tsx`
- `apps/web/src/app/(app)/quotes/actions.ts`
