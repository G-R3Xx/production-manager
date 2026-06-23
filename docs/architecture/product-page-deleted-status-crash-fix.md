# Product page deleted status crash fix

The Products page was failing after housekeeping because the database `product_status` enum did not necessarily contain the new `deleted` value.

Changes:

- Product list queries now compare `status::text` so the Products page can open even before the SQL migration is run.
- Added `infra/sql/023_product_deleted_status_fix.sql` to add the missing `deleted` enum value.
- Product delete/restore can then use a real soft-delete status instead of hard deleting rows.
