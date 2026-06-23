# Artwork create placement below imported quote/survey data

This batch moves the Artwork Approvals page workflow into a clearer top-to-bottom order.

## Changed

- Removed the always-visible `Create from quote` panel from the top approval pack switcher.
- Added a full-width `Imported quote / survey data` section below the approval pack cards.
- The imported section now shows:
  - source quote number
  - client
  - quote value
  - eligible artwork quote-line count
  - quote-line artwork page sync count
  - imported quote/survey notes when present
- Moved `Create approval from quote` underneath the imported quote/survey data section.
- Kept the approval setup/proof editing area below the selected approval action header.

## Reason

The Artwork page should read like the actual workflow:

1. Select/switch approval pack.
2. Review imported quote/survey data.
3. Create approval from quote if needed.
4. Edit approval setup and proof pages.

This prevents the create area from stealing priority from the main artwork/proof work area.
