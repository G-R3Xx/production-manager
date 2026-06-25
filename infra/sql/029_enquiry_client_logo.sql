ALTER TABLE app.enquiries
  ADD COLUMN IF NOT EXISTS client_logo_url text,
  ADD COLUMN IF NOT EXISTS client_logo_storage_path text;
