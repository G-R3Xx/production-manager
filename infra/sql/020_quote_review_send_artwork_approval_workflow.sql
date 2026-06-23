-- Quote review/send and in-app artwork approval workflow.
-- Safe to run more than once.

CREATE SCHEMA IF NOT EXISTS sales;

ALTER TABLE sales.quote_drafts
  ADD COLUMN IF NOT EXISTS quote_number varchar(50),
  ADD COLUMN IF NOT EXISTS public_token varchar(96),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS changes_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_response_notes text;

CREATE UNIQUE INDEX IF NOT EXISTS quote_drafts_public_token_unique_idx
  ON sales.quote_drafts (public_token)
  WHERE public_token IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS artwork_approval_pages_approval_sort_idx
  ON sales.artwork_approval_pages (approval_id, sort_order, created_at);
