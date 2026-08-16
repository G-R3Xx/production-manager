# Production Manager V26.08.14.15

## MYOB accepted quote -> Sales Order fix

- Fixes `Send to MYOB Order` failing because MYOB Service Order lines require an Account UID and TaxCode UID, and the order requires FreightTaxCode UID.
- Sales Orders now use the linked MYOB customer's SellingDetails Income Account when one is configured.
- Adds a tenant-level **Default sales income account** selector on the accepted quote MYOB card as the fallback for PM-calculated work/customers without a MYOB Income Account.
- Uses the linked MYOB customer's TaxCode/FreightTaxCode when present, otherwise resolves the active GST TaxCode UID.
- Service Order lines now send the required `Account.UID` and `TaxCode.UID`; freight sends `FreightTaxCode.UID`.
- Lets MYOB allocate the Sales Order number instead of forcing the PM quote number into MYOB's shorter order-number field; the PM quote number remains in the order memo/mapping.
- Reads the created MYOB Sales Order UID from the response/location and fetches the assigned MYOB order number when necessary.
- New PM-created MYOB customers inherit the configured default sales income account when available.

## Preserved

- V26.08.14.14 cancelled-line hiding on revised client quotes.
- Inline quote component editing.
- Direct Gmail quote and Purchase Order email.
- MYOB OAuth refresh, pagination, customer/supplier/material sync and Purchasing/PO sync.
- MYOB Price Levels A-F and quote-line revision workflow.
