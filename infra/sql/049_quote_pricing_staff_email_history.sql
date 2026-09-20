-- Pricing tiers, staff-specific quote labour rates and durable quote email history.
-- Safe to run more than once.

ALTER TABLE app.tenant_settings
  ADD COLUMN IF NOT EXISTS profit_tiers_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE app.memberships
  ADD COLUMN IF NOT EXISTS quote_labour_rate numeric(10,2);

ALTER TABLE sales.quote_drafts
  ADD COLUMN IF NOT EXISTS email_history_json jsonb NOT NULL DEFAULT '[]'::jsonb;
