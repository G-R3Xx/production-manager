-- V26.07.23.11
-- Preserve the underlying quick-quote selections so saved lines can be reopened
-- in the quote builder with real dropdowns and pricing rather than free text.

ALTER TABLE sales.quote_lines
  ADD COLUMN IF NOT EXISTS configuration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
