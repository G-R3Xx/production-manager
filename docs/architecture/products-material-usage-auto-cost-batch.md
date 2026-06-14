# Products material usage auto-cost batch

This batch changes quote pricing from manual per-option prices to material usage costing.

## What changed

- Quote question answers no longer carry visible prices on the Products page.
- Product setup Step 2 is now the source of pricing:
  - link the purchased material;
  - choose how it is used: part sheet, whole sheet, roll metres, square metres, or each;
  - optionally trigger that material row from a quote answer such as laminate, roll stock, or finishing;
  - set waste/allowance when editing the material row.
- Quote page now calculates the unit price from material cost × material amount used.
- Quote page shows a material cost breakdown per selected line.

## Current calculation rules

### Part sheet

Used for ACM, Corflute, Acrylic, PVC, paper and similar sheet goods.

Formula:

```text
finished size area / parent sheet area × material purchase cost × allowance × waste
```

The parent sheet area comes from the linked material width and length.

### Roll metres

Used for banner, vinyl, laminate and roll media.

Formula:

```text
linear metres required × cost per linear metre × allowance × waste
```

The required metres are calculated from the selected finished size and linked material roll width. The app rotates the item when one side fits inside the roll width.

For exact roll pricing:

- if purchase cost is per lm, set Purchase UOM to `lm`;
- if purchase cost is for a whole roll, set Purchase UOM to `roll`, Stock UOM to `lm`, and Stock qty / roll length to the roll length.

### Square metres

Used for ink, print coverage, or area-based consumables.

Formula:

```text
finished size area × cost per square metre × allowance × waste
```

The app can derive sqm cost from a sheet cost and sheet dimensions, or from linear metre cost and roll width.

### Whole sheet / each

Used for fixed items, hardware, or when a quoted unit consumes a full sheet.

Formula:

```text
quantity allowance × purchase cost
```

## Important note

The calculated value is currently a material-cost-driven unit price before markup/labour pricing rules. Manual override remains available on the quote page. A later batch can add markup percentages, labour rates, minimum charges, and pricing rules per customer/product family.
