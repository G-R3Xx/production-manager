# Production Manager V26.07.31.01

## Faster WordPress live pricing

- WordPress product pages can request live prices directly from Production Manager using a short-lived signed product token.
- Removes the WordPress AJAX proxy hop during normal option changes.
- Final Add to Cart pricing is still recalculated server-to-server before WooCommerce accepts the item.
- Supports browser request cancellation and short-lived configuration caching in WordPress plugin V3.3.6.

## Checkout fulfilment

- Pickup and delivery are no longer shown as product-builder questions on WordPress.
- WooCommerce cart/checkout owns shipping address, delivery and local-pickup selection.
- Product pages only show an Installation required choice when installation is available; selecting it switches to the tailored-quote workflow.

No database migration is required.

Visible application/catalogue version: `V26.07.31.01`.
