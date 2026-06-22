# Quotes selectable product options batch

This batch fixes the confusing quote-entry behaviour where quote options were typed into one free-text `Preset options` box.

## Changed

- Replaced the single manual preset-options input on the Quotes page with a proper selectable quote-line builder.
- When a product is selected, the quote entry screen now reads that product's setup/template fields and renders the actual quote questions as dropdowns, number inputs, yes/no fields, or text inputs.
- Conditional questions are supported. For example, `Roll stock` only appears when `Print type` is set to `Roll stock applied`.
- Quantity is taken from the product's quote question when the product has a Quantity field.
- The line still saves to the existing quote line table using the current `option_summary`, `quantity`, `unit_price`, and notes fields, so no database migration is required.
- Products without quote questions still fall back to a manual summary field, with a note telling the user to add quote questions on the Products page.

## Files changed

- `apps/web/src/app/(app)/quotes/page.tsx`
- `apps/web/src/app/(app)/quotes/QuoteLineBuilder.tsx`

## Why

Product setup and quote entry were correctly separated, but quote entry was not using the selectable questions created on the product. This made it look like options could only be typed manually.

Now the flow is:

1. Create/open a product on Products.
2. Add quote questions such as Size, Print type, Laminate, Finishing, and Quantity.
3. Open Quotes.
4. Select the product.
5. Select the actual quote options from the generated controls.
6. Set unit price and add the line.
