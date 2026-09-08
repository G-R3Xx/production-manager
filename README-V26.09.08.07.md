# Production Manager V26.09.08.07

## Branded client invoicing

- MYOB remains the accounting source of truth, but synced MYOB invoices can now be previewed and emailed to the client directly from the Production Manager invoice history.
- Added a Production Manager / Tender Edge styled invoice PDF using customer-facing quote line descriptions, invoice/job/quote/PO references, GST totals, MYOB balance and payment state.
- Added **View invoice PDF** and **Send invoice** / **Resend invoice** controls.
- Sending uses the same recipient-confirmation popup pattern as Quotes and Artwork Proofs. The prefilled email can be changed for that send without changing the saved client record.
- Client invoice email includes the branded PDF attachment and records recipient, sent date/time, message ID and failures against the PM invoice.
- Invoice history now distinguishes MYOB/accounting state from client-delivery state: Not sent, Sent to client or Email error.
- Once a full invoice is created but not sent, the job next action is **Send invoice to client**. After sending it becomes **Invoice sent / Await payment**; MYOB payment refresh still moves it to **Paid**.
- Existing invoice records require no database migration; client-delivery metadata is stored in the invoice payload.

App version updated to **V26.09.08.07**.
