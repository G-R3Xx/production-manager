-- Fix ON CONFLICT support for imported MYOB item upserts.
-- Partial unique indexes cannot be inferred by the current ON CONFLICT clause,
-- so replace the prior partial index with a full unique index.
DROP INDEX IF EXISTS catalog.products_tenant_myob_uid_idx;
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_myob_uid_idx
  ON catalog.products (tenant_id, myob_uid);
