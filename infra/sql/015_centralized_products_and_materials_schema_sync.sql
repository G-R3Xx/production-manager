-- Centralized products workflow + materials schema sync

ALTER TABLE IF EXISTS app.suppliers
  ALTER COLUMN myob_uid DROP NOT NULL;

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

-- Leave material_type nullable for compatibility with existing enum-based installs.
-- The app now reads COALESCE(material_type::text, type) and writes to legacy type safely.

ALTER TABLE IF EXISTS catalog.materials
  ALTER COLUMN type DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'catalog' AND indexname = 'materials_source_product_idx'
  ) THEN
    CREATE INDEX materials_source_product_idx ON catalog.materials(source_product_id);
  END IF;
END $$;
