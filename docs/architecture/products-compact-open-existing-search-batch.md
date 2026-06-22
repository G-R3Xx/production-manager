# Products compact open-existing search batch

## Goal
Reduce clutter on the Products entry screen so it feels closer to a PCPartPicker-style builder.

## Changes
- Removed the always-visible existing-product list from the Open existing panel.
- Open existing is now a compact search/select area.
- Product results are hidden until the user searches.
- Search results are limited to the first 8 matches with a hint to refine the search.
- Fixed the layout stretch that made the right panel grow to match the full height of the create-product card.
- Search input and button now have fixed compact heights so the search area does not become a giant dropdown-looking block.

## Why
The previous screen wasted space and visually competed with the create-product flow. Existing products should be found by search, not shown as a long scroll list by default.
