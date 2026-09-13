# Production Manager V26.09.13.03

## Materials spreadsheet manager

- Replaces the single CSV-first material price workflow with a Google Sheets-friendly `.xlsx` workbook.
- Workbook tabs: Signage, Small Format, Plan Printing, Poster Printing, Shared + Consumables, plus Instructions.
- Existing materials can have Purchase Cost / Price Checked updated in bulk.
- New materials can be created by adding a row with `Action = ADD` on the correct department tab.
- Existing materials can be `HIDE`, `DELETE` (safe archive/soft delete) or `RESTORE` from the workbook.
- DELETE is deliberately non-destructive so historical quotes, jobs and purchase records remain valid.
- Stable PM Material IDs remain in the workbook for safe matching.
- Legacy Small Format CSV import remains available for price-only updates.
- Preview is required before changes are applied; invalid or unmatched rows are skipped.
