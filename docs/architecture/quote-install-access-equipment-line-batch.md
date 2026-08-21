# Quote install access-equipment line batch

## Goal

Allow access-equipment hire to be quoted from the same canonical one-page quote-line editor used everywhere else, while keeping the hire charge visible as a distinct client quote line.

## Editor behaviour

- Selecting `Install` reveals `Is access equipment required?`.
- Enabling it requires an equipment type, a raw daily charge and a positive number of days before the quote line can be saved.
- The live price summary shows the marked-up daily price and the complete equipment-line total.
- Existing generated access-equipment lines reopen in the same one-page editor and remain editable.

## Pricing

The daily charge is an underlying cost. Its sell price uses the same pricing multiplier as the associated quote line:

`daily cost × markup × profit × MYOB price-level factor × quote discount factor`

The generated line quantity is the hire-day count, so its line total is the calculated daily sell price multiplied by the number of days.

## Linked-line structure

- A product/sign line may generate a child `Sign Install` line.
- Its access-equipment charge is stored as a child of that install line.
- A standalone install line stores access equipment directly beneath itself.
- Link identifiers are retained in the structured quote snapshots so later edits update the same rows rather than duplicating them.
- Clearing Install or clearing the equipment requirement removes the now-obsolete linked row.
- Quote-line ordering traverses linked children recursively, keeping equipment immediately after the corresponding install fee.

No database migration is required because the relationship and equipment inputs use the existing structured JSON quote-line snapshot.
