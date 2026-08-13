-- Bidirectional MYOB master-data sync + local purchase orders.

ALTER TYPE external_entity_type ADD VALUE IF NOT EXISTS 'material';
ALTER TYPE external_entity_type ADD VALUE IF NOT EXISTS 'purchase_order';

ALTER TABLE app.tenant_settings
  ADD COLUMN IF NOT EXISTS myob_purchase_expense_account_uid varchar(255),
  ADD COLUMN IF NOT EXISTS myob_purchase_expense_account_name varchar(255),
  ADD COLUMN IF NOT EXISTS myob_purchase_expense_account_display_id varchar(30),
  ADD COLUMN IF NOT EXISTS myob_purchase_tax_code_uid varchar(255),
  ADD COLUMN IF NOT EXISTS myob_purchase_tax_code varchar(20);

ALTER TABLE catalog.materials
  ADD COLUMN IF NOT EXISTS myob_uid varchar(255),
  ADD COLUMN IF NOT EXISTS myob_display_id varchar(30),
  ADD COLUMN IF NOT EXISTS myob_sync_state varchar(30),
  ADD COLUMN IF NOT EXISTS myob_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS materials_tenant_myob_uid_uq
  ON catalog.materials (tenant_id, myob_uid)
  WHERE myob_uid IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS purchasing;

CREATE TABLE IF NOT EXISTS purchasing.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  po_number varchar(50) NOT NULL,
  supplier_id uuid NOT NULL REFERENCES app.suppliers(id) ON DELETE RESTRICT,
  status varchar(30) NOT NULL DEFAULT 'draft',
  myob_uid varchar(255),
  myob_number varchar(50),
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  promised_date date,
  ship_to_address text,
  notes text,
  is_tax_inclusive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchasing.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES purchasing.purchase_orders(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  material_id uuid NOT NULL REFERENCES catalog.materials(id) ON DELETE RESTRICT,
  quantity numeric(13,6) NOT NULL DEFAULT 1,
  unit_cost numeric(13,6) NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_orders_tenant_updated_idx
  ON purchasing.purchase_orders (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS purchase_order_lines_order_idx
  ON purchasing.purchase_order_lines (tenant_id, purchase_order_id, sort_order, created_at);
