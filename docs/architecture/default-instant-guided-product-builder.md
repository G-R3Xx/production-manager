# Default instant Guided Product Builder — V26.07.29.09

The normal Product Create/Edit route now uses one client-side guided builder. Product setup is substrate-first and follows the same mental model as Build a Quick Quote.

## Normal workflow

1. Material
2. Size and quantity
3. Available print methods and default
4. Roll media and ink choices
5. Available laminates and default
6. Finishing defaults, including Quick Quote-style eyelet placement
7. Pickup, delivery or installation
8. Review and save once

All step changes are React state changes. They do not navigate, refetch the product or submit a server action. The final save updates the reusable quote fields, production recipe and shared WordPress option schema together.

Advanced product configuration remains available but is deliberately outside the everyday product workflow. No database migration is required.


## Website field reliability

The complete guided field schema is mirrored onto the product website configuration at save time. WordPress catalogue generation still prefers the linked configurator template, but uses the mirrored schema if that template is unavailable or has no fields. This prevents a published product from silently becoming an optionless WooCommerce product.
