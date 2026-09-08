# Production Manager V26.09.08.01

## Quote line markup overrides

- Owners and Managers now see the effective markup multiplier beside every quote line.
- The line markup can be changed independently from the workspace standard markup set in Settings.
- New quote lines default to the current standard markup (for example ×1.50), with a one-click reset back to standard after an override.
- Editing an existing structured quote line keeps its saved line-level markup and recalculates pricing from the saved cost basis.
- Changing markup directly beside a saved line immediately recalculates its unit price and line total and resets any client response for that changed line back to pending.
- Staff, Sales, Installer and Accounts roles do not see the markup controls. Existing Manager/Owner overrides are preserved when those users edit other quote details.
- MYOB matrix-priced plan-printing lines remain controlled by the synced MYOB price matrix; the markup control is shown as unavailable for those lines rather than applying a second pricing layer.
- No database migration is required; the effective markup continues to be stored in each quote line pricing snapshot.

App version updated to **V26.09.08.01**.
