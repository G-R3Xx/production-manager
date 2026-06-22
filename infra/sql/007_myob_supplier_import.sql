-- Add MYOB supplier import support to local app suppliers
CREATE TABLE IF NOT EXISTS app.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  myob_uid varchar(255) NOT NULL,
  display_name varchar(255) NOT NULL,
  company_name varchar(255),
  first_name varchar(120),
  last_name varchar(120),
  email varchar(255),
  phone varchar(80),
  is_active boolean NOT NULL DEFAULT true,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, myob_uid)
);

CREATE INDEX IF NOT EXISTS suppliers_tenant_display_name_idx
  ON app.suppliers (tenant_id, display_name);
