-- Products/materials workflow polish and compatibility guardrails.
-- This migration is intentionally additive/idempotent for projects that already ran the earlier schema sync.

ALTER TABLE IF EXISTS catalog.products
  ADD COLUMN IF NOT EXISTS tax_code varchar(50) NULL;

UPDATE catalog.products
SET tax_code = 'GST'
WHERE tax_code IS NULL;

ALTER TABLE IF EXISTS catalog.materials
  ADD COLUMN IF NOT EXISTS source_product_id uuid NULL REFERENCES catalog.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sku varchar NULL,
  ADD COLUMN IF NOT EXISTS material_type varchar NULL,
  ADD COLUMN IF NOT EXISTS stock_quantity numeric(14,4) NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_cost numeric(14,4) NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS width_mm numeric NULL,
  ADD COLUMN IF NOT EXISTS length_mm numeric NULL,
  ADD COLUMN IF NOT EXISTS roll_width_mm numeric NULL,
  ADD COLUMN IF NOT EXISTS gsm numeric NULL,
  ADD COLUMN IF NOT EXISTS notes varchar NULL,
  ADD COLUMN IF NOT EXISTS stock_uom varchar NULL DEFAULT 'sheet',
  ADD COLUMN IF NOT EXISTS purchase_uom varchar NULL DEFAULT 'sheet',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS catalog.materials
  ALTER COLUMN type DROP NOT NULL;

CREATE INDEX IF NOT EXISTS materials_tenant_supplier_idx ON catalog.materials(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS materials_source_product_idx ON catalog.materials(source_product_id);
CREATE INDEX IF NOT EXISTS products_tenant_family_idx ON catalog.products(tenant_id, product_family);
