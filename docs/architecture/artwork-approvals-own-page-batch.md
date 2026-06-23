# Artwork approvals own page batch

Artwork approval management has been moved out of the quote detail area and into its own first-class app section.

## Changes

- Added `/artwork-approvals` app page.
- Added sidebar navigation item `Artwork`.
- Added artwork approval list, create-from-quote panel, selected approval detail, public approval link, status tracking, proof page add/remove and client response notes.
- Quotes page now stays focused on quote/pricing work and only links to the separate artwork approval workflow.
- Creating an approval from the quote page now redirects to `/artwork-approvals?selected=...`.

## Data

Uses the existing quote/artwork approval tables introduced by:

- `infra/sql/020_quote_review_send_artwork_approval_workflow.sql`

No additional SQL is required.
