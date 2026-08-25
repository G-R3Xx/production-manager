# Production Manager V26.08.25.02

## V26.08.25.02
- Added **Settings → Data maintenance → Reset workflow test data** for owners/managers.
- The reset previews the current tenant's operational record counts before anything is deleted.
- Requires the exact confirmation phrase `RESET WORKFLOW DATA`; it never runs automatically during deployment.
- Clears enquiries and correspondence, surveys, quotes/quote lines, artwork approvals/pages, production jobs/items/steps, dashboard job workspaces, calendar/process assignments/tasks, local invoices, imported WooCommerce order records, workflow notifications, and MYOB transaction mappings for quote/order/invoice records.
- Cleans workflow-only Supabase files from Artwork Approvals, Production, enquiry correspondence and enquiry-specific client assets after the database transaction completes.
- Keeps clients, suppliers, materials, products, configurators/options, production recipes/methods/processes, machines, labour/rates, staff/roles, company settings/branding, MYOB connection/tokens and master-data links, WordPress connection/product publishing, and purchase orders.
- The reset is tenant-scoped and does **not** delete records from MYOB or Install Scheduler.

No database migration is required.
