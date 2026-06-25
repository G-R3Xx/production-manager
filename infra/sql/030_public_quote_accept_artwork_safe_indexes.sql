-- Make public quote acceptance resilient if legacy artwork approval rows already exist.
-- The app handles existing approval/page checks in code; these indexes are performance helpers only.

DROP INDEX IF EXISTS sales.artwork_approvals_quote_unique_idx;
DROP INDEX IF EXISTS sales.artwork_approval_pages_source_quote_line_unique_idx;

CREATE INDEX IF NOT EXISTS artwork_approvals_quote_idx
  ON sales.artwork_approvals (quote_id);

CREATE INDEX IF NOT EXISTS artwork_approval_pages_source_quote_line_idx
  ON sales.artwork_approval_pages (approval_id, source_quote_line_id)
  WHERE source_quote_line_id IS NOT NULL;
