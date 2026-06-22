# Products no-training answer-line pricing batch

This batch simplifies the Product creator again so normal setup happens inside quote question answer lines, not in separate hidden component/configurator rows.

## Main UX change

The normal product setup flow is now:

1. Create/open the product.
2. Add a quote question.
3. Fill answer lines.
4. Each answer line says what it adds to price.

Examples:

| Question | Answer | What it adds | Material / charge | Number |
| --- | --- | --- | --- | --- |
| Size | 600 x 900 mm | Material: parts per sheet | 3mm ACM | 8 |
| Print Type | SAV 7YR | Material: auto from size | SAV 7YR roll | blank |
| White Ink | Yes | Charge: dollars per m² | White Ink | 10 |
| White Ink | No | No extra cost | blank | blank |

The separate product material rows still exist for unusual always-used stock/processes, but the UI now describes that area as advanced and normally skipped.

## New answer-line charge types

Answer rows now support:

- No extra cost
- Material: auto from size
- Material: parts per sheet
- Material: sheets per item
- Material: metres per item
- Charge: dollars per m²
- Charge: dollars each

This lets ink and white ink be added without creating fake stock materials.

## Quote calculation

The quote line builder now reads answer-line sell-charge rows:

- `sell_sqm` = finished area × sell rate
- `sell_each` = fixed sell rate per quoted unit

These appear in the quote price breakdown alongside sheet and roll material costs.

## Starter adjustment

Signage starters now include:

- CMYK Ink as a $10/m² sell charge for direct print or roll stock print
- White Ink question with No / Yes
- White Ink as an extra $10/m² sell charge when Yes is selected

