# Production Manager V26.08.13.02

## MYOB Price Level pricing model cleanup

Production Manager now uses the MYOB customer Price Level A-F as the single persistent customer pricing class.

### Changed
- Retired Production Manager's old permanent client default-discount percentage and quantity-discount-rule UI/pricing logic.
- Client setup now uses the customer's MYOB Price Level A-F only, including MYOB's customised price-level names.
- Added Company Settings percentages for Level A-F to adjust PM-calculated custom work after `cost × markup × profit`.
- New PM-calculated quote lines use the selected customer's MYOB price-level factor.
- Existing saved-product quote lines use the same factor when recalculated.
- A quote can still have a manual one-off quote discount; it is not stored as a permanent client discount.
- Saved quote lines can still be manually price-adjusted through their unit-price edit, preserving one-off line exceptions.
- MYOB-linked saved products with an imported Item Price Matrix use the actual MYOB A-F sell price and the applicable MYOB quantity break. PM markup/profit/level factors are not layered on top of those matrix prices.
- MYOB Item Price Matrix data continues to be imported and retained without being overwritten by PM factors.
- Existing MYOB customer price-level assignments continue to sync both directions.

### Data compatibility
- Existing quote `discount_percent` values are retained so historical/test quotes keep their agreed pricing.
- Migration `041_myob_price_level_pricing.sql` adds the A-F PM factor settings and removes the retired client discount keys from customer JSON only.
- No MYOB item price matrices are modified.
