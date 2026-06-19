# Quote square-metre ink charge calculation fix

## Problem

Square-metre sell charges, such as CMYK ink and white ink at `$10/m²`, could be over-counted when an older product recipe row had the sell rate stored in both places:

- `stockUsage.sellRate`
- `component.quantity`

The quote calculator was using `component.quantity` as an area multiplier, so a 600 × 900 mm sign could show `5.40 sqm × $10/sqm = $54.00` instead of `0.54 sqm × $10/sqm = $5.40`.

## Fix

For `sell_sqm` rows, the amount is now always:

```
finished width × finished height
```

plus any follow-up quantity preset multiplier when applicable.

The dollar rate comes from:

```
stockUsage.sellRate
```

with `component.quantity` only kept as a backwards-compatible fallback rate for older rows.

## Expected result

For a 600 × 900 mm sign:

```
0.54 m² × $10/m² = $5.40
```

If white ink is also selected:

```
CMYK ink: 0.54 m² × $10/m² = $5.40
White ink: 0.54 m² × $10/m² = $5.40
Total ink charge = $10.80
```
