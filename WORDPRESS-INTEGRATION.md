# Production Manager → WordPress/WooCommerce

## Source of truth

Production Manager owns:

- product identity and status
- customer builder questions and dependencies
- manufacturing methods
- materials, machines, labour and process costs
- markup/profit and live selling price
- website mode, descriptions, category, image and question display style

WordPress owns:

- storefront presentation and WooCommerce catalogue records
- customer account, cart, checkout, payment and order lifecycle
- a synchronised copy of published product metadata

## Catalogue flow

1. A Production Manager product is marked **Active** and **Publish this product to WordPress**.
2. The WordPress plugin pulls `GET /api/wordpress/catalog` using its API key.
3. The plugin creates or updates a normal WooCommerce simple product.
4. The Production Manager product UUID is stored in `_te_pm_product_id`.
5. Products omitted from a later feed are marked stale and moved to draft/hidden in WordPress, not deleted.

## Pricing flow

1. The WooCommerce builder renders the Product Manager question schema.
2. Each customer change posts the selected configuration to `POST /api/wordpress/price`.
3. Production Manager resolves dimensions, quantity, manufacturing method and shared cost recipe.
4. Before add-to-cart, WordPress repeats the calculation server-side.
5. WooCommerce stores the returned line total and configuration on the cart item.

## Order flow

1. WooCommerce creates the order and stores the PM product UUID/configuration on each order line.
2. The plugin posts the order to `POST /api/wordpress/orders`.
3. Production Manager creates a quote/order record containing the exact answers, dimensions, quantity, costing and manufacturing method.
4. Paid/processing WooCommerce orders are marked accepted and ready for the existing MYOB Order workflow.
5. Later WooCommerce status changes update the existing PM record idempotently.

## Security

- Endpoints require a tenant-specific bearer API key.
- WordPress never receives internal database access.
- Browser price requests are proxied through WordPress; the PM API key is never exposed to the customer.
- Add-to-cart pricing is revalidated server-side.


## Product images

Production Manager V26.07.30.05 and Tender Edge Website Platform V3.3.0 support one featured image plus an ordered WooCommerce product gallery. Manage images under Product → Website, save, then run Sync Products Now in WordPress. WordPress imports and reuses Media Library attachments by source URL.

Production Manager V26.07.30.06 changes gallery file uploads to direct signed Supabase uploads before the Website settings form is saved. This avoids Vercel request-size/server-action failures. Tender Edge Website Platform V3.3.0 remains compatible and does not need to be replaced.

## Direct live pricing (V26.07.31.01 / plugin V3.3.6)

The catalogue response includes the WordPress connection ID. The plugin uses that ID and its private API key to create a short-lived HMAC token tied to one product and the WordPress origin. Product-page calculations call `/api/wordpress/direct-price` directly with that signed token. The API key is never exposed to the browser. WooCommerce still repeats the calculation server-to-server during Add to Cart, so browser results are never trusted as the final cart price.

Pickup and delivery are handled by WooCommerce shipping methods at cart/checkout. The published product schema only retains an Installation required choice when installation is available.
