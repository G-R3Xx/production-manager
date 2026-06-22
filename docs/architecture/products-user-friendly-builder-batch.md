# Products User-Friendly Builder Batch

## Goal

Rework Products setup so non-technical staff can create sellable products without thinking in technical configurator terminology.

The mental model is now:

1. Product details
2. Materials used
3. Customer choices

## Workflow language

- Products are sellable quote items.
- Materials are purchased stock.
- Materials can be consumed as whole sheets, part sheets, metres from rolls, square-metre coverage, each items, binding consumables, labour, or machine time.
- Customer choices such as size, front/back, cello, laminate, pages, copies, copy colours, cover colour, tape colour and numbering sit on the product and drive material usage.

## Product builder changes

- Replaced the previous dense component/options feel with a guided builder.
- Added starting point cards:
  - Sheet sign / board sign
  - Roll print / vinyl / banner
  - Business cards / flyers
  - Books / pads
  - Duplicate / triplicate books
- Renamed Components UI to Materials used.
- Renamed Options UI to Customer choices.
- Added simpler material usage presets:
  - Whole sheet / board per item
  - Part sheet / nested from parent sheet
  - Metres from a roll
  - Area coverage: ink / laminate / cello
  - Paper / card parent sheet yield
  - Each item: eyelets / screws / boxes / staples
  - Binding / tape / book consumable
  - Labour or machine time
- Added one-click common customer choices:
  - Size
  - Front / back
  - Laminate
  - Celloglaze
  - Pages
  - Copies
  - Copy colours
  - Cover colour
  - Tape colour
  - Binding
  - Quantity

## Carbon book update

Carbon book starter rules now include pages per book in addition to copies, copy colours, cover colour, tape colour, numbering and quantity.

## Compatibility notes

- The internal template/configuration storage remains in place for compatibility with the current schema, but the workflow no longer exposes separate Recipes or Configurators pages.
- Tax code remains hidden from product creation and is saved as GST.
