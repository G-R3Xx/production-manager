# Production Manager V26.09.21.01

Australian release date: 21 September 2026.

## Pricing and quote improvements

- Installation time is entered and displayed in decimal hours, with person-hour and labour-cost previews.
- Installation consumables can use standard material-library pricing for silicone, screws and cable ties. An optional manual price remains available, and other consumables can use a custom title.
- Materials now have a wastage allowance percentage. The allowance is included before markup and profit in quote costing; paper, card, sheet, roll and unit materials are supported.
- Paper and card can be purchased and costed by 1,000 sheets.
- Owners and managers can change the profit percentage on an individual PM-calculated quote line.
- Company settings include optional profit tiers based on the quote value before profit. The global profit multiplier remains the fallback.
- Staff records include an optional individual quote labour rate, falling back to the company rate when blank. This establishes the data needed for staff-specific installation costing.
- Quote summaries and client quotes show line totals, while client and PDF totals explicitly distinguish ex-GST subtotal, GST and inc-GST total.

## Client approval and email history

- Clients can approve all active quote items in one step, while retaining per-line approve, change-request and cancel controls.
- Every quote email send or failure is appended to an email history with recipient and timestamp; the quote screen shows the complete history.

## Data compatibility

- New tenant pricing, staff rate and quote email-history fields are added automatically at runtime when required.
- Material wastage is stored in the existing material cost JSON, preserving compatibility with current material records and imports.
- Existing quote snapshots remain readable; installation minutes are retained internally for backward compatibility while the interface uses hours.

## Verification

- TypeScript typecheck completed successfully.
- Next.js production build completed successfully using placeholder public Supabase build variables; no database connection was required during the build.
