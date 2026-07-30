# WordPress product image galleries

Production Manager remains the source of truth for product media.

Each published product stores an ordered `websiteImages` array in `catalog.products.website_config_json` and a `websiteFeaturedImageId`. The existing `website_image_url` column continues to hold the selected featured URL for backwards compatibility.

The Product → Website screen supports:

- direct image uploads to the public Supabase `product-assets` bucket;
- existing public image URLs;
- featured-image selection;
- gallery ordering;
- image removal; and
- per-image alternative text.

The WordPress catalogue payload includes both `imageUrl` and an `images` array. Tender Edge Website Platform V3.3.0 imports each source URL into the WordPress Media Library, reuses previously imported attachments, sets the WooCommerce featured image and ordered gallery, and updates alt text. Removing an image from the product removes it from that product's gallery but does not delete the Media Library attachment.
