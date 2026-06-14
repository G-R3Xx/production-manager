# Products material usage rules batch

This batch makes material usage explicit on the Products setup page.

## What changed

Product material rows now include a visible **Usage amount per quoted item** section.

You can now set:

- **Sheets per item** — use when one quoted item consumes a fixed number of sheets, for example `1`, `0.5`, or `0.25`.
- **Items per sheet** — use when a parent sheet has a known yield, for example `8` finished pieces from one sheet.
- **Roll metres per item** — use when a selected option consumes a fixed roll length, for example `1.2` linear metres.
- **Override width / height** — use when a component should not use the main quoted finished size.
- **Override roll width** — use when a product row should use a different roll width from the linked material.

Leaving these fields blank keeps automatic behaviour:

- part sheet = finished size area / material sheet area
- roll metres = finished size fitted to material roll width
- square metres = finished size area
- whole sheet = multiplier / allowance

## Option-specific usage

A material row can be tied to a quote answer with:

- Quote question
- Only for these answers

Examples:

- Laminate roll only applies when `Laminate` is `gloss_laminate` or `matt_laminate`.
- Roll stock only applies when `Print type` is `roll_stock`.
- Jingwei process only applies when `Finishing` is `jingwei_cutting`.

The quote page now respects fixed usage overrides when calculating the automatic unit price.
