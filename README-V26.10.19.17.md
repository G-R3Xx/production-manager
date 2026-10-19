# Production Manager V26.10.19.17

Australian release date: 19 October 2026.

## Performance regression fix

- Removes the duplicate blurred image layer introduced in V26.10.19.16 quote material tiles. Each tile now renders a single image.
- Quote wizard and Material Price Manager thumbnails use lazy loading and asynchronous decoding.
- Standard quote-image uploads remain square but are stored as a lighter 720 x 720 WebP asset, which is ample for the quote-card UI while reducing decode, upload and transfer cost.
- Routine Material Price Manager saves no longer force a full Server Component refresh after editing existing rows. Local state is already authoritative after a successful save, so the expensive material/image reload is skipped.
- A refresh is still performed when adding a new material (to obtain its generated ID) or when a new supplier placeholder is created.
- Normalizing existing quote images no longer performs an unnecessary full page refresh after all image uploads complete.

## Image consistency

The 1:1 quote-image standard from V26.10.19.16 is retained. The performance changes do not return to mixed-ratio material assets.
