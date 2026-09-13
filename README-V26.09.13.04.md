# Production Manager V26.09.13.04

## Materials workbook organisation

- Removes the legacy CSV workflow; material bulk management is now `.xlsx` only.
- Keeps department tabs: Signage, Small Format, Plan Printing, Poster Printing, Shared + Consumables.
- Each department tab is split into clear material-type sections.
  - Signage: Sheet stock, Roll media, Laminate, Hardware / fixings, Finishing / consumables.
  - Small Format: Paper, Card, Cello / coating, Binding / tape, Finishing / consumables.
  - Plan / Poster: Paper, Roll media, Sheet media, Other.
  - Shared: Hardware / fixings, Finishing consumables, Binding / tape, General consumables, Other.
- Existing material rows are pre-populated with `KEEP`; each type section includes ready-made blank `ADD` rows.
- Action cells use an Excel/Google Sheets dropdown: `KEEP`, `ADD`, `HIDE`, `DELETE`, `RESTORE`.
- Material Type and Yes/No fields also carry validation dropdowns for safer entry.
- New ADD rows require Pack Qty / Roll Length and Purchase Cost before import.
- Existing stable PM Material IDs continue to protect updates from name changes.
