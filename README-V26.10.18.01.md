# Production Manager V26.10.18.02

## Quote wizard image management

- Added an optional **Quote wizard image** to material Create/Edit. The exact uploaded image is used for that material in the visual quote wizard.
- Added an explicit **Quote wizard category** to signage materials: Acrylic, ACM, Corflute, PVC/Foam, Vinyl/Roll Stock or Other sheet.
- Added **Materials → Quote wizard category images** for Owner/Manager users to upload the fallback image used by each quote-line type, sign type and artwork choice.
- Quote wizard image priority is now **Material image → Category image → built-in fallback**.
- Uploaded images use `object-fit: contain`, so PM does not crop them to fill a card.
- **Other sheet** remains a fallback category only: explicitly categorized Acrylic/ACM/Corflute/PVC/Vinyl materials cannot also appear there.
- Category and material images are stored in the public Supabase `quote-visuals` bucket.

## Database

Migration `infra/sql/052_quote_visual_images.sql` adds:

- `catalog.materials.quote_image_url`
- `catalog.materials.quote_image_storage_path`
- `catalog.materials.quote_visual_category`
- `app.tenant_settings.quote_visual_categories_json`

Runtime schema hardening also creates these columns if the migration has not yet been run.

## Version

V26.10.18.02
