# Production Manager V26.08.16.02

## Explicit MYOB Ship To address

- Accepted quote Item Orders now send MYOB `ShipToAddress` explicitly instead of leaving MYOB to choose/default the address.
- Standard orders use the linked PM client's structured Billing Address (MYOB Address 1 equivalent).
- If the accepted quote clearly contains delivery/install/site work and the client has a Default site / delivery address, PM uses that site address instead.
- The client/company name is included above the structured address and the MYOB 255-character ShipToAddress limit is respected.

## Printable production job sheet

- Production jobs now have a **Print job sheet** action.
- Accepted quotes show the same action once approved artwork has created the Production job.
- The job sheet opens in a clean print-only view with **Print / Save PDF**.
- The sheet includes job/quote name, quote number, client, client PO, due date, dispatch, priority, artwork approval revision/date/designer, internal notes and production sign-off areas.
- Every production item includes quantity, finished size, print method/ink/sides, bleed/spacing, laminate, finishing, artwork choice, internal quote notes, saved material/stock names and SKUs, and the stored pricing/usage breakdown used for stock/media/labour allowances.
- Production procedure checkboxes are included for each item.
- Approved artwork is part of the job sheet. Image proofs render directly as a production thumbnail. Approved PDF proofs are shown as an approved-artwork block with filename and direct proof link so the approved revision remains unambiguous on the sheet.
- Cancelled / revision-excluded quote lines are not treated as active job-sheet scope.

## Preserved

- MYOB Item Order layout and PM-CUSTOM fallback from V26.08.16.01.
- Quote revision/cancelled-line behaviour.
- MYOB OAuth/refresh/pagination and automatic master-data sync.
- Client/Supplier/Material sync.
- MYOB purchasing and PO email/PDF workflow.
- Gmail quote email and Tender Edge horizontal branding.
- Inline quote component editing and current quote pricing.
