# Production Manager V26.08.28.01

## Plan Printing — MYOB A–F price matrix

- Plan Printing can now use the imported MYOB Item Price Matrix as its direct sell-price source instead of applying the normal PM material markup/profit calculation.
- New Plan Printing quote lines default to **MYOB item price matrix** when matching imported matrix items are available. Existing saved Plan Printing lines keep their previous PM-calculated pricing until intentionally changed.
- Staff choose the MYOB price item used for the plan-printing option. Likely A0/A1/A2/A3/A4, mono/colour, plotting and drawing items are sorted to the top, with a unique high-confidence match selected automatically when possible.
- The linked client's MYOB Level A–F is used automatically, along with the correct MYOB quantity-break row for the entered quote quantity.
- The quote editor shows the selected MYOB tier, quantity range, matrix unit price and line total to staff. MYOB markup/profit and the PM A–F calculated-work factor are not layered over a MYOB matrix price; a deliberate one-off quote discount still applies.
- The selected matrix and price source are snapshotted onto the quote line. Reopening an existing matrix-priced line uses the saved matrix snapshot so later MYOB price changes cannot silently alter an already-created quote.
- The underlying PM stock/print cost calculation is retained internally for production/cost reference even when the MYOB matrix supplies the sell price.
- When an accepted Plan Printing quote is pushed to MYOB, the order line now uses the same MYOB inventory item that supplied the price matrix instead of the generic PM-CUSTOM fallback item.
- If the chosen item has no valid price for the client's A–F level/quantity, PM blocks saving and tells staff to correct/sync the MYOB matrix or choose another item.
- No database migration is required. MYOB item import/sync already stores Item Price Matrix data locally; run the normal MYOB item sync whenever the matrix is changed in MYOB.
