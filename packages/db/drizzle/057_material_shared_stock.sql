-- V26.10.21.04: one physical stock item can be sold as multiple sales variants.
ALTER TABLE catalog.materials
  ADD COLUMN IF NOT EXISTS stock_source_material_id uuid NULL,
  ADD COLUMN IF NOT EXISTS sales_markup_multiplier numeric(8,4) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'materials_stock_source_material_fk'
      AND conrelid = 'catalog.materials'::regclass
  ) THEN
    ALTER TABLE catalog.materials
      ADD CONSTRAINT materials_stock_source_material_fk
      FOREIGN KEY (stock_source_material_id)
      REFERENCES catalog.materials(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'materials_stock_source_not_self_chk'
      AND conrelid = 'catalog.materials'::regclass
  ) THEN
    ALTER TABLE catalog.materials
      ADD CONSTRAINT materials_stock_source_not_self_chk
      CHECK (stock_source_material_id IS NULL OR stock_source_material_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS materials_tenant_stock_source_idx
  ON catalog.materials (tenant_id, stock_source_material_id)
  WHERE stock_source_material_id IS NOT NULL;
