-- V26.08.10.07
-- Per-line client quote responses: approve, request changes, or cancel.

ALTER TABLE sales.quote_lines
  ADD COLUMN IF NOT EXISTS client_response_status varchar(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS client_response_notes text,
  ADD COLUMN IF NOT EXISTS client_responded_at timestamptz;

CREATE INDEX IF NOT EXISTS quote_lines_client_response_idx
  ON sales.quote_lines (quote_id, client_response_status);
