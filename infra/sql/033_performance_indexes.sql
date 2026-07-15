-- Performance indexes for common Production Manager page loads and board refreshes.
-- Safe to run repeatedly.

CREATE INDEX IF NOT EXISTS enquiries_tenant_status_created_idx
  ON app.enquiries (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS enquiries_tenant_updated_idx
  ON app.enquiries (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS enquiry_correspondence_tenant_enquiry_created_idx
  ON app.enquiry_correspondence (tenant_id, enquiry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customers_tenant_display_name_idx
  ON app.customers (tenant_id, display_name);

CREATE INDEX IF NOT EXISTS quote_drafts_tenant_status_created_idx
  ON sales.quote_drafts (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS quote_drafts_tenant_updated_idx
  ON sales.quote_drafts (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS quote_drafts_enquiry_idx
  ON sales.quote_drafts (enquiry_id);

CREATE INDEX IF NOT EXISTS quote_lines_quote_created_idx
  ON sales.quote_lines (quote_id, created_at ASC);

CREATE INDEX IF NOT EXISTS artwork_approvals_tenant_status_updated_idx
  ON sales.artwork_approvals (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS artwork_approval_pages_approval_sort_idx
  ON sales.artwork_approval_pages (approval_id, sort_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS survey_requests_tenant_status_created_idx
  ON app.survey_requests (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS survey_requests_tenant_updated_idx
  ON app.survey_requests (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS production_jobs_tenant_status_updated_idx
  ON production.production_jobs (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS production_jobs_tenant_due_priority_idx
  ON production.production_jobs (tenant_id, due_date ASC NULLS LAST, priority);

CREATE INDEX IF NOT EXISTS production_items_job_sort_idx
  ON production.production_items (job_id, sort_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS production_items_source_quote_line_idx
  ON production.production_items (source_quote_line_id);

CREATE INDEX IF NOT EXISTS production_steps_item_status_sort_idx
  ON production.production_steps (item_id, status, sort_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS production_steps_job_sort_idx
  ON production.production_steps (job_id, item_id, sort_order ASC, created_at ASC);
