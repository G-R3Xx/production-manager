ALTER TABLE catalog.materials
  ADD COLUMN IF NOT EXISTS source_product_id uuid NULL REFERENCES catalog.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sku varchar NULL,
  ADD COLUMN IF NOT EXISTS material_type varchar NOT NULL DEFAULT 'sheet',
  ADD COLUMN IF NOT EXISTS stock_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS length_mm numeric NULL,
  ADD COLUMN IF NOT EXISTS roll_width_mm numeric NULL,
  ADD COLUMN IF NOT EXISTS notes varchar NULL;

CREATE INDEX IF NOT EXISTS materials_source_product_idx
  ON catalog.materials (tenant_id, source_product_id);
