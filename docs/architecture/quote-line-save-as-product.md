# Quote line → reusable product

Version: V26.07.23.04

## Workflow

Every saved quote line now has a **Save as reusable product** action in its editable panel.

- New/custom quote lines can be saved as an active product using the current line title, department, option details and current unit price.
- Existing line details are converted to editable product dropdowns by default. The current selections become defaults and more choices can be added later on the Products page.
- Lines already linked to a saved product offer **Save as new product** and **Update existing product**.
- Linked products can preserve their complete materials/labour/charge recipe, or replace it with the current quote-line unit-price basis.
- Quote-only quantity, client details, due dates and internal notes are not copied into the reusable product.
- The quote line is linked to the new or updated product immediately, so its saved dropdowns and automatic pricing are available after the page reloads.

## Pricing behaviour

When a custom line is saved using its current unit price, the product stores the equivalent base cost using the current global markup and profit multipliers. With the same company settings, future quotes reproduce the current unit price. If the global multipliers are changed later, the saved product follows the new company pricing settings.

Carbon-book quote lines that contain Size, Pages and Copies are saved with a calibrated scalable price basis. Future changes to A-size, page count, or duplicate/triplicate copy count adjust the unit price rather than leaving the saved price fixed.
