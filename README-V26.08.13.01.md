# Production Manager V26.08.13.01

## MYOB price levels

- Syncs MYOB customer Item Price Level A-F into Production Manager.
- Syncs MYOB customised price-level names from Inventory/PriceLevelDetail.
- Client setup shows the MYOB price level and allows changing it.
- Changing the price level for an already-linked MYOB customer writes that level back to MYOB while preserving the rest of the customer card.
- New MYOB customers created from Production Manager receive the client's selected price level (Level A default).
- Linking an existing MYOB customer copies its current price level into the Production Manager client.
- MYOB item imports now also retain the ItemPriceMatrix and level names in product payload data, without overwriting the MYOB price matrix.
- MYOB remains the source of truth for custom price-level names and item price matrices; Production Manager does not convert them into generic percentage discounts.
