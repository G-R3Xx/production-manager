# Production Manager V26.08.13.10

## MYOB customer creation tax defaults

Fixes PM -> MYOB customer creation failing with MYOB ErrorCode 100 because `SellingDetails.TaxCode` and `SellingDetails.FreightTaxCode` were omitted when setting the customer's MYOB Price Level.

- Resolves the active MYOB `GST` tax-code record through the already-granted `sme-general-ledger` scope.
- Sends the resolved MYOB tax-code UID + code as both `SellingDetails.TaxCode` and `SellingDetails.FreightTaxCode` when creating a customer.
- Keeps `UseCustomerTaxCode` false so normal item/sale tax handling is not overridden by the customer card.
- Does not require another OAuth consent cycle.
- Existing customer updates still preserve MYOB's existing SellingDetails and only overlay Production Manager's Price Level.
- Purchasing, PM -> MYOB supplier/material sync, pagination, OAuth refresh and all prior V26.08.13.09 features remain unchanged.
