-- V26.11.02.06: named sections within a quote; existing quote lines stay intact.
-- Apply this migration BEFORE deploying the application release.
CREATE TABLE IF NOT EXISTS sales.quote_sub_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES sales.quote_drafts(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_sub_jobs_title_not_blank CHECK (length(btrim(title)) > 0)
);
CREATE INDEX IF NOT EXISTS quote_sub_jobs_quote_order_idx
  ON sales.quote_sub_jobs(quote_id, sort_order, created_at);
-- Sub-job assignment is stored in quote_lines.configuration_snapshot.subJobId.
-- This preserves all existing pricing, artwork links, and quote-line IDs.
