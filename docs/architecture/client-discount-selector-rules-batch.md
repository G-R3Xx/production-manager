# Client discount selector rules batch

## Change

The Clients page quantity/product type discount section has been changed from a manual pipe-delimited textarea to a guided selector UI.

## Behaviour

Each discount rule now has obvious controls for:

- Product type
- Minimum quantity
- Discount percentage
- Optional maximum quantity
- Optional note

The UI still submits the existing `discountRulesText` form field behind the scenes, so the current server action and customer payload format continue to work without a database migration.

## Notes

Existing custom product type values are preserved by adding the saved value to the dropdown for that row if it is not part of the standard preset list.
