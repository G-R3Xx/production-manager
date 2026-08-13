# Production Manager V26.08.13.13

## MYOB stale customer-link recovery timeout fix

This build fixes the timeout seen when syncing a customer created by Production Manager after V26.08.13.10/.11 had stored the company-file GUID instead of the resource UID from an MYOB `Location` header.

### Changes

- Keeps the V26.08.13.12 resource-UID parser fix.
- Changes stale customer-link repair to use the normal paginated `/Contact/Customer` collection (the same path used successfully by read-only sync), then matches the saved MYOB DisplayID locally. This avoids slow OData `DisplayID` / address filters during one-off repair.
- Falls back to exact local company/email/person matching against that same collection if the DisplayID is unavailable.
- Raises the client-side MYOB request timeout from 20 seconds to 45 seconds for reads and 60 seconds for writes, with a useful endpoint-specific timeout message.
- Customer, supplier and material exact-match checks fall back to their paginated collections when MYOB times out or returns a transient 5xx response while applying an OData filter. This prevents a temporary filtered-query failure from causing duplicate creates.
- Preserves structured customer/supplier addresses, ABN mapping, MYOB Price Levels A-F, OAuth refresh, pagination, PM -> MYOB pushes, Purchasing and PO sync.

### Intended Graphic Content recovery

After installing this build, `Graphic Content -> Sync to MYOB` should read the customer collection, find the existing MYOB card by its saved `PM...` DisplayID, replace the stale company-file GUID mapping with the real customer UID, then continue the normal PUT update for structured address, ABN and price level. It should not create another customer.
