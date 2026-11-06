-- V26.11.07.01: standalone project timelines without a quote or production job.
-- Apply after migration 065, before deploying the updated app.
BEGIN;

ALTER TABLE production.project_plans
  ALTER COLUMN production_job_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS manual_title varchar(200),
  ADD COLUMN IF NOT EXISTS manual_client_name varchar(200),
  ADD COLUMN IF NOT EXISTS manual_due_date date;

ALTER TABLE production.project_plans
  ADD CONSTRAINT project_plan_source_is_valid CHECK (
    (production_job_id IS NOT NULL AND manual_title IS NULL)
    OR (production_job_id IS NULL AND manual_title IS NOT NULL AND length(btrim(manual_title)) BETWEEN 1 AND 200)
  );

CREATE TABLE production.project_manual_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES production.project_plans(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_project_section_title CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT manual_project_section_project_id_unique UNIQUE (project_id, id)
);
CREATE INDEX project_manual_sections_order_idx
  ON production.project_manual_sections(project_id, sort_order, created_at);

ALTER TABLE production.project_timeline_tasks
  ADD COLUMN IF NOT EXISTS manual_section_id uuid;
ALTER TABLE production.project_timeline_tasks
  ADD CONSTRAINT manual_section_same_project FOREIGN KEY (project_id, manual_section_id)
    REFERENCES production.project_manual_sections (project_id, id)
    ON DELETE SET NULL (manual_section_id),
  ADD CONSTRAINT task_has_one_section_type CHECK (
    NOT (sub_job_id IS NOT NULL AND manual_section_id IS NOT NULL)
  );
CREATE INDEX project_task_manual_section_idx
  ON production.project_timeline_tasks (project_id, manual_section_id);

REVOKE ALL ON production.project_manual_sections FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE production.project_manual_sections IS
  'Manually created Gantt sections, separate from quote Sub Jobs; server-side tenant checks required.';
COMMENT ON COLUMN production.project_plans.manual_title IS
  'Non-null only for manually created projects. No Production Job/Quote/MYOB record is fabricated.';
COMMIT;
