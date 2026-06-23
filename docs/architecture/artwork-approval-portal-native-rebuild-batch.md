# Artwork approval portal native rebuild

This batch rebuilds the old Firebase Artwork Approval Portal basics inside Production Manager while keeping Artwork as its own app section.

## Included

- Artwork approvals remain separate from Quotes.
- Accepted public quotes automatically create an artwork approval pack.
- Artwork approval packs have editable client/project/drawing/revision/designer fields.
- Proof pages now support:
  - item code such as S1/S2
  - signage or small format type
  - quantity
  - uploaded proof image or pasted URL
  - colours used
  - sizes
  - substrate/stock
  - install/finishing notes
  - small-format details
- Admin preview uses the old portal structure: large white proof image area plus a right-side details panel.
- Public client approval page uses the same structure.
- Client approval requires name, confirmation checkbox and signature pad.
- Client can request changes without a signature.
- Managers can direct approve internally without sending to the client.

## SQL

Run `infra/sql/021_artwork_approval_portal_rebuild.sql` once in Supabase.

The server also adds the new columns defensively at runtime.
