# Production Manager V26.10.19.16

This build continues from V26.10.19.15.

## Quote material image consistency

- Material-specific quote images now use a single **1:1 square** Production Manager image standard.
- New quote-image uploads from the Material Price Manager are automatically prepared to a 1200 × 1200 WebP before upload.
- Detailed Add/Edit Material quote-image uploads are also prepared to the same square standard.
- Quote wizard category-image uploads use the same square standard.
- Image preparation keeps the complete subject visible rather than cropping it. Unused canvas area is filled from the source image edge colour so the generated grey studio backgrounds remain visually continuous.
- Added **Normalize quote images** to Material Price Manager. It converts all currently saved material quote images to the same 1:1 standard and reports any images that could not be processed.
- The quote wizard now renders legacy mixed-ratio images over a soft image-derived background, so existing landscape assets no longer show obvious white/empty letterbox bands while they are awaiting normalisation.
- Material Price Manager and detailed material previews now use square preview frames so the required image shape is visible to staff.

## Carried forward

- Material Price Manager billing increment controls for sheet and roll stock.
- Dedicated **Sync all Materials to MYOB** action with synced/failed result counts.

Version: V26.10.19.16
