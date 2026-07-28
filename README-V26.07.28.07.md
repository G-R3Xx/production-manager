# Production Manager V26.07.28.07

## Production Manager ↔ WordPress/WooCommerce restructure

Production Manager is now the master source for website products, customer options, manufacturing methods and live pricing.

### Product workflow

The main Products area now uses a simplified catalogue and a five-tab editor:

1. **General** — product name, SKU, department, family and status.
2. **Build** — customer questions and the linked manufacturing method.
3. **Pricing** — recipe cost, markup, profit and live preview.
4. **Website** — website visibility, checkout/quote mode, descriptions, category, image and option display styles.
5. **Preview** — customer-facing and production preview.

The previous full configurator remains available from **Advanced setup** so existing products and workflows are not removed.

### WordPress bridge

New authenticated endpoints:

- `GET /api/wordpress/catalog`
- `GET /api/wordpress/products/:id`
- `POST /api/wordpress/price`
- `POST /api/wordpress/orders`

Configure the connection under **Settings → WordPress & WooCommerce**. Products marked active and enabled for the website are included in the catalogue feed.

### Database

Run `infra/sql/038_wordpress_product_publishing.sql` before using the bridge in production.
