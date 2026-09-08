# Production Manager V26.09.08.04

## Production Manager -> MYOB invoicing

This build adds the first full job invoicing workflow inside Production Manager while keeping MYOB as the accounting source of truth.

### Job invoicing workspace
- Added **Invoicing** to the Job Workspace for Owner, Manager and Accounts roles.
- Completed production jobs route directly to the invoice workspace when invoicing is required.
- Dashboard/job stage labels now preserve **Partially invoiced**, **Invoiced** and **Paid** states during workflow refreshes.
- The invoice workspace shows accepted quote value, previously invoiced value, remaining value and MYOB invoice history.

### Invoice modes
- **Full job / remaining balance** - invoices everything still owing.
- **Selected lines / partial quantity** - invoices chosen quote lines and quantities, with original, previously invoiced and remaining quantities visible.
- **Deposit / progress claim** - supports percentage of accepted job or a fixed ex-GST amount.
- **Final balance** - automatically credits prior deposit/progress invoices so the accepted job value cannot be billed twice.
- **Variation / extra** - invoices approved additional work outside the accepted quote without reducing the original quote balance.

### MYOB integration and controls
- Where the first invoice is the complete job and a linked MYOB Item Order exists, PM converts that actual Order to a MYOB Item Invoice.
- PM compares the MYOB Order subtotal with the accepted PM job value before conversion and blocks conversion if they have drifted.
- Partial, deposit/progress and variation invoices create MYOB Item Invoices using the existing item/customer/tax mappings and `PM-CUSTOM` fallback where required.
- New invoices are created with MYOB delivery status set to **Nothing**, so creating an invoice does not automatically email the client.
- MYOB invoice UID/number/status/balance are stored against the PM job and can be refreshed from MYOB.
- Server-side remaining-value validation plus a one-syncing-invoice-per-job database guard reduces accidental duplicate invoicing.
- Invoice creation is restricted to **Owner, Manager and Accounts** roles.

### Database
- Added `infra/sql/046_invoice_workflow.sql`.
- Runtime schema readiness also upgrades the invoice groundwork tables where the deployed database user has DDL permission.

App version updated to **V26.09.08.04**.
