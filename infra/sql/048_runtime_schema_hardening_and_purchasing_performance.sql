-- Move schema changes that were historically guarded at runtime into a normal
-- migration so production requests can trust the database shape and avoid DDL/
-- information_schema checks on every cold Vercel function instance.

ALTER TABLE app.suppliers
  ADD COLUMN IF NOT EXISTS purchase_order_email varchar(320);

ALTER TABLE app.tenant_settings
  ADD COLUMN IF NOT EXISTS myob_sales_income_account_uid varchar(255),
  ADD COLUMN IF NOT EXISTS myob_sales_income_account_name varchar(255),
  ADD COLUMN IF NOT EXISTS myob_sales_income_account_display_id varchar(30);

ALTER TABLE purchasing.purchase_orders
  ADD COLUMN IF NOT EXISTS myob_sync_status varchar(30) NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS myob_last_error text,
  ADD COLUMN IF NOT EXISTS myob_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_to varchar(320),
  ADD COLUMN IF NOT EXISTS email_status varchar(30) NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_last_error text,
  ADD COLUMN IF NOT EXISTS email_message_id varchar(255),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

CREATE TABLE IF NOT EXISTS purchasing.purchase_order_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES purchasing.purchase_orders(id) ON DELETE CASCADE,
  document_type varchar(40) NOT NULL DEFAULT 'purchase_order_pdf',
  file_name varchar(255) NOT NULL,
  content_type varchar(100) NOT NULL DEFAULT 'application/pdf',
  file_bytes bytea NOT NULL,
  recipient_email varchar(320),
  message_id varchar(255),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchasing.purchase_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES purchasing.purchase_orders(id) ON DELETE CASCADE,
  event_type varchar(60) NOT NULL,
  message text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_order_documents_order_idx
  ON purchasing.purchase_order_documents (tenant_id, purchase_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_order_events_order_idx
  ON purchasing.purchase_order_events (tenant_id, purchase_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_tenant_updated_idx
  ON purchasing.purchase_orders (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS purchase_order_lines_order_idx
  ON purchasing.purchase_order_lines (tenant_id, purchase_order_id, sort_order, created_at);

-- The Purchasing page now queries only active materials that are either shared or
-- assigned to the selected supplier. This index keeps that lookup cheap as the
-- material catalogue grows.
CREATE INDEX IF NOT EXISTS materials_tenant_supplier_active_name_idx
  ON catalog.materials (tenant_id, supplier_id, active, name);

-- Legacy purchase orders created before the explicit sync state existed may
-- already have a MYOB UID. Preserve their true state.
UPDATE purchasing.purchase_orders
SET myob_sync_status='synced',
    myob_synced_at=COALESCE(myob_synced_at,updated_at)
WHERE myob_uid IS NOT NULL
  AND myob_sync_status='not_synced';
