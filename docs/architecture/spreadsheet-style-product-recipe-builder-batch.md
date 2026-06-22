# Spreadsheet-style Product Recipe Builder Batch

## Goal
Rebuild product creation so it follows the quoting workbook process instead of a generic configurator pattern.

The product setup screen now treats each product as a quote item recipe:

1. Product details
2. Recipe rows
   - Materials / stock
   - Ink and production charges
   - Factory labour
   - Outsourced / supplier items
3. Quote questions staff answer
4. Live recipe preview / data check

## Why
The uploaded quote workbook shows that quoting is really built from line rows: materials, consumables, labour, outsourced items, install/allowances and profit. Product setup therefore needs to feel like creating a reusable quote item calculator, not creating hidden configurator rules.

## Main UX changes
- Replaced the normal product setup canvas with a spreadsheet-style recipe builder.
- Added visible row groups for materials, charges, labour and outsourced rows.
- Added simple row forms:
  - Add material / stock row
  - Add ink / production charge
  - Add factory labour row
  - Add outsourced / supplier row
- Kept quote questions separate and plain: Size, Print type, Laminate, White ink, Finishing and Quantity.
- Moved advanced data preview to the side, away from normal setup.

## Calculation changes
- Quote calculation now includes recipe rows with these rule types:
  - `sell_sqm` for ink/charges like $10 per square metre
  - `sell_each` for fixed sell charges
  - `labour_hours` for factory labour hours multiplied by hourly rate
  - `outsourced_each` for supplier/outsource rows multiplied by item rate
- Existing material rows still calculate using sheet, roll, square metre or fixed-item methods.

## Example
A 3mm ACM sign recipe can now be set up like the workbook:

- Materials:
  - ACM sheet = part sheet from finished size
  - SAV 7YR = roll metres from finished size, only when roll stock is selected
  - Matt laminate = roll metres from finished size, only when Matt laminate is selected
- Charges:
  - CMYK Ink = $10/m²
  - White Ink = $10/m², only when White ink is selected
- Labour:
  - Print setup = 0.25 hours × $66/hr
  - Jingwei cutting = hours × rate, only when Jingwei is selected
- Quote questions:
  - Size
  - Print type
  - Laminate
  - White ink
  - Finishing
  - Quantity
