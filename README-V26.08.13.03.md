# Production Manager V26.08.13.03

## MYOB master-data push
- New and edited Production Manager clients now create/update the linked MYOB Customer when MYOB is connected.
- New and edited suppliers now create/update the linked MYOB Supplier.
- New and edited active materials now create/update a purchased MYOB Inventory Item.
- Existing Production Manager records can be pushed in bulk from Integrations with **Push PM clients + suppliers + materials to MYOB**.
- Suppliers can now be imported from MYOB and mapped locally.
- Manual **Sync to MYOB** controls are available on Clients, Suppliers and Materials.
- Local archive/delete actions do not deactivate/delete the MYOB counterpart.

## Purchasing / Purchase Orders
- New **Purchasing** workspace and sidebar link.
- PO can be started from Purchasing, from a Supplier, or directly from a Material with a supplier.
- Add/edit/remove material lines with quantity, unit cost and description.
- Save promised date, ship-to address and notes.
- Draft / Ordered / Received / Cancelled statuses.
- Send a draft PO to MYOB as an Item Purchase Order.
- Supplier and material MYOB links are created automatically as part of PO send if needed.
- MYOB Purchase default Expense/Cost of Sales account and purchase Tax Code are selectable in Purchasing.

## Database
Migration: `infra/sql/042_myob_master_data_and_purchasing.sql`.
Runtime guards also create the purchasing schema/columns where possible.

## OAuth
The MYOB OAuth scope set now includes `sme-general-ledger` in addition to supplier, inventory and purchases scopes. Existing connected sessions may need to run MYOB OAuth again once so Purchasing can read the expense/Cost of Sales accounts and tax codes.
