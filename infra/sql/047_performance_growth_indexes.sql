-- Performance and data-growth indexes for the approved Production Manager workflow.
-- Safe to run repeatedly. Guards are used for runtime-created job tables so a
-- fresh database can still apply the SQL bundle in order.

CREATE INDEX IF NOT EXISTS quote_lines_quote_response_created_idx
  ON sales.quote_lines (quote_id, client_response_status, created_at ASC);

CREATE INDEX IF NOT EXISTS products_tenant_status_name_idx
  ON catalog.products (tenant_id, status, name);

CREATE INDEX IF NOT EXISTS invoices_tenant_job_sync_created_idx
  ON app.invoices (tenant_id, job_id, myob_sync_status, created_at DESC);

CREATE INDEX IF NOT EXISTS invoice_lines_invoice_sort_created_idx
  ON app.invoice_lines (invoice_id, sort_order, created_at ASC);

DO $$
BEGIN
  IF to_regclass('app.jobs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS jobs_tenant_stage_due_updated_idx ON app.jobs (tenant_id, current_stage, due_date ASC NULLS LAST, updated_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS jobs_tenant_updated_idx ON app.jobs (tenant_id, updated_at DESC)';
  END IF;

  IF to_regclass('app.job_tasks') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS job_tasks_job_completed_idx ON app.job_tasks (job_id, completed_at DESC) WHERE completed_at IS NOT NULL';
  END IF;

  IF to_regclass('app.job_process_assignments') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS job_process_assignments_tenant_job_idx ON app.job_process_assignments (tenant_id, job_id, process_key)';
  END IF;
END $$;
