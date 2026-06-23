-- Artwork approval pages can be linked back to quote lines so the approval pack
-- can auto-create one proof page per sign/small-format quote line and avoid duplicates.

ALTER TABLE sales.artwork_approval_pages
  ADD COLUMN IF NOT EXISTS source_quote_line_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS artwork_approval_pages_source_quote_line_unique_idx
  ON sales.artwork_approval_pages (approval_id, source_quote_line_id)
  WHERE source_quote_line_id IS NOT NULL;
