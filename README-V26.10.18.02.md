# Production Manager V26.10.18.02

## Existing quote load fix

- Fixes a Server Component crash when opening an existing quote after V26.10.18.01 if SQL migration `052_quote_visual_images.sql` has not yet been applied.
- Material quote-image columns are now checked against the live production schema and self-created when database permissions allow it.
- Existing quote/material reads remain backward-compatible even when the optional quote-image columns are absent.
- Quote category image settings now fall back to an empty configuration instead of crashing the Quotes page if the optional tenant setting column is missing.
- Existing quote loading no longer depends on the quote visual image migration succeeding.

## Quote visual image configuration

Retains V26.10.18.01 functionality for material-specific quote images and category fallback images.

Version: V26.10.18.02
