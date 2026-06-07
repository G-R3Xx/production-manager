CREATE TABLE IF NOT EXISTS catalog.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  supplier_id uuid NULL REFERENCES app.suppliers(id) ON DELETE SET NULL,
  source_product_id uuid NULL REFERENCES catalog.products(id) ON DELETE SET NULL,
  name varchar NOT NULL,
  sku varchar NULL,
  material_type varchar NOT NULL DEFAULT 'sheet',
  stock_uom varchar NOT NULL DEFAULT 'sheet',
  purchase_uom varchar NOT NULL DEFAULT 'sheet',
  stock_quantity numeric NOT NULL DEFAULT 0,
  purchase_cost numeric NOT NULL DEFAULT 0,
  width_mm numeric NULL,
  length_mm numeric NULL,
  roll_width_mm numeric NULL,
  gsm numeric NULL,
  notes varchar NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS materials_tenant_name_uq
  ON catalog.materials (tenant_id, name);

CREATE INDEX IF NOT EXISTS materials_tenant_idx
  ON catalog.materials (tenant_id, created_at DESC);


ALTER TABLE catalog.materials
  ADD COLUMN IF NOT EXISTS source_product_id uuid NULL REFERENCES catalog.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS materials_source_product_idx
  ON catalog.materials (tenant_id, source_product_id);
