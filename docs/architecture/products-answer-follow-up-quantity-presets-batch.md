# Products: answer follow-up choices / quantity presets

This rebuild adds a simple way to handle answers that need a quantity or placement after the staff member selects them on a quote.

## Why

Some finishing answers are not a single fixed cost. For example, **Eyelets** needs:

- the answer selected by staff
- a placement choice such as `4 corners` or `top corners only`
- a quantity produced from that placement
- material/hardware cost multiplied by that quantity
- labour multiplied by that quantity

The product creator now supports this without requiring separate hidden rules.

## Product setup flow

On each answer line, open:

`More for this answer: ask quantity / placement`

Then set:

- **Ask this when picked**: for example `Eyelet placement`
- **Quantity presets**: one per line, for example:
  - `4 corners=4`
  - `Top corners only=2`
  - `Centre top + bottom=2`
  - `2 top + 2 bottom pole fixing=4`
  - `Custom=custom`
- **Custom quantity?**: allow staff to type another quantity when needed

## New cost type

Added a new simple answer-line cost type:

`Hardware / consumable each`

This is intended for eyelets, screws, standoffs, fixings, and other each-based consumables.

## Quote page behaviour

When a staff member selects an answer with follow-up presets, the quote page now shows the follow-up selection below it.

Example:

- Finishing: Eyelets
- Eyelet placement: 4 corners (4)

The calculated price multiplies relevant rows by the selected preset quantity.

For eyelets, this means:

- Eyelet material each × selected eyelet quantity
- Eyelet labour hours each × selected eyelet quantity

## Summary text

The saved quote line summary includes the follow-up selection, for example:

`Finishing: Eyelets (4 corners), Drill holes`
