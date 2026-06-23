-- Artwork approval portal rebuild fields.
-- Safe to run more than once.

CREATE SCHEMA IF NOT EXISTS sales;

CREATE TABLE IF NOT EXISTS sales.artwork_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES sales.quote_drafts(id) ON DELETE CASCADE,
  public_token varchar(96),
  client_name varchar(255) NOT NULL,
  contact_name varchar(255),
  email varchar(255),
  status varchar(50) NOT NULL DEFAULT 'draft',
  client_response_notes text,
  sent_at timestamptz,
  viewed_at timestamptz,
  approved_at timestamptz,
  changes_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales.artwork_approvals
  ADD COLUMN IF NOT EXISTS project_name varchar(255),
  ADD COLUMN IF NOT EXISTS site_address text,
  ADD COLUMN IF NOT EXISTS drawing_title varchar(255),
  ADD COLUMN IF NOT EXISTS drawing_number varchar(80),
  ADD COLUMN IF NOT EXISTS revision varchar(40),
  ADD COLUMN IF NOT EXISTS revision_note text,
  ADD COLUMN IF NOT EXISTS designer_name varchar(255),
  ADD COLUMN IF NOT EXISTS client_message text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS client_signatory_name varchar(255),
  ADD COLUMN IF NOT EXISTS client_signature_data_url text,
  ADD COLUMN IF NOT EXISTS client_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS internally_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS internally_approved_by varchar(255),
  ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS artwork_approvals_public_token_unique_idx
  ON sales.artwork_approvals (public_token)
  WHERE public_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS artwork_approvals_quote_unique_idx
  ON sales.artwork_approvals (quote_id);

CREATE TABLE IF NOT EXISTS sales.artwork_approval_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES sales.artwork_approvals(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  image_url text NOT NULL,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales.artwork_approval_pages
  ADD COLUMN IF NOT EXISTS sign_code varchar(40),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_storage_path text,
  ADD COLUMN IF NOT EXISTS file_name varchar(255),
  ADD COLUMN IF NOT EXISTS production_type varchar(50) NOT NULL DEFAULT 'signage',
  ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS colour_summary text,
  ADD COLUMN IF NOT EXISTS size_summary text,
  ADD COLUMN IF NOT EXISTS substrate_summary text,
  ADD COLUMN IF NOT EXISTS install_summary text,
  ADD COLUMN IF NOT EXISTS small_format_summary text,
  ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS artwork_approval_pages_approval_sort_idx
  ON sales.artwork_approval_pages (approval_id, sort_order, created_at);
