# Products editor guided flow batch

This batch keeps the app workflow centred on Products only. It does not reintroduce separate Recipes or Configurators pages.

## Workflow

- Suppliers sell purchased stock.
- Materials are purchased stock.
- Components sit behind Products and consume materials, labour, machine time or finishing consumables.
- Options are quote choices that drive or trigger component usage.
- Products are sellable items that appear on quotes.

## Changes

- Rebuilt the Products page into a guided three-step setup flow:
  1. Product details
  2. Components
  3. Options
- Added setup progress cards at the top of the selected product editor.
- Simplified existing component display into plain-language cards showing:
  - what the component consumes
  - supplier source
  - allocation hint
  - when the rule applies
- Simplified existing option display into plain-language cards showing:
  - option key
  - field type
  - choices
  - linked rule effect
- Reworked add-component into a simple preset-first form with advanced details collapsed.
- Reworked add-option into a simple preset-first form with advanced details collapsed.
- Added server-side component preset defaults so common rules can be added without filling every technical field.
- Kept product tax code hidden and defaulted to GST.

## Component presets added

- Sheet substrate / board
- Print / ink coverage
- Roll media meterage
- Laminate / cello coverage
- Eyelets / fixings
- Paper / card sheet usage
- Binding / tape consumable
- Labour time
- Custom component

## Validation notes

`pnpm typecheck` still requires project dependencies to be installed. In this sandbox, Corepack cannot download pnpm from the npm registry. A TS/TSX syntax transpile pass across project source files was run successfully.
