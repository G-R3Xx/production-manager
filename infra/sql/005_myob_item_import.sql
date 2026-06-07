-- Add MYOB item import support to local catalog products
ALTER TABLE catalog.products
  ADD COLUMN IF NOT EXISTS myob_uid varchar,
  ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_myob_uid_idx
  ON catalog.products (tenant_id, myob_uid)
  WHERE myob_uid IS NOT NULL;
