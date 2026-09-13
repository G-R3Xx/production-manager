# Production Manager V26.09.13.06

## Material Price Manager

- Added an Owner / Manager-only in-app Material Price Manager on the Materials page.
- Department tabs: Signage, Small Format, Plan Printing, Poster Printing, Shared + Consumables.
- Material-type tabs within each department (sheet stock, roll media, laminate, paper, card, cello/coating, binding, fixings, consumables, etc.).
- Spreadsheet-style inline editing with unsaved-change highlighting and one deliberate Save changes action.
- Existing rows start as KEEP; new rows start as ADD. HIDE, ARCHIVE and RESTORE are available from the Action dropdown.
- New supplier names create an active placeholder supplier in PM and link the material to it.
- Add and duplicate materials directly in the grid.
- Copy/paste a vertical list of purchase costs from Google Sheets into the Purchase cost column.
- Unit cost recalculates immediately in the grid.
- Price Checked is automatically set to today when a purchase cost changes and can be edited manually.
- Optional MYOB Item sync can be queued after a save.
- The manager refreshes when the window regains focus and every 60 seconds when there are no unsaved edits.
- XLSX import/export remains available as an optional secondary workflow for offline/very large bulk updates.
- The legacy Create Material form remains available but is collapsed by default for Owner / Manager users.

No database migration is required for this release.
