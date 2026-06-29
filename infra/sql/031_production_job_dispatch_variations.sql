-- Production Manager V26.06.29.11
-- Production job dispatch changes + variation line support.

CREATE SCHEMA IF NOT EXISTS production;

ALTER TABLE production.production_jobs
  ADD COLUMN IF NOT EXISTS dispatch_type varchar(40);

CREATE INDEX IF NOT EXISTS production_jobs_tenant_dispatch_updated_idx
  ON production.production_jobs (tenant_id, dispatch_type, updated_at DESC);
