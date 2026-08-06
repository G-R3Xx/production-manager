# Production Manager V26.08.06.05

## Product removal and recovery

- Adds a visible **Remove product** button to every card in the normal Products library.
- Adds the same removal control to the product guided-builder header.
- Requires confirmation before a product is removed.
- Uses recoverable soft deletion: removed products disappear from current product and quote lists while existing quotes and orders remain intact.
- Adds a **Restore product** button when viewing the Products page with the Deleted filter.
- Restored products return as Draft so they can be checked before being made active again.
- Keeps the existing Advanced product tools delete/restore workflow compatible.
