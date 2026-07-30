# Production Manager V26.07.30.01

## Roll-stock product costing correction

- Treats the Guided Product Builder main material as the product's fixed base material.
- Roll materials bought as a full roll are converted to a true cost per linear metre using the saved roll length.
- The product price check, saved-product quote builder, Quick Quote calculations and WordPress live pricing now use the same roll-cost conversion.
- Removes the redundant `Roll stock` quote question when the selected main material is already roll stock or a fixed roll media has been selected.
- Rebuilds the base-material recipe row whenever the Guided Product Builder is saved, so changing the main substrate updates quoting as well as production.
- Removes legacy duplicate ink charges left by older starter templates.
- No database migration is required.
- Visible application/catalogue version: `V26.07.30.01`.
