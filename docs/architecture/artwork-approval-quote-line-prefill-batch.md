# Artwork approval quote-line prefill

Artwork approvals now create proof pages from quote lines so the workflow carries forward naturally from quote acceptance.

## Behaviour

- Creating an artwork approval from a quote now scans the quote lines.
- One artwork approval page is created for each signage or small-format quote line.
- Pickup, delivery, install and custom component/assembly lines are ignored.
- Generated pages are linked to the source quote line using `sales.artwork_approval_pages.source_quote_line_id` so syncing does not duplicate pages.
- Each generated page receives a placeholder proof image until the real artwork is uploaded.
- Staff can replace the placeholder artwork image directly on each proof page.

## Prefilled fields

The prefill copies useful quote-line data into artwork approval pages:

- page title
- item code (`S1`, `S2` for signage; `P1`, `P2` for small format)
- quantity
- size summary when available
- substrate/stock summary
- colour/ink summary
- finishing/laminate/small-format details

## SQL

Run `infra/sql/022_artwork_approval_quote_line_prefill.sql` once in Supabase.
