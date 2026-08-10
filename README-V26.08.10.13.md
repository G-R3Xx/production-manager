# Production Manager V26.08.10.13

## MYOB customer creation

- Unlinked quote clients can now be created in MYOB directly from the quote.
- Before POSTing a new MYOB customer, Production Manager searches MYOB for an exact company name and/or email match to avoid duplicates.
- If exactly one match exists it is linked instead of creating a duplicate.
- If multiple exact matches exist, staff are asked to choose the existing customer manually.
- New MYOB customers receive a stable PM-prefixed DisplayID and are populated with the Production Manager client name/company, email, phone and billing/default address.
- The returned MYOB UID is stored against the Production Manager client and external mapping for future quotes/orders.
- Accepted quotes can use **Create & send to MYOB** to create/link the customer and immediately create the MYOB open order.
- Existing **Link customer** / **Link & send to MYOB** remain available.
