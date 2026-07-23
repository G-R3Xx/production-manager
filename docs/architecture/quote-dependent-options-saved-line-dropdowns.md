# Quote dependent options and saved-line dropdown editing

Version: V26.07.23.01

- Carbon Book copy-colour choices now follow the selected copy set:
  - Duplicate shows two-colour combinations.
  - Triplicate shows three-colour combinations.
  - Quadruplicate shows four-colour combinations when configured.
  - Custom remains available.
- Changing the parent copy-set answer clears an incompatible copy-colour answer.
- Saved quote lines linked to a configured product now edit with the product's saved dropdowns, checkboxes and number fields instead of manual text-only values.
- Dependent option lists also update inside the saved-line editor.
- Saved-line changes still rebuild the client-facing / production summary and recalculate line total from quantity × unit price.
- Fixed Carbon Book Pages being mistaken for the quote-line quantity. The actual Quantity field now drives line totals, while Pages remains part of the option summary.
