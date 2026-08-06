# Production Manager V26.08.06.04

## Pack-to-each fixing cost correction

- Correctly converts hardware bought by pack, box or bag into an each cost when product recipes consume individual items.
- Example: a $17 pack containing 4 standoffs now costs $4.25 per standoff, rather than $17 per standoff.
- Applies the corrected rate to internal saved-product quote pricing, WordPress live pricing and production recipe previews.
- Keeps standoff quantity driven by holes per sign × product quantity.
- Clarifies the Materials helper text for Units per pack / stock qty.
- Pairs with Tender Edge Website Platform V3.3.35, which invalidates previously cached live prices after this pricing correction.
