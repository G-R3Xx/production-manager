-- Quote/invoice groundwork extensions
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'part_paid', 'paid', 'void');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS app.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  customer_id uuid,
  quote_id uuid,
  invoice_number varchar(50) NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  issue_date timestamptz,
  due_date timestamptz,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_total numeric(12,2) NOT NULL DEFAULT 0,
  grand_total numeric(12,2) NOT NULL DEFAULT 0,
  myob_uid varchar(255),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_tenant_created_idx ON app.invoices (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES app.invoices(id) ON DELETE CASCADE,
  quote_line_id uuid,
  product_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  qty numeric(12,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  display_title varchar(255) NOT NULL,
  display_subtitle text,
  selection_summary text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_lines_tenant_invoice_idx ON app.invoice_lines (tenant_id, invoice_id, sort_order);
