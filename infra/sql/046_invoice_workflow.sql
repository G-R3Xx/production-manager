-- Full Production Manager -> MYOB invoicing workflow.
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'part_paid', 'paid', 'void');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS app.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  customer_id uuid,
  quote_id uuid NOT NULL,
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

ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS job_id uuid;
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS invoice_kind varchar(40) NOT NULL DEFAULT 'full_remaining';
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_number varchar(120);
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_status varchar(80);
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_balance_due numeric(12,2);
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_total_amount numeric(12,2);
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_sync_status varchar(30) NOT NULL DEFAULT 'not_synced';
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_sync_error text;
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_synced_at timestamptz;
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS source_order_uid varchar(255);
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS source_order_number varchar(120);
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false;
ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE TABLE IF NOT EXISTS app.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES app.invoices(id) ON DELETE CASCADE,
  quote_line_id uuid,
  product_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  qty numeric(12,4) NOT NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  display_title varchar(255) NOT NULL,
  display_subtitle text,
  selection_summary text,
  source_kind varchar(40) NOT NULL DEFAULT 'quote_line',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.invoice_lines ADD COLUMN IF NOT EXISTS source_kind varchar(40) NOT NULL DEFAULT 'quote_line';
ALTER TABLE app.invoice_lines ALTER COLUMN qty TYPE numeric(12,4) USING qty::numeric;
CREATE INDEX IF NOT EXISTS invoices_tenant_job_created_idx ON app.invoices (tenant_id, job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoice_lines_tenant_invoice_idx ON app.invoice_lines (tenant_id, invoice_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_myob_uid_uidx ON app.invoices (tenant_id, myob_uid) WHERE myob_uid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_syncing_per_job_uidx ON app.invoices (tenant_id, job_id) WHERE job_id IS NOT NULL AND myob_sync_status='syncing';
