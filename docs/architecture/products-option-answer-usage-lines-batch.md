# Products option answer usage lines batch

This batch simplifies product setup so a quote option can be created as multiple answer lines, with each answer line carrying its own material usage rule.

## Main workflow change

Instead of asking users to create quote choices in one section and then link separate material rows in another section, the Products page now supports this flow:

1. Add a question, such as Size, Laminate, Finishing or Roll stock.
2. Fill one answer per line.
3. For each answer line, optionally choose the material used by that answer.
4. Choose how that answer uses material:
   - Auto from finished size
   - Parts per sheet
   - Sheets per item
   - Roll metres per item
   - Square metres
   - Whole sheet
   - Each / fixed item
5. Enter the amount only when needed, for example 8 parts per sheet or 1.2 roll metres.

The first filled answer line becomes the default answer on the quote page.

## Data behaviour

The visible answer lines still create normal quote fields in the configurator definition.

When an answer line has a linked material, the server action automatically creates the matching component row behind the scenes. That generated component is triggered only when that quote answer is selected.

For example:

- Question: Size
- Answer: 600 × 900 mm
- Material: 3mm ACM sheet
- Calculate using: Parts per sheet
- Amount: 8

This creates:

- a quote choice for 600 × 900 mm
- a material component triggered by that choice
- a stock usage rule where one parent sheet yields 8 quoted items

## Quote calculation

The existing quote calculator continues to calculate from product components. Because the answer-line workflow creates triggered components automatically, the quote page does not need a separate pricing system.

The quote page calculates material costs from:

- selected quote answers
- generated triggered components
- linked material purchase cost
- sheet/roll dimensions
- usage mode and amount
- waste percentage

## Why this is simpler

A user no longer needs to understand the difference between quote options, triggers, components and stock usage rows for common products.

The product setup screen can now be used like a simple table:

| Answer | Material | Calculate using | Amount |
| --- | --- | --- | --- |
| 450 × 600 mm | 3mm ACM sheet | Parts per sheet | 18 |
| 600 × 900 mm | 3mm ACM sheet | Parts per sheet | 8 |
| 900 × 1200 mm | 3mm ACM sheet | Parts per sheet | 4 |

Advanced standalone material/process rows remain available for always-used items, labour, or unusual setup.
