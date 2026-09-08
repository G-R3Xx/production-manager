# Production Manager V26.09.08.05

## MYOB invoice conversion recovery

This build fixes MYOB error **37001 / OrderConvertedToInvoice** when a linked MYOB Order has already been converted before Production Manager completes its invoice sync.

### Safe recovery instead of duplicate invoicing
- PM now reads the linked MYOB Order status before attempting conversion.
- If MYOB reports **ConvertedToInvoice**, PM does **not** create another invoice.
- PM locates the MYOB Item Invoice that retains the source Order UID, validates the customer and ex-GST subtotal, then links that existing invoice back to the PM invoice record.
- If MYOB converts the Order between PM's status check and POST, error 37001 is treated as a recovery signal and PM performs the same safe lookup/link process.
- Recovery updates the MYOB invoice UID, invoice number, MYOB status, balance and PM job invoice stage.
- The failed-draft action is now labelled **Recover / retry MYOB** because it can either safely link an existing converted invoice or retry creation when the Order is still open.
- Successful recovery messaging now states that the existing MYOB invoice was linked and that no duplicate was created.

### Compatibility
- No database migration is required beyond the invoicing schema already introduced in V26.09.08.04.
- Existing failed PM invoice drafts from V26.09.08.04 can be recovered by opening Invoice history and clicking **Recover / retry MYOB**.

App version updated to **V26.09.08.05**.
