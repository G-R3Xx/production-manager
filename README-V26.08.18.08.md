# Production Manager V26.08.18.08

## MYOB A–F customer pricing on WooCommerce

- Website pricing now resolves the logged-in WooCommerce account to its linked Production Manager client (PM client ID where available, otherwise email/company).
- Logged-out/public website pricing uses MYOB **Level A**.
- PM-calculated website products apply the tenant's configured A–F factor after the standard PM cost × markup × profit calculation.
- Products linked to MYOB Items use the imported **MYOB Item Price Matrix** and applicable quantity break for the customer's A–F level.
- A PM A–F factor is never layered over a MYOB Item Price Matrix.
- Website order snapshots retain the pricing source, price level, factor/matrix level and quantity-break information used.
- Existing WordPress order/account matching remains unchanged.

## WordPress add-on

`wordpress/Tender-Edge-Account-Pricing-V1.0.0.zip` is included and can also be installed separately. It augments the current Tender Edge website platform rather than replacing it:

- logged-in browser live-pricing calls are proxied through WordPress to PM's authenticated pricing endpoint;
- server-side Add to Cart pricing gets the same account context;
- the PM API key is never exposed to the browser;
- logged-out visitors continue to use the existing public direct-pricing path;
- it auto-detects the existing PM URL/API key where possible and provides a small settings page as a fallback.

No MYOB, Purchasing, PO email, quote, artwork, production, job-sheet, or split-scroll workflow was removed or rewritten.
