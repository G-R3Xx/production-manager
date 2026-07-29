# Production Manager V26.07.29.05

## WordPress Guided Builder schema reliability

- Mirrors the complete Guided Product Builder field schema onto the product website configuration whenever the product is saved.
- Continues to use the configurator template as the normal source of truth.
- Falls back to the mirrored product schema if the template relation is missing or stale, preventing an empty WordPress configurator.
- Preserves exact option labels, choices, defaults, conditional fields and eyelet placement settings.
- Updates the visible application and WordPress catalogue version to `V26.07.29.05`.
- No database migration is required.
