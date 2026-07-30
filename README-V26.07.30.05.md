# Production Manager V26.07.30.05

## Website product image galleries

- Replaces the single Product image URL field with a guided Website images manager.
- Upload up to 12 images directly from Production Manager, or add an existing image URL.
- Choose one featured image for WooCommerce listings, product pages, cart and checkout.
- Drag images into the required gallery order, with Earlier/Later controls as an accessible fallback.
- Add individual alt text for every image.
- Existing single image URLs automatically appear as the initial featured image.
- Images are stored in the public Supabase `product-assets` bucket.
- The WordPress catalogue now exports the complete ordered image list as well as the legacy featured image URL.
- Requires Tender Edge Website Platform V3.3.0 for WooCommerce Media Library and gallery synchronisation.
- No database migration is required because image metadata is stored in `website_config_json`.

Visible application/catalogue version: `V26.07.30.05`.
