# Production Manager V26.08.14.03

## Purchasing status + outbound email cleanup

- Repairs legacy Purchase Orders that already have a MYOB UID but inherited `myob_sync_status = not_synced` when the explicit sync-status columns were introduced.
- The Purchasing UI also defensively treats a legacy `not_synced` row with a real MYOB UID as synced, so an existing PO cannot show `MYOB PO-xxxxx` and `MYOB: not synced` at the same time.
- MYOB/email purchasing actions now revalidate the Purchasing page before redirecting so the result badges are refreshed immediately after a send/sync action.
- Purchase-order list status text now follows the real email/MYOB status fields rather than merely checking whether a MYOB number exists.
- Audited the pre-existing Production Manager email flows: quote and artwork email buttons are `mailto:` links that open the user's local mail application; there was no reusable server-side outbound sender capable of attaching a generated PDF.
- Extracts the Resend HTTP implementation into a reusable `outbound-email` server service. Purchase Orders use that shared service now, and it can be reused by future automated quote/artwork notifications rather than leaving email transport embedded inside Purchasing.
- Keeps `RESEND_API_KEY`, `PURCHASE_ORDER_FROM_EMAIL`, and optional `PURCHASE_ORDER_REPLY_TO` as the existing Purchase Order deployment settings. MYOB remains independent if supplier email is not configured.
- No MYOB payload, PO PDF layout, pricing, material/item mapping, purchasing account/tax settings, client/supplier/material sync or quote workflow was removed.
