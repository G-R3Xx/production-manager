# Production Manager V26.08.13.15

## MYOB purchase-order item-link hardening

- Maps Production Manager **Supplier SKU** to MYOB Inventory Item `BuyingDetails.RestockingInformation.SupplierItemNumber`.
- Keeps purchase-order transaction lines linked to the synced MYOB Inventory Item via `Lines[].Item.UID`.
- Verifies the saved MYOB PO after POST/PUT and refuses to report success if any PM material line is not linked to the expected MYOB Item UID.
- Existing MYOB purchase orders can now be re-synced instead of returning immediately once a MYOB UID exists.
- Existing open Item POs are updated using their MYOB order/line `RowVersion` and `RowID` values, so **PO-00001** can be repaired in place without creating a duplicate.
- The Purchasing page shows **Sync to MYOB** for an already-linked ordered PO.
- Material sync backfills Supplier Item Number for materials created by earlier builds.
- Existing OAuth, token refresh, pagination, master-data sync, structured client/supplier addresses, Price Levels A-F, purchasing defaults and PO workflow remain in place.

## Validation notes

See delivery response for the validation performed in the build environment.
