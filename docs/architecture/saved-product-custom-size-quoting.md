# Saved-product custom size quoting — V26.07.30.02

The saved-product quote flow treats a `size_select` answer with the value or label `custom` / `Custom size` as a request for explicit finished dimensions.

The UI stores the measurements alongside the field answer using internal answer keys:

- `<field key>__width_mm`
- `<field key>__height_mm`

Pricing resolves these measurements before looking at preset option dimensions or parsing the option label. This means the same existing component rules calculate sheet yield, roll length, square-metre ink, laminate and dimension-based labour from the custom finished size.

The quote summary renders the actual `width × height mm`. Both fields are required while Custom size is selected.
