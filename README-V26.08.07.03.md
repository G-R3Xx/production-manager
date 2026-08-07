# Production Manager V26.08.07.03

## Auto-select parent sheet sizes

- Extends customer-facing material groups from roll widths to sheet-stock parent sizes.
- Materials with the same material type and Customer-facing name can be treated as interchangeable size variants.
- Guided Product Builder now shows one grouped base-material choice instead of requiring separate parent-sheet choices.
- Quotes compare parent-sheet fit, rotation, pieces per sheet, quantity, minimum billable sheet fraction and stock cost before selecting the physical stock item.
- WordPress live pricing uses the same grouped sheet candidates and rejects parent sheets that cannot physically fit the finished item.
- The exact stock item selected remains in internal costing/production data while the client sees only the Customer-facing name.
- Existing grouped roll-width behaviour is retained.

Example: 3 mm Clear Acrylic stocked as 2440×1220 and 3050×1500 can be exposed as one customer choice, `3mm Clear Acrylic`, while the system selects the most economical valid parent sheet for each size and quantity.
