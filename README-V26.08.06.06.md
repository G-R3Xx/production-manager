# Production Manager V26.08.06.06

## Persistent local hiding for MYOB products

- Removing a product remains a Production Manager-only action.
- A linked MYOB inventory item is never deleted, deactivated or changed by product removal.
- Future MYOB item imports continue refreshing the local product name, SKU, tax code and imported payload while preserving local `deleted` status.
- Restoring a removed product returns it as a draft; a later MYOB sync may then align it to the MYOB active/inactive state.
- Product removal wording now explains the MYOB safety behaviour.

This change prevents sandbox items owned by other developers from repeatedly returning to the active Production Manager product list after MYOB sync.
