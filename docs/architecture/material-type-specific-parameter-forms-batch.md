# Material type specific parameter forms

This batch changes the Materials create/edit experience so the requested fields change based on the selected material type.

## Why

The old Material form showed every possible field at once:

- stock UOM
- purchase UOM
- stock qty / roll length
- sheet width
- sheet length
- roll width
- GSM / thickness

That made rigid sheets, roll stock, small format paper/card, and hardware all feel like the same thing.

## New behaviour

The form now changes after choosing **Material type**.

### Sheet material

Used for ACM, corflute, acrylic, PVC, foamboard.

Shows:

- Sheet width mm
- Sheet length mm
- GSM / Thickness
- Bought as: sheet / pack / pallet
- Used as: sheet / sqm / each
- Sheets in stock
- Cost per sheet

### Roll media / roll laminate / cello

Used for SAV, banner, laminate, cello rolls.

Shows:

- Roll width mm
- Roll length lm
- GSM / Thickness / micron
- Bought as: roll / lm / sqm
- Used / sold as: lm / sqm / roll
- Purchase cost

This supports the existing product picker behaviour where full-roll purchases can be shown as calculated $/lm.

### Paper stock / card stock

Used for business cards, flyers, books and small format print stocks.

Shows:

- Sheet width mm
- Sheet length mm
- GSM / Thickness
- Bought as: ream / pack / box / sheet
- Used / sold as: sheet / sqm / each
- Stock qty / sheets per ream
- Purchase cost

### Binding / finishing / fixing / item

Used for eyelets, screws, standoffs, binding tape, book tape, wire, and other consumables.

Shows:

- Bought as: box / pack / bag / each / roll where relevant
- Used / sold as: each / pack / box / lm
- Units per pack / stock qty
- Purchase cost
- Optional GSM / Thickness for binding/tape descriptions

## Files changed

- `apps/web/src/app/(app)/materials/MaterialForms.tsx`
- `apps/web/src/app/(app)/materials/page.tsx`
