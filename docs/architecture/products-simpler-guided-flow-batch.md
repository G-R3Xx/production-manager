# Products simpler guided flow batch

This rebuild keeps the Products page as a single-screen setup flow, but removes another layer of confusing configurator wording.

## Goal

Make product creation feel like three plain business steps:

1. **Product** — the base sellable item, for example `Sign - ACM - 3mm`.
2. **Uses** — the stock, material, media, laminate, hardware or labour/process rows behind that product.
3. **Quote Questions** — the choices staff answer later when creating a quote, for example Size, Print type, Laminate, Finishing and Quantity.

## What changed

- Reworded the main flow from technical/configurator language to plain workflow language.
- Added a plain English explanation card so the difference between Product, Uses and Quote Questions is always visible.
- Simplified product creation to product name + starter type first.
- Moved optional SKU/material usage fields into a collapsible advanced section.
- Reworked Components / Materials into **What this product uses**.
- Split the old add-component form into two obvious actions:
  - Add stock/material
  - Add process/labour
- Moved conditional/trigger settings behind collapsible advanced sections.
- Renamed Quote Options to **Questions asked while quoting**.
- Renamed option labels to friendlier terms:
  - Option label → Question label
  - Type → Answer type
  - Other choices → Other answers
- Kept edit/remove/reorder controls visible and simple.
- Kept GST default hidden from setup.

## Intentional behaviour

This still does not turn product setup into a multi-page wizard. It stays on one Products page, but each section now reads more like a checklist than a configurator builder.

