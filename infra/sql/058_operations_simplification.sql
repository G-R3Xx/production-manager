-- Production Manager V26.10.21.07
-- Simplify manufacturing costing around one priced Operation.
-- Processes and Production Methods may remain in the database for historical/admin cleanup,
-- but quote costing no longer depends on them.

ALTER TABLE catalog.labour_operations
  ADD COLUMN IF NOT EXISTS machine_id uuid REFERENCES catalog.machines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS labour_operations_tenant_machine_idx
  ON catalog.labour_operations (tenant_id, machine_id)
  WHERE active = true AND machine_id IS NOT NULL;

COMMENT ON COLUMN catalog.labour_operations.machine_id IS
  'Optional machine whose run/setup cost is charged as part of this single operation. Quoting uses the operation as the sole manufacturing-cost source.';
