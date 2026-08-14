# Production Manager V26.08.14.06

## Automatic MYOB master-data sync

- Client, Supplier and Material saves no longer wait for MYOB before returning control to the user.
- When MYOB is connected, saves mark the record as queued and schedule the MYOB write with Next.js `after()` so the local save response is not blocked by MYOB latency.
- Automatic sync state is visible as: queued, syncing, synced, or sync failed.
- Pages automatically refresh while a record is queued/syncing so the badge updates without a manual browser refresh.
- Transient MYOB/network failures receive one automatic retry before the record is marked failed.
- Final failures create a Production Manager Alert with the MYOB error and a link back to the affected record.
- Manual `Sync to MYOB` buttons remain available as recovery/testing tools and now update the same visible sync state.
- Rapid repeated saves are coalesced with a queue token so an older queued callback will not overwrite a newer save.
- Automatic master-data results are written to Integration job history as MYOB reconcile runs.

## Preserved

- V26.08.14.04 Gmail SMTP purchase-order email workflow using `GMAIL_USER` / `GMAIL_APP_PASSWORD`.
- Purchase Order PDF/history/resend workflow.
- Proven MYOB Customer, Supplier, Material/Item and Item Purchase Order writes.
- OAuth refresh, pagination, Price Levels A-F, structured addresses and purchasing defaults.


## V26.08.14.06 — customer-facing roll media on public quotes

- Public/client quote signage lines now show the selected roll media's **Customer-facing name** instead of the generic `Roll Stock` print-method label.
- The value is read from the quote line's saved material snapshot, so existing sent quotes update without changing their saved price.
- Older quick-quote lines without a material snapshot fall back to the selected media stored in the option summary.
- If no selected/public media name can be recovered, the client quote still falls back safely to `Roll Stock`.
- Internal quote/production detail, pricing, MYOB sync, automatic master-data sync, Purchasing and PO email workflows are unchanged.
