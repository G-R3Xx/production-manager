# Production Manager V26.08.14.08

## Quote line editing cleanup

- Saved quote-line component cards now edit in place instead of navigating into the retired quote-line builder flow.
- Quick-built and recovered legacy quote lines use the same inline component-card editing experience.
- The old `editLine` / `editStep` URL-driven quote edit path has been removed from the Quotes page.
- The guided builder remains only for creating new quote lines; it is no longer used as a separate edit screen.
- Component edits reuse the existing pricing/configuration engine, so material, labour, finishing and pricing calculations remain consistent.
- Calculated unit-price and line-total cards remain read-only.
- Existing reusable-product line editing remains inline and unchanged.
- Existing Purchasing, Gmail PO email, MYOB sync, background master-data sync, quote job-name and public quote behaviour are preserved.
