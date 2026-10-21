-- Move quote visual category schema creation out of request paths.
ALTER TABLE app.tenant_settings
  ADD COLUMN IF NOT EXISTS quote_visual_categories_json jsonb NOT NULL DEFAULT '{}'::jsonb;
