BEGIN;

CREATE TABLE IF NOT EXISTS app.task_assignment_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  assignment_key varchar(60) NOT NULL,
  assignee_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS task_assignment_defaults_tenant_key_uidx
  ON app.task_assignment_defaults (tenant_id, assignment_key);

ALTER TABLE app.job_process_assignments
  ADD COLUMN IF NOT EXISTS assignment_source varchar(24) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS assignment_default_key varchar(60);

ALTER TABLE production.production_steps
  ADD COLUMN IF NOT EXISTS assignment_default_key varchar(60);

COMMIT;
