# Production Manager V26.08.13.14

## MYOB supplier creation fix

- Fixes MYOB `400 BuyingDetails is required` when a Production Manager supplier is first pushed to MYOB.
- New MYOB suppliers now receive required `BuyingDetails` using the tenant's existing Purchasing defaults:
  - Purchase layout: Item
  - Expense / Cost of Sales account: configured Purchasing default
  - Purchase tax code: configured Purchasing default
  - Freight tax code: same configured purchase tax code
  - Use supplier tax code: enabled
  - Reportable taxable payments: disabled by default
- Does not replace or overwrite `BuyingDetails` on existing MYOB suppliers; updates continue to preserve MYOB's current supplier purchasing details.
- If Purchasing defaults have not been configured, supplier creation now returns a clear setup message instead of sending an invalid MYOB payload.
- Preserves V26.08.13.13 customer mapping repair, OAuth refresh, pagination, structured addresses, MYOB Price Levels, materials sync and Purchasing/PO work.
