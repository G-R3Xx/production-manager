-- Data-driven imagery for the visual quote wizard.
-- Safe to run more than once.

ALTER TABLE catalog.materials
  ADD COLUMN IF NOT EXISTS quote_image_url text,
  ADD COLUMN IF NOT EXISTS quote_image_storage_path text,
  ADD COLUMN IF NOT EXISTS quote_visual_category varchar(40);

ALTER TABLE app.tenant_settings
  ADD COLUMN IF NOT EXISTS quote_visual_categories_json jsonb NOT NULL DEFAULT '{}'::jsonb;
