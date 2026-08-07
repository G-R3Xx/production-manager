# Production Manager V26.08.07.01

## Customer-facing material names

- Materials now have a separate **Customer-facing name** while preserving the supplier/internal stock name.
- The customer-facing name is used in new quote summaries and saved-product option summaries when the selected option links to that material.
- WordPress catalogue fields use the customer-facing material name for material-backed choices without changing pricing IDs or stock links.
- MYOB Order line descriptions replace known internal material names with the customer-facing material name, so invoices created from those orders inherit readable descriptions.
- Leaving Customer-facing name blank preserves the previous behaviour and falls back to the internal material name.
- Product setup continues to show internal stock identities to staff while generated customer option labels use the customer-facing name.

Database schema is upgraded safely with `customer_facing_name` using `ADD COLUMN IF NOT EXISTS`.
