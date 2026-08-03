# Production Manager V26.08.03.01

## WooCommerce order-to-production workflow

- Paid, processing, on-hold and completed WooCommerce orders create production jobs immediately.
- Website orders keep a hidden commercial record for totals and MYOB, but no longer clutter the normal Quotes list.
- Checkout email and company names are matched to existing Production Manager clients.
- Unmatched customers use the configurable MYOB Cash Sale client under Settings → WordPress & WooCommerce.
- Customer contact and delivery details remain attached to the production job.
- Print-ready artwork uploaded on the product page is attached to the production item. Multiple files remain available as separate secure links.
- MYOB order sync uses the resolved client, including the Cash Sale mapping.

## Alerts

The application header now includes an alert centre for:

- New production jobs
- New enquiries
- Artwork approved
- Artwork changes requested

Alerts link directly to the relevant workflow and can be marked read together.

## Companion WordPress plugin

Use Tender Edge V2 Platform V3.3.13. Admin new-order emails now include secure artwork download links, and the order handoff includes the WooCommerce customer ID plus all uploaded artwork metadata.

No manual database migration is required. Required columns and tables are added safely when the application first loads the related feature.
