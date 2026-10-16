-- Per-user quote entry layout preference.
-- Safe to run more than once.

ALTER TABLE app.memberships
  ADD COLUMN IF NOT EXISTS quote_entry_layout varchar(20) NOT NULL DEFAULT 'list';

UPDATE app.memberships
SET quote_entry_layout = 'list'
WHERE quote_entry_layout IS NULL
   OR quote_entry_layout NOT IN ('list', 'catalogue');

ALTER TABLE app.memberships
  DROP CONSTRAINT IF EXISTS memberships_quote_entry_layout_check;

ALTER TABLE app.memberships
  ADD CONSTRAINT memberships_quote_entry_layout_check
  CHECK (quote_entry_layout IN ('list', 'catalogue'));
