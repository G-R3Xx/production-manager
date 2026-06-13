
CREATE SCHEMA IF NOT EXISTS sales;

CREATE TABLE IF NOT EXISTS app.enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  client_name varchar(255) NOT NULL,
  contact_name varchar(255),
  email varchar(255),
  phone varchar(80),
  source varchar(120),
  urgency varchar(120),
  site_address text,
  request_summary text NOT NULL,
  notes text,
  status varchar(50) NOT NULL DEFAULT 'new',
  linked_customer_id uuid NULL REFERENCES app.customers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enquiries_tenant_created_idx
  ON app.enquiries (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.survey_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  enquiry_id uuid NULL REFERENCES app.enquiries(id) ON DELETE SET NULL,
  linked_customer_id uuid NULL REFERENCES app.customers(id) ON DELETE SET NULL,
  client_name varchar(255) NOT NULL,
  contact_name varchar(255),
  phone varchar(80),
  site_address text,
  due_date date,
  assigned_to varchar(255),
  notes text,
  survey_details text,
  status varchar(50) NOT NULL DEFAULT 'requested',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_requests_tenant_created_idx
  ON app.survey_requests (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sales.quote_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  enquiry_id uuid NULL REFERENCES app.enquiries(id) ON DELETE SET NULL,
  survey_request_id uuid NULL REFERENCES app.survey_requests(id) ON DELETE SET NULL,
  linked_customer_id uuid NULL REFERENCES app.customers(id) ON DELETE SET NULL,
  client_name varchar(255) NOT NULL,
  contact_name varchar(255),
  email varchar(255),
  phone varchar(80),
  status varchar(50) NOT NULL DEFAULT 'draft',
  discount_percent numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_drafts_tenant_created_idx
  ON sales.quote_drafts (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sales.quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES sales.quote_drafts(id) ON DELETE CASCADE,
  product_id uuid NULL REFERENCES catalog.products(id) ON DELETE SET NULL,
  product_name varchar(255) NOT NULL,
  option_summary text,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_lines_quote_created_idx
  ON sales.quote_lines (quote_id, created_at ASC);
