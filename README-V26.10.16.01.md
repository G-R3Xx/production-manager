# Production Manager V26.10.16.01

Based on V26.10.12.01.

## Quote entry layouts

- Adds a second per-user quote-entry layout: **Visual catalogue**.
- Existing **List** quote entry remains unchanged and is the default for all existing/new staff.
- Owners and managers can choose each staff member's quote layout under **Staff & roles**.
- The user preference is stored on `app.memberships.quote_entry_layout`; runtime schema fallback creates the column when required.

## Visual catalogue

- Searchable saved-product catalogue with Signage / Small format filters.
- Saved products are shown as image cards using their existing product website image where available, with a generated visual fallback when no image exists.
- Catalogue is paginated at 8 saved products per page.
- Includes a prominent **Quick / custom line** card for one-off work.
- Selecting a saved product or Quick / custom line opens the existing quote builder in a large popup.
- Saved-product cards preselect the chosen product and hide the redundant product picker inside the popup.
- Closing and reopening the current popup preserves unfinished client-side entries until the page is refreshed or the quote line is saved.
- Both layouts continue to use the same existing pricing, material usage, labour, markup/profit and quote-line save actions.

## Product data

- Quote product payload now includes the existing `website_image_url` so catalogue cards can display product graphics.

## Validation

- TypeScript transpile/syntax checks passed for all changed TS/TSX files using the installed TypeScript 5.8.3 compiler.
- Targeted structural checks passed for the user preference, runtime DB fallback, product image mapping, search, pagination, modal builder, product preselection and hidden product picker.
- A full workspace install/build could not be run in this environment because package-manager downloads are blocked by network access.
