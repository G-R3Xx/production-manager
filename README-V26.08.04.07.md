# Production Manager V26.08.04.07

## MYOB customer mapping

- Client Setup now shows whether each client is linked to an imported MYOB customer.
- Staff can explicitly choose the matching MYOB customer when names or emails are ambiguous.
- Manual clients also try a conservative unique email/company match before MYOB Order creation.

## WordPress order fulfilment

- WooCommerce sends Pickup or Delivery explicitly.
- Pickup jobs no longer show a delivery address in internal production notes.
- Delivery jobs retain the genuine WooCommerce shipping address.
- Re-sending an existing WooCommerce order repairs its dispatch type and removes stale delivery notes.

## Client purchase orders

- Website purchase-order numbers are stored on the accepted quote.
- The production instruction shows the client PO beside payment and quoted total.
- MYOB receives the client PO in `CustomerPurchaseOrderNumber`; the internal Production Manager quote number remains the MYOB Order number.

Use with Tender Edge WordPress plugin V3.3.26.
