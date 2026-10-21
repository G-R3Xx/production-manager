-- Site-wide read/pulse indexes introduced by the V26.10.21 performance pass.
-- All are tenant-first because Production Manager is multi-tenant and nearly
-- every authenticated read is scoped by tenant_id.

CREATE INDEX IF NOT EXISTS enquiries_tenant_updated_idx
  ON app.enquiries (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS survey_requests_tenant_updated_idx
  ON app.survey_requests (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS jobs_tenant_stage_updated_idx
  ON app.jobs (tenant_id, current_stage, updated_at DESC);

CREATE INDEX IF NOT EXISTS job_process_assignments_tenant_job_idx
  ON app.job_process_assignments (tenant_id, job_id, process_key);

CREATE INDEX IF NOT EXISTS job_process_assignments_tenant_updated_idx
  ON app.job_process_assignments (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS job_tasks_tenant_job_updated_idx
  ON app.job_tasks (tenant_id, job_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS quote_drafts_tenant_status_updated_idx
  ON sales.quote_drafts (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS quote_drafts_tenant_enquiry_idx
  ON sales.quote_drafts (tenant_id, enquiry_id)
  WHERE enquiry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quote_lines_quote_updated_idx
  ON sales.quote_lines (quote_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS artwork_approvals_tenant_status_updated_idx
  ON sales.artwork_approvals (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS artwork_pages_approval_updated_idx
  ON sales.artwork_approval_pages (approval_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS production_jobs_tenant_status_updated_idx
  ON production.production_jobs (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS production_items_job_sort_idx
  ON production.production_items (job_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS production_steps_job_status_sort_idx
  ON production.production_steps (job_id, status, sort_order, created_at);

CREATE INDEX IF NOT EXISTS purchase_orders_tenant_updated_idx
  ON purchasing.purchase_orders (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS memberships_profile_status_tenant_idx
  ON app.memberships (user_profile_id, status, tenant_id);

CREATE INDEX IF NOT EXISTS customers_tenant_display_name_idx
  ON app.customers (tenant_id, display_name);

CREATE INDEX IF NOT EXISTS suppliers_tenant_display_name_idx
  ON app.suppliers (tenant_id, display_name);

CREATE INDEX IF NOT EXISTS materials_tenant_group_active_type_idx
  ON catalog.materials (tenant_id, material_group, active, type);

CREATE INDEX IF NOT EXISTS products_tenant_status_department_idx
  ON catalog.products (tenant_id, status, department);
