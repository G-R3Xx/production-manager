-- Install Scheduler survey bridge
-- Adds fields that let a Production Manager survey request link to the matching Firestore job
-- and store completed survey data returned from Install Scheduler.

ALTER TABLE app.survey_requests
  ADD COLUMN IF NOT EXISTS install_scheduler_job_id varchar(255),
  ADD COLUMN IF NOT EXISTS install_scheduler_job_url text,
  ADD COLUMN IF NOT EXISTS install_scheduler_sync_status varchar(80) NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS install_scheduler_sync_error text,
  ADD COLUMN IF NOT EXISTS install_scheduler_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS install_scheduler_completed_survey_id varchar(255),
  ADD COLUMN IF NOT EXISTS install_scheduler_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS install_scheduler_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS survey_requests_install_scheduler_job_idx
  ON app.survey_requests (install_scheduler_job_id)
  WHERE install_scheduler_job_id IS NOT NULL;
