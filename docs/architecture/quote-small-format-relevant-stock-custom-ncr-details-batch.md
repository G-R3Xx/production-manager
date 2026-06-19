# Quote small-format relevant stock, custom stock, and NCR details batch

## Goal
Tighten the quote-side small-format flow so it behaves like its own workflow instead of borrowing signage stock and signage assumptions.

## Changes

- Small-format stock selection now hides signage materials such as ACM, acrylic, corflute, PVC, banner, SAV, vinyl and laminate.
- Small-format stock selection now focuses on paper/card/NCR/carbon/bond style materials.
- Added a quote-only custom stock option for cases where the required small-format stock is not yet in the material library.
- Custom stock captures:
  - stock name
  - supplier
  - cost per sheet
  - sheet width
  - sheet height
  - GSM / thickness
- Duplicate / triplicate books now get a dedicated book details step before stock selection.
- Carbon book details now include:
  - duplicate / triplicate / quadruplicate
  - sets/pages per book
  - page 1 / page 2 / page 3 / page 4 colour selectors as applicable
  - cover colour
  - tape colour
- Carbon/NCR costing now accounts for copies per set and sets per book when calculating sheet usage.
- Small-format duplicate book review summary includes copy count, sets per book, page colours, cover colour and tape colour.

## Design note
The quote builder is now the primary workflow. Materials remain the library. Products/templates should stay background-only unless they provide a shortcut into this flow.
