-- V26.11.05.05: optional Project timelines linked to existing production jobs.
-- Run in Supabase SQL Editor BEFORE deploying the application.
-- Schedules are entered in the workspace's Australia/Sydney local wall time.
BEGIN;

CREATE TABLE IF NOT EXISTS production.project_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  production_job_id uuid NOT NULL REFERENCES production.production_jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_plans_job_unique UNIQUE (production_job_id)
);
CREATE INDEX IF NOT EXISTS project_plans_tenant_recent_idx
  ON production.project_plans (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS production.project_timeline_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES production.project_plans(id) ON DELETE CASCADE,
  sub_job_id uuid REFERENCES sales.quote_sub_jobs(id) ON DELETE SET NULL,
  production_step_id uuid REFERENCES production.production_steps(id) ON DELETE SET NULL,
  title varchar(200) NOT NULL,
  planned_start timestamp without time zone NOT NULL,
  planned_end timestamp without time zone NOT NULL,
  allocated_minutes integer NOT NULL DEFAULT 60,
  assignee_profile_id uuid REFERENCES app.user_profiles(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'planned',
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_tasks_valid_schedule CHECK (planned_end > planned_start),
  CONSTRAINT project_tasks_valid_allocation CHECK (allocated_minutes BETWEEN 0 AND 525600),
  CONSTRAINT project_tasks_valid_title CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT project_tasks_valid_status CHECK (status IN ('planned','in_progress','blocked','completed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS project_tasks_production_step_uidx
  ON production.project_timeline_tasks (project_id, production_step_id)
  WHERE production_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_tasks_timeline_idx
  ON production.project_timeline_tasks (project_id, planned_start, sort_order);
CREATE INDEX IF NOT EXISTS project_tasks_sub_job_idx
  ON production.project_timeline_tasks (project_id, sub_job_id);

-- The application uses tenant-scoped server queries and writes. No public anonymous access.
REVOKE ALL ON TABLE production.project_plans, production.project_timeline_tasks FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE production.project_timeline_tasks IS 'Optional project schedule: local Australia/Sydney planning start/end, effort minutes and optional existing Production Step reference.';
COMMIT;
