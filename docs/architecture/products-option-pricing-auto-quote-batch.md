# Products option pricing → automatic quote line pricing

## Goal

Make quote line pricing follow the choices set up on the product instead of forcing staff to type a unit price manually every time.

## What changed

### Product setup

The **Questions asked while quoting** section now supports prices on dropdown-style answers.

For each quote question, staff can set:

- Default answer
- Default price
- Other answers and prices

The other answers field accepts one answer per line:

```text
450x600 | 35
600x900 | 55
900x1200 | 85
Custom=custom | 0
```

The left side is the answer shown during quoting. The right side is the unit price contribution for that answer.

Existing answer syntax still works:

```text
Direct print=direct_print | 0
Roll stock applied=roll_stock | 20
```

### Quote page

When a product is selected on a quote, the quote line builder now:

1. Shows each option answer with its price where applicable.
2. Adds the prices from the selected visible answers.
3. Automatically fills the **Unit price** field.
4. Shows a clear price breakdown below the unit price.
5. Allows the user to override the unit price manually if needed.
6. Shows a **Use auto price** button after a manual override.

Conditional questions only add to the price when they are visible. For example, a roll stock choice only contributes to price when the `Print type` answer makes the roll stock question visible.

## Data shape

Option choices now preserve a `priceDelta` value:

```json
{
  "label": "900 × 1200 mm",
  "value": "900x1200",
  "priceDelta": "85.00"
}
```

Older choices without `priceDelta` still work and are treated as `$0.00`.

## Files changed

- `apps/web/src/app/(app)/products/actions.ts`
- `apps/web/src/app/(app)/products/page.tsx`
- `apps/web/src/app/(app)/quotes/page.tsx`
- `apps/web/src/app/(app)/quotes/QuoteLineBuilder.tsx`
