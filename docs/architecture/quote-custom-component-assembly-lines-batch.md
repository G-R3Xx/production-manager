# Quote custom component / assembly lines

This batch adds a quote-side flow for one-off built components.

## Purpose

Some quote items are not standard signage, small format, or install lines. Examples include frames, special brackets, fabricated supports, composite assemblies, and one-off builds made from multiple parts.

The new flow lets the user create a quote line from:

- a component name and description
- multiple part rows
- optional material library selection per part
- custom part names
- quantity per part
- unit type: each, lm, sheet, sqm, pack
- manual cost per unit or automatic cost from the selected material
- assembly/build labour hours

## Pricing

Each part calculates as:

`quantity × cost per unit`

If a material is selected and no manual cost is entered, the app derives the cost from the material setup:

- `lm` uses roll/metre cost
- `sheet` uses sheet cost
- `sqm` uses sheet area-derived sqm cost when possible
- `each`/`pack` uses each/pack-style cost

Assembly labour calculates as:

`hours × global labour hourly rate`

The final quote line still applies global markup and profit:

`raw cost × global markup × global profit`

## Flow

A new first-card option has been added:

`Custom component / assembly`

The workflow is:

1. Name the component
2. Add parts used
3. Add assembly labour
4. Review and save

This keeps special assemblies quote-side and avoids creating unnecessary Products/templates.
