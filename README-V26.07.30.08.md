# Production Manager V26.07.30.08

## WordPress gallery image compatibility

- Website image uploads now accept JPG, PNG, WebP, GIF, AVIF and SVG.
- SVG files are converted in the browser to a transparent high-resolution PNG before upload, because WordPress blocks SVG product images by default.
- Unsupported file formats are rejected before they reach Supabase or WordPress.
- SVG image URLs are blocked with a clear instruction to upload the file instead so it can be converted safely.
- Existing gallery management, featured image selection, alt text and ordering remain unchanged.
- Includes the compact Product Library grid from V26.07.30.07.

Existing SVG gallery entries must be removed and the original SVG uploaded again once. Production Manager will replace it with a WooCommerce-compatible PNG.

No database migration is required.

Visible application/catalogue version: `V26.07.30.08`.
