# Production Manager V26.09.08.09

## Automatic MYOB Order creation on quote acceptance

- Accepted quotes now automatically create an open MYOB **Item Order**. Staff no longer need to press a separate Send to MYOB button for the normal workflow.
- Whole-quote acceptance, per-line acceptance that completes the quote, and staff-recorded offline/email acceptance all trigger the same automatic order workflow.
- Production Manager first uses the linked MYOB customer. If the PM client is not yet linked, PM safely attempts to match an existing MYOB customer and, where no exact match exists, creates and links the customer before creating the Order.
- If automatic MYOB creation cannot complete (for example missing MYOB connection, ambiguous client match, or missing sales defaults), the quote remains accepted, the MYOB sync state records the error, and staff receive an alert instead of losing the client acceptance.
- Added an atomic sync claim so acceptance, page refreshes and manual retries cannot create duplicate MYOB Orders. A stale syncing claim can be recovered after 10 minutes.
- Existing accepted quotes that have never been synced are automatically backfilled the next time that quote is opened in the Quotes screen.
- The manual control is retained as **Retry MYOB Item Order** for genuine sync errors.
- Production wording has been updated to reflect that MYOB Order creation is automatic.

No database migration is required.

App version updated to **V26.09.08.09**.
