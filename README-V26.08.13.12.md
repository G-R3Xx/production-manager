# Production Manager V26.08.13.12

## MYOB created-resource UID repair + customer sync recovery

Fixes the 404 that could appear when syncing a PM-created MYOB customer after the initial create succeeded.

### Root cause
- MYOB create responses can return the created resource URI in the HTTP `Location` header.
- Online AccountRight resource URIs contain the company-file/business GUID before the created resource GUID, e.g. `/accountright/{businessId}/Contact/Customer/{customerUid}`.
- V26.08.13.10/.11 fallback parsing selected the first GUID in that URI, so it could store `businessId` as the new customer UID.
- The next sync then requested `/Contact/Customer/{businessId}` and MYOB correctly returned 404.

### Fix
- Created-resource UID parsing now reads the final resource GUID from the Location path and explicitly excludes the current company-file GUID.
- The corrected parser is shared by PM -> MYOB customer, supplier, material/item and purchase-order creation.
- Existing customer links affected by the old parser self-repair on the next sync: PM first finds the customer by the saved MYOB DisplayID, then falls back to exact company/email/person matching, stores the real UID, and continues the requested update.
- If any old supplier/material mapping equals the company-file GUID it is treated as stale and re-matched instead of issuing a GET/PUT against the wrong UID.
- Existing purchase orders affected by the same old fallback are recovered by PO number before any new PO is created, avoiding duplicates.
- Explicit MYOB customer mappings stored in PM payload data now take precedence over the local imported-row identity when resolving the linked customer.

### Preserved functionality
- Structured client/supplier address and ABN mapping from V26.08.13.11 remains intact.
- OAuth login + automatic refresh, full pagination, MYOB Price Levels A-F, customer GST/Freight tax-code handling, PM -> MYOB master-data pushes, Purchasing/PO work, artwork and quote workflows remain in place.
