# Performance and Loading States Batch

This batch keeps the current Production Manager workflow intact:

- Clients
- Suppliers
- Materials
- Products
- Quotes
- Integrations

No Recipes or Configurators workflow pages were reintroduced.

## What changed

### Visible route loading

Added App Router `loading.tsx` screens for the main workspace and key pages. These show a clear loading card and skeleton panels while server data is being fetched.

Covered pages:

- Dashboard
- Clients
- Suppliers
- Materials
- Products
- Quotes
- Integrations
- Users
- Company

### Navigation feedback

Replaced the sidebar's plain links with a small client-side navigation link component. When a user clicks a section, the clicked item immediately shows a `Loading` state while the route transition is pending.

### Request-level caching

Added React request caching around:

- Supabase session user lookup
- tenant membership lookup

This avoids repeated auth and membership/database calls during the same server render where the layout and page both need the same information.

### Faster Products page data loading

Products page now starts the selected product lookup in parallel with the products/materials/suppliers list queries instead of waiting until after the lists finish.

## Notes

These changes are deliberately low-risk. They improve perceived loading and reduce repeated lookups without changing database schema, MYOB integration, materials/products workflow, or quote/product setup behaviour.
