# Production Manager V26.10.20.03

Australian release date: 20 October 2026.

## Quote catalogue visual controls

- Adds upload/replace slots to **Materials → Quote wizard category images** for the four Print Method tiles: **No print**, **Direct print**, **Roll stock** and **Cut vinyl**.
- The guided quote catalogue now reads those tenant-configured images exactly like the existing sign-type, artwork and service category images.
- Adds new built-in 1:1 default artwork for all four Print Method tiles so they look consistent immediately after deployment, before any tenant override is uploaded.
- Replaces the generic Access equipment fallback with a dedicated scissor-lift / boom-lift image. The existing **Access equipment** image slot remains available for a tenant-specific replacement.
- No database migration is required. New category image references are stored in the existing quote visual categories JSON.
