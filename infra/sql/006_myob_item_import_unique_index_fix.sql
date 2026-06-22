-- Ensure catalog.products upsert can use ON CONFLICT (tenant_id, myob_uid)
DROP INDEX IF EXISTS catalog.products_tenant_myob_uid_idx;
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_myob_uid_idx
  ON catalog.products (tenant_id, myob_uid);
