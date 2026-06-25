-- Workspace company logo used on client-facing correspondence

ALTER TABLE app.tenant_settings
  ADD COLUMN IF NOT EXISTS company_logo_url text,
  ADD COLUMN IF NOT EXISTS company_logo_storage_path text;
