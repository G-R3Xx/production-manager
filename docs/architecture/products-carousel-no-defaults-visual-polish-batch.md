# Products carousel: no defaults + visual polish

This batch continues the signage product workflow reset.

## Changes

- Product workflow choices no longer silently default to the first answer.
- Print type starts with nothing selected.
- Ink choices start with nothing selected.
- Laminate has `None` available, but quote defaults are not preselected.
- Starter product quote fields no longer preselect the first size/print/laminate/etc option by default. Quantity-style numeric fields may still carry sensible quantity defaults.
- Quote page select fields now show a `Choose ...` placeholder instead of automatically selecting the first option.
- Added more visual carousel styling:
  - coloured step icons
  - visual hero cards per step
  - coloured choice cards for direct print, roll stock, CMYK, white ink, laminate and finishing
  - icon-style material cards
  - stronger workflow header gradient

## Intent

The product creator should feel more like a visual build flow and less like a data-entry/configurator page. Staff should intentionally choose what a product allows rather than inheriting hidden defaults.
