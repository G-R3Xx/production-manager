ALTER TABLE catalog.labour_operations
  ADD COLUMN IF NOT EXISTS consumable_material_id uuid REFERENCES catalog.materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumable_quantity numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumable_basis varchar(40) NOT NULL DEFAULT 'per_operation_unit';
