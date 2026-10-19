# Production Manager V26.10.19.13

## Catalogue image cards

- Catalogue material cards now use a true square viewport rather than a fixed 210px height.
- Uploaded material images are rendered with `object-fit: contain` inside that square viewport, with a safe inset around every edge.
- This prevents square/portrait product artwork from being clipped at the top, bottom or sides while keeping the image-only Catalogue layout.
- No pricing or quote-calculation logic changed in this release.

Version: V26.10.19.13
