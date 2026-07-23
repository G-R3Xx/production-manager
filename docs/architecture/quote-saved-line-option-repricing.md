# Saved quote line option repricing

Version: V26.07.23.03

## Changes

- Editing a saved product quote line now reruns the same product/material pricing engine used by the saved product picker.
- Size changes now understand standard A-series and DL sizes as real dimensions, not just custom `width × height` values.
- Carbon Book material usage now responds to:
  - finished size;
  - pages/sets per book;
  - duplicate, triplicate or quadruplicate copy count.
- The unit price updates after a configured product option changes, while the quote quantity continues to control the line total.
- A manually edited unit price remains an override and can be reset with **Use recalculated price**.
- When a Carbon Book has no complete automatic product pricing recipe, the editor transparently scales from the existing saved unit price using size, pages and copy-count ratios rather than leaving the price unchanged.
- Incomplete product recipes are not treated as authoritative automatic prices when applicable material rows are missing.
