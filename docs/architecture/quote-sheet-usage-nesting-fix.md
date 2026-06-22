# Quote sheet usage nesting fix

Updated the quote-side material card flow sheet costing so signage sheet materials are charged from practical sheet yield instead of raw area percentage only.

## Why
A 1200 × 2400mm sign on a 2440 × 1220mm sheet was showing about 0.967 of a sheet because the calculation was using:

`finished sqm / parent sheet sqm`

That is mathematically true by area, but not how this should quote. If the item uses one full parent sheet in practice, it should charge one sheet.

## Change
For sheet materials, the quote calculator now checks how many finished pieces fit on the parent sheet, including rotation:

- if 1 fits per sheet, charge 1 sheet
- if 2 fit per sheet, charge 0.5 sheet
- if 4 fit per sheet, charge 0.25 sheet
- if the piece does not fit, fall back to required full parent sheets and flag the note

The quote breakdown now shows a note like:

`1 up per parent sheet · 2.98sqm parent sheet`

instead of only:

`based on 2.98sqm parent sheet`
