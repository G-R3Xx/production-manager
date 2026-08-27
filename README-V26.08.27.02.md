# Production Manager V26.08.27.02

## V26.08.27.02

- Client-facing quote lines now use each laminate material's configured Customer Facing Name instead of the internal stock/material name.
- Calculated laminate linear-metre consumption remains internal and is no longer displayed on public/client quotes.
- Existing structured quote lines are corrected at display time from their saved material snapshot, so they do not need to be recreated when the snapshot already contains the customer-facing name.
- Standoff client-facing names are also resolved from the saved material snapshot where available, while internal costing and usage detail remain unchanged.
