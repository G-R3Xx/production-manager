# Production priority visibility / material breakdown

Updated the Production item view so production staff see the final item first, instead of a scattered set of quote/artwork fields.

## Changes

- Added a priority production instruction at the top of each production item.
- Generates a production-friendly title such as:
  - `ACM sign with direct print CMYK and gloss laminate 6000 × 1220mm`
- Finished size is now chosen from the actual quote-line choices where possible, not blindly from the artwork/source page title.
- Separates finished item details from required stock/media.
- Adds a Required stock / media / production requirements table.
- Calculates sheet requirements from quoted finished size and stock sheet size where possible, e.g.:
  - finished size `6000 × 1220mm`
  - stock `2440 × 1220mm`
  - result: `3 sheets`, with panel note.
- Adds media, direct print, laminate and finishing requirement rows based on the quote-line choices.
- Moves full quote-line choices into a collapsed details section so they are available without taking priority over production instructions.
