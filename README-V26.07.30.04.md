# Production Manager V26.07.30.04

## Website product-name override

- Added an optional **Website product name** field under each product's Website settings.
- Internal product names remain unchanged for quoting and production.
- WordPress receives the override as the public WooCommerce product title.
- When the Website URL slug is blank, it is generated from the website product name rather than the internal name.
- Leaving the override blank preserves the existing behaviour and publishes the internal product name.
- No database migration is required because the override is stored in the existing website configuration JSON.

Visible application/catalogue version: `V26.07.30.04`.
