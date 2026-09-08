# Production Manager V26.09.08.11

## Quote page MYOB cleanup + consistent line pricing layout

- The large **MYOB open job / order** panel has been replaced with a compact MYOB Order status row on Quotes.
- Once an Order exists, the quote only shows its Order number/status and a direct **Job workspace →** link. The Job Workspace is now the primary place to manage the order and downstream invoicing.
- MYOB recovery/setup controls only expand when attention is actually required (missing client link, MYOB customer link, missing fallback sales account, or sync error).
- Saved quote lines now use one consistent collapsed-card layout: description first, followed by **Qty / Price P/U / Line total / Markup / View-edit** in the same left-aligned position on every line. Long descriptions can no longer push the pricing controls to a different side of the card.

No database migration is required.

App version updated to **V26.09.08.11**.

## V26.09.08.11
- Job Workspace now backfills a missing MYOB Item Order automatically when the linked quote is accepted, matching the Quote page behaviour.
- Added a clear manual **Create MYOB Item Order** / **Retry MYOB Item Order** action on the Job Workspace when an accepted job is not yet synced.
- If the linked quote is not actually accepted, the MYOB card now explains why an Order cannot be created and provides **Open quote →** instead of silently hiding the control.
