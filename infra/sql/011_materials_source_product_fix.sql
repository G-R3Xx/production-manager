ALTER TABLE catalog.materials
  ADD COLUMN IF NOT EXISTS source_product_id uuid NULL REFERENCES catalog.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS materials_source_product_idx
  ON catalog.materials (tenant_id, source_product_id);
