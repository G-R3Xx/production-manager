# Production Manager V26.10.20.02

Australian release date: 20 October 2026.

## Client quote construction descriptions

- Fixes rigid signage quote lines with applied printable media being titled using the print-media name instead of the actual substrate.
- The saved main substrate is now the primary customer-facing material on both the online client quote and generated quote PDF.
- Applied print media is retained as a concise construction descriptor. Reverse-applied media is shown as `Reverse applied <customer-facing media name>`.
- Example: an acrylic panel using reverse-applied clear print now presents as `6mm Clear Acrylic · Reverse applied Clear Print · 1195x350mm` rather than only `Clear Print`.
- Internal supplier/SKU/consumption detail remains hidden from the client-facing description.

## Compatibility

- No database migration required.
- Existing saved quotes benefit immediately because the fix reads their existing configuration snapshots.
