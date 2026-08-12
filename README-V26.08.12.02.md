# Production Manager V26.08.12.02

## Labour timing basis

- Print setup labour, laminate labour and finishing labour now accept decimal minutes in 0.5 minute increments.
- `0.5` minutes is displayed as 30 seconds.
- Each labour component can be charged either **Per item** or **Total line item**.
- Total line item labour is entered once for the complete quote quantity; Production Manager apportions it across the unit cost so the final line total only charges that time once.
- Per item labour multiplies the entered time by the quote quantity.
- Finishing operations have their own independent labour-basis selector.
- Eyelet labour retains a **Per eyelet** option and can alternatively be set to **Total line item**.
- New finishing labour entries default to Total line item to avoid accidental multiplication on large sticker/label quantities.
- Existing legacy small-format lines that previously used per-item finishing labour retain that behaviour when reopened unless the basis is changed.

No database migration is required; the labour basis is stored in the quote-line configuration snapshot.
