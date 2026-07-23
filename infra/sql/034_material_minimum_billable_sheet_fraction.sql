-- V26.07.23.05
-- Adds per-material sheet billing increments. NULL means use the recommended
-- default inferred from the material name; 0 means exact calculated usage.

ALTER TABLE catalog.materials
  ADD COLUMN IF NOT EXISTS minimum_billable_sheet_fraction numeric(6, 4);

COMMENT ON COLUMN catalog.materials.minimum_billable_sheet_fraction IS
  'Minimum billable sheet increment: NULL=recommended, 0=exact, 0.25=quarter, 0.5=half, 1=full sheet.';
