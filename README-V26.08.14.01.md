# Production Manager V26.08.14.01

## Purchase order send workflow

- Adds a primary **Send Purchase Order** action that independently:
  - emails the supplier a branded Purchase Order PDF, and
  - creates/updates the same Item Purchase Order in MYOB.
- Email and MYOB results are tracked separately so one failure does not block the other.
- Adds **Email only**, **Sync to MYOB only**, **Download PDF** and resend/retry controls.
- Adds per-PO status for email and MYOB plus a send/sync history.
- Archives the exact successfully emailed PDF in the purchasing schema so later downloads return the sent document.
- Adds a dedicated **Purchase order email** to Supplier records, falling back to the supplier general email.
- Uses the existing company/trading name, ABN, contact details, ship-to, promised date, PO notes, material SKUs, quantities, costs and GST settings in the generated PDF/email.
- Uses Resend's HTTPS email API without adding a package dependency. Configure deployment secrets:
  - `RESEND_API_KEY`
  - `PURCHASE_ORDER_FROM_EMAIL` (must be a sender/domain accepted by the email provider; Company email is the fallback)
  - optional `PURCHASE_ORDER_REPLY_TO`
- Existing MYOB OAuth/refresh, pagination, client/supplier/material sync, structured addresses, Price Levels A-F, Purchasing defaults and PO item-link/update logic remain in place.

## Validation notes

See delivery response for the exact validation performed in the build environment.
