# Production Manager V26.10.17.18

## High-resolution, colour-aware quote wizard materials

- Added individual 1200 × 900 high-resolution material assets for white/black Acrylic, white/black PVC foam, white/black Corflute, brushed-silver/black ACM and white/black vinyl roll stock.
- Replaced the generic category imagery for Acrylic, ACM, Corflute, PVC/Foam and Vinyl/Roll Stock with the new high-resolution assets.
- Material cards now inspect the actual material name/details and automatically choose the matching image when the material specifies Black, White, Silver or Brushed finishes.
- Other named colours such as Red, Blue, Green, Yellow, Orange, Purple, Pink, Grey, Gold and similar are colour-tinted from the correct material texture so the visual tile reflects the named colour instead of always showing white.
- Existing quote calculations and wizard behaviour are unchanged.


## V26.10.17.16
- Quote wizard substrate cards sort by thickness from thinnest to thickest, then by colour/name.
- Other sheet is now a strict fallback category and excludes materials already classified as Acrylic, ACM, Corflute, PVC/Foam or Vinyl/Roll Stock.
- Replaced remaining low-resolution/cropped quote-wizard flow and artwork images with standalone 1200x900 assets.
- Rebuilt the Other sheet category image as a standalone high-resolution asset.


## V26.10.17.18
- Wizard selections no longer auto-advance; select an option, then press Continue.
- Restored realistic image-based Quote line type tiles instead of flat illustration placeholders.
- Acrylic now has separate Clear, White and Black image mappings.
- White acrylic uses an opaque white render; Clear acrylic uses the transparent/clear render.
- Substrate sorting remains thickness-first, then colour/name.
- Other sheet remains fallback-only for sheet materials without a dedicated category.

## V26.10.17.18
- Reframed all six visual quote-line category assets as clean standalone tiles with full subjects visible and no cropped UI/checkmark remnants.
- Replaced White Acrylic with a true opaque white acrylic render, separate from Clear Acrylic and Black Acrylic.
- Keeps the select-item-then-Continue wizard interaction from V26.10.17.17.
