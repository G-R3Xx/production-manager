CREATE TABLE IF NOT EXISTS app.enquiry_correspondence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  enquiry_id uuid NOT NULL REFERENCES app.enquiries(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enquiry_correspondence_enquiry_created_idx
  ON app.enquiry_correspondence (enquiry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS enquiry_correspondence_tenant_created_idx
  ON app.enquiry_correspondence (tenant_id, created_at DESC);
