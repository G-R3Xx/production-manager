# Production quoted details visible batch

The Production page now shows the quote-line details before the print-ready upload/procedure section.

## Changes

- Production items now join back to their source quote line when available.
- Each production item shows a prominent **Quoted production details** panel.
- The panel includes product, quantity, size, material/stock, print/colour, finishing, full quote-line choices, quote notes, and quoted line total.
- Existing production jobs do not need to be recreated; opening the Production page now surfaces the quote-line data from the original quote line where `source_quote_line_id` is linked.
- No SQL migration is required.

## Purpose

Production staff need to see what was actually quoted, not just the proof thumbnail and checklist. For example, an ACM sign quoted as 6000 × 1220mm now appears clearly on the Production item card.
