-- Production chain: approved artwork -> production job -> print-ready files + checklist

CREATE SCHEMA IF NOT EXISTS production;

CREATE TABLE IF NOT EXISTS production.production_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  artwork_approval_id uuid NOT NULL REFERENCES sales.artwork_approvals(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES sales.quote_drafts(id) ON DELETE CASCADE,
  quote_number varchar(50),
  client_name varchar(255) NOT NULL,
  contact_name varchar(255),
  project_name varchar(255),
  status varchar(50) NOT NULL DEFAULT 'ready_to_start',
  priority varchar(50),
  due_date date,
  assigned_to varchar(255),
  internal_notes text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE production.production_jobs
  ADD COLUMN IF NOT EXISTS quote_number varchar(50),
  ADD COLUMN IF NOT EXISTS contact_name varchar(255),
  ADD COLUMN IF NOT EXISTS project_name varchar(255),
  ADD COLUMN IF NOT EXISTS priority varchar(50),
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS assigned_to varchar(255),
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS production_jobs_artwork_approval_unique_idx
  ON production.production_jobs (artwork_approval_id);

CREATE INDEX IF NOT EXISTS production_jobs_tenant_status_updated_idx
  ON production.production_jobs (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS production.production_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES production.production_jobs(id) ON DELETE CASCADE,
  artwork_page_id uuid REFERENCES sales.artwork_approval_pages(id) ON DELETE SET NULL,
  source_quote_line_id uuid,
  item_code varchar(40),
  title varchar(255) NOT NULL,
  production_type varchar(50) NOT NULL DEFAULT 'signage',
  quantity numeric NOT NULL DEFAULT 1,
  size_summary text,
  substrate_summary text,
  colour_summary text,
  finishing_summary text,
  proof_image_url text,
  proof_file_name varchar(255),
  print_ready_url text,
  print_ready_storage_path text,
  print_ready_file_name varchar(255),
  print_ready_file_type varchar(80),
  print_ready_notes text,
  print_ready_uploaded_at timestamptz,
  print_ready_uploaded_by varchar(255),
  status varchar(50) NOT NULL DEFAULT 'waiting_on_file',
  sort_order integer NOT NULL DEFAULT 0,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE production.production_items
  ADD COLUMN IF NOT EXISTS source_quote_line_id uuid,
  ADD COLUMN IF NOT EXISTS item_code varchar(40),
  ADD COLUMN IF NOT EXISTS production_type varchar(50) NOT NULL DEFAULT 'signage',
  ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS size_summary text,
  ADD COLUMN IF NOT EXISTS substrate_summary text,
  ADD COLUMN IF NOT EXISTS colour_summary text,
  ADD COLUMN IF NOT EXISTS finishing_summary text,
  ADD COLUMN IF NOT EXISTS proof_image_url text,
  ADD COLUMN IF NOT EXISTS proof_file_name varchar(255),
  ADD COLUMN IF NOT EXISTS print_ready_url text,
  ADD COLUMN IF NOT EXISTS print_ready_storage_path text,
  ADD COLUMN IF NOT EXISTS print_ready_file_name varchar(255),
  ADD COLUMN IF NOT EXISTS print_ready_file_type varchar(80),
  ADD COLUMN IF NOT EXISTS print_ready_notes text,
  ADD COLUMN IF NOT EXISTS print_ready_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS print_ready_uploaded_by varchar(255),
  ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS production_items_artwork_page_unique_idx
  ON production.production_items (job_id, artwork_page_id)
  WHERE artwork_page_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS production.production_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES production.production_jobs(id) ON DELETE CASCADE,
  item_id uuid REFERENCES production.production_items(id) ON DELETE CASCADE,
  label varchar(255) NOT NULL,
  step_type varchar(80) NOT NULL DEFAULT 'general',
  status varchar(50) NOT NULL DEFAULT 'pending',
  checked_at timestamptz,
  checked_by varchar(255),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE production.production_steps
  ADD COLUMN IF NOT EXISTS step_type varchar(80) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_by varchar(255),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS production_steps_item_label_unique_idx
  ON production.production_steps (job_id, item_id, lower(label))
  WHERE item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS production_steps_job_sort_idx
  ON production.production_steps (job_id, item_id, sort_order, created_at);
