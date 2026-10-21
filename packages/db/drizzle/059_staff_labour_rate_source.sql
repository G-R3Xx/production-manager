-- V26.10.21.10
-- Operations own labour TIME, while Staff / Company settings own labour RATES.
-- Machines remain equipment-cost-only.

ALTER TABLE catalog.labour_operations
  ADD COLUMN IF NOT EXISTS labour_user_profile_id uuid REFERENCES app.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS labour_operations_tenant_labour_user_idx
  ON catalog.labour_operations (tenant_id, labour_user_profile_id)
  WHERE labour_user_profile_id IS NOT NULL;

-- The legacy per-operation rate is deliberately neutralised. The application now
-- resolves the effective rate from app.memberships.quote_labour_rate, falling back
-- to app.tenant_settings.quote_labour_rate.
UPDATE catalog.labour_operations
SET hourly_rate = 0
WHERE hourly_rate <> 0;

COMMENT ON COLUMN catalog.labour_operations.labour_user_profile_id IS
  'Optional normal staff member whose membership labour rate is used. NULL uses the tenant factory labour rate.';
COMMENT ON COLUMN catalog.labour_operations.hourly_rate IS
  'Legacy only. Labour rates are resolved from Staff / Company settings; this value is not used for quote costing.';
