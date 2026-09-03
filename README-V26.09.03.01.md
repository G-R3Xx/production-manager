# Production Manager V26.09.03.01

## Quote PDF parity + offline approval workflow

- Rebuilt the emailed quote PDF so it visually follows the public online quote: large company branding, company details, quote number/date, client and job/site blocks, rounded quote-line cards, totals, notes and offline approval instructions.
- The static PDF deliberately omits interactive Approve / Cancel / Request changes controls.
- Quote PDFs can include the client logo, client address, site address and client PO when those are available from the linked enquiry/survey/client record.
- Replaced the immediate manual-accept button with a confirmation modal labelled **Record email / PDF approval**. Staff can add an optional approval note before marking the quote accepted.
- Manual/offline acceptance still enters the normal accepted quote workflow so MYOB/order progression works the same as an online approval.
- Quote email recipient override and attached PDF behaviour from V26.09.02.06 remain unchanged.

No database migration is required.
