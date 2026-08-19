BEGIN;

CREATE TABLE IF NOT EXISTS app.job_process_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES app.jobs(id) ON DELETE CASCADE,
  process_key varchar(40) NOT NULL,
  assignee_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_process_assignments_process_key_chk CHECK (
    process_key IN ('enquiry','survey','quote','artwork','production','dispatch','invoicing')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS job_process_assignments_job_process_uidx
  ON app.job_process_assignments (job_id, process_key);

CREATE INDEX IF NOT EXISTS job_process_assignments_tenant_due_idx
  ON app.job_process_assignments (tenant_id, due_date, process_key);

ALTER TABLE app.job_tasks
  ADD COLUMN IF NOT EXISTS process_key varchar(40);

UPDATE app.job_tasks
SET process_key = CASE
  WHEN stage = 'new_enquiry' THEN 'enquiry'
  WHEN stage LIKE 'survey_%' THEN 'survey'
  WHEN stage LIKE 'quote_%' THEN 'quote'
  WHEN stage LIKE 'artwork_%' THEN 'artwork'
  WHEN stage = 'production' THEN 'production'
  WHEN stage LIKE 'ready_for_%' THEN 'dispatch'
  WHEN stage IN ('invoice_required','invoiced','closed') THEN 'invoicing'
  ELSE NULL
END
WHERE is_system = true
  AND process_key IS NULL;

ALTER TABLE production.production_steps
  ADD COLUMN IF NOT EXISTS assignee_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS assignment_source varchar(24) NOT NULL DEFAULT 'inherited',
  ADD COLUMN IF NOT EXISTS assignment_process_key varchar(40) NOT NULL DEFAULT 'production';

UPDATE production.production_steps
SET assignment_process_key = CASE
  WHEN lower(COALESCE(step_type, '') || ' ' || COALESCE(label, '')) ~ '(ready|install|delivery|deliver|pickup|collect|dispatch)'
    THEN 'dispatch'
  ELSE 'production'
END
WHERE assignment_source = 'inherited';

COMMIT;
