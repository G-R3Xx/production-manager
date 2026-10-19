# Production Manager V26.10.19.15

This build continues from V26.10.19.14 and includes the Material Price Manager billing controls introduced there.

## Material Price Manager billing

- Billing increment is visible and editable directly in the Material Price Manager grid.
- Sheet/card/paper materials can use Auto recommended, Exact usage, 1/4 sheet, 1/2 sheet or Full sheet.
- Roll media/laminate/cello materials can use Auto 0.5m, Exact usage, 0.25m, 0.5m or 1m.
- Values save into the existing material billing fields already used by quote costing.

## MYOB bulk material sync

- Added a dedicated **Sync all Materials to MYOB** button under Integrations.
- Only active PM materials are included.
- The button shows the current active-material count before syncing.
- After the run, Integrations shows **Materials synced: X · Failed: Y**.
- Failed materials are listed underneath with the MYOB error returned for each item; long failure lists are capped in the result panel to keep the redirect URL safe.
- The existing combined client + supplier + material push remains available as a secondary action.

Version: V26.10.19.15
