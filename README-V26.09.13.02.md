# Production Manager V26.09.13.02

## Spreadsheet material price updates

Adds a Manager/Owner-only bulk price workflow to Materials.

- Download a current Small Format or all-material price CSV from Production Manager.
- Edit supplier purchase prices in Excel, Google Sheets or another spreadsheet app.
- Upload the edited CSV and preview every proposed change before anything is written.
- PM-exported sheets match by a stable Material ID, so renamed materials do not update the wrong stock.
- Existing legacy Small Format CSVs with `Stock Type` and `Sheet Price` columns are recognised as a best-effort import. PM only applies safe, unambiguous matches and skips uncertain rows.
- Legacy per-sheet prices are converted back to the saved PM purchase basis (for example, $0.05375/sheet × 1000 sheets/ream = $53.75 purchase cost).
- Optional `Price Checked` dates are stored with the material and shown in Materials.
- Existing/sent quotes are not repriced; the new cost is used for future quote calculations and any line deliberately recalculated later.
- Optional checkbox queues the changed material costs to MYOB Items after import.
- Bulk updates also keep the legacy `cost_json.purchaseCost` value aligned with `purchase_cost`, avoiding old cached cost values in downstream pricing paths.

No database migration is required.
