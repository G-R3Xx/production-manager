import "server-only";

import { pool } from "@production-manager/db";

export type SurveyRequestRecord = {
  id: string;
  tenantId: string;
  enquiryId: string | null;
  linkedCustomerId: string | null;
  clientName: string;
  contactName: string | null;
  phone: string | null;
  siteAddress: string | null;
  dueDate: string | null;
  assignedTo: string | null;
  notes: string | null;
  surveyDetails: string | null;
  status: string;
  installSchedulerJobId: string | null;
  installSchedulerJobUrl: string | null;
  installSchedulerSyncStatus: string | null;
  installSchedulerSyncError: string | null;
  installSchedulerSyncedAt: string | null;
  installSchedulerCompletedSurveyId: string | null;
  installSchedulerCompletedAt: string | null;
  installSchedulerPayload: unknown | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

const surveyRequestSelect = `
  SELECT
    id,
    tenant_id as "tenantId",
    enquiry_id as "enquiryId",
    linked_customer_id as "linkedCustomerId",
    client_name as "clientName",
    contact_name as "contactName",
    phone,
    site_address as "siteAddress",
    due_date::text as "dueDate",
    assigned_to as "assignedTo",
    notes,
    survey_details as "surveyDetails",
    status,
    install_scheduler_job_id as "installSchedulerJobId",
    install_scheduler_job_url as "installSchedulerJobUrl",
    install_scheduler_sync_status as "installSchedulerSyncStatus",
    install_scheduler_sync_error as "installSchedulerSyncError",
    install_scheduler_synced_at::text as "installSchedulerSyncedAt",
    install_scheduler_completed_survey_id as "installSchedulerCompletedSurveyId",
    install_scheduler_completed_at::text as "installSchedulerCompletedAt",
    install_scheduler_payload as "installSchedulerPayload",
    created_at as "createdAt",
    updated_at as "updatedAt",
    completed_at as "completedAt"
  FROM app.survey_requests
`;

export async function listSurveyRequestsForTenant(tenantId: string, options?: { includeDeleted?: boolean }): Promise<SurveyRequestRecord[]> {
  const result = await pool.query<SurveyRequestRecord>(`${surveyRequestSelect}
    WHERE tenant_id = $1::uuid
      AND ($2::boolean OR status <> 'deleted')
    ORDER BY created_at DESC
  `, [tenantId, Boolean(options?.includeDeleted)]);
  return result.rows;
}

export async function getSurveyRequestById(tenantId: string, surveyId: string): Promise<SurveyRequestRecord | null> {
  const result = await pool.query<SurveyRequestRecord>(`${surveyRequestSelect}
    WHERE tenant_id = $1::uuid AND id = $2::uuid
    LIMIT 1
  `, [tenantId, surveyId]);
  return result.rows[0] ?? null;
}

export async function createSurveyRequestForTenant(tenantId: string, input: {
  enquiryId?: string | null;
  linkedCustomerId?: string | null;
  clientName: string;
  contactName?: string | null;
  phone?: string | null;
  siteAddress?: string | null;
  dueDate?: string | null;
  assignedTo?: string | null;
  notes?: string | null;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(`
    INSERT INTO app.survey_requests (
      tenant_id, enquiry_id, linked_customer_id, client_name, contact_name, phone, site_address, due_date, assigned_to, notes, survey_details, status, install_scheduler_sync_status, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::uuid,$3::uuid,$4::varchar,$5::varchar,$6::varchar,$7::text,$8::date,$9::varchar,$10::text,null,'requested','not_synced',now(),now()
    ) RETURNING id
  `, [
    tenantId,
    input.enquiryId ?? null,
    input.linkedCustomerId ?? null,
    input.clientName,
    input.contactName ?? null,
    input.phone ?? null,
    input.siteAddress ?? null,
    input.dueDate ?? null,
    input.assignedTo ?? null,
    input.notes ?? null
  ]);
  return result.rows[0];
}

export async function getLatestSurveyRequestForEnquiry(tenantId: string, enquiryId: string): Promise<SurveyRequestRecord | null> {
  const result = await pool.query<SurveyRequestRecord>(`${surveyRequestSelect}
    WHERE tenant_id = $1::uuid
      AND enquiry_id = $2::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `, [tenantId, enquiryId]);
  return result.rows[0] ?? null;
}

export async function updateSurveyRequestForTenant(tenantId: string, surveyId: string, input: {
  status?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  surveyDetails?: string | null;
}): Promise<void> {
  const status = input.status?.trim() || "requested";
  await pool.query(`
    UPDATE app.survey_requests
    SET status = $3::varchar,
        assigned_to = $4::varchar,
        due_date = NULLIF($5::text, '')::date,
        notes = $6::text,
        survey_details = $7::text,
        completed_at = CASE
          WHEN $3::varchar = 'completed' AND completed_at IS NULL THEN now()
          WHEN $3::varchar <> 'completed' THEN NULL
          ELSE completed_at
        END,
        updated_at = now()
    WHERE tenant_id = $1::uuid
      AND id = $2::uuid
  `, [
    tenantId,
    surveyId,
    status,
    input.assignedTo ?? null,
    input.dueDate ?? null,
    input.notes ?? null,
    input.surveyDetails ?? null
  ]);
}

export async function updateSurveyInstallSchedulerLink(tenantId: string, surveyId: string, input: {
  jobId?: string | null;
  jobUrl?: string | null;
  syncStatus: string;
  syncError?: string | null;
  payload?: unknown | null;
}): Promise<void> {
  await pool.query(`
    UPDATE app.survey_requests
    SET install_scheduler_job_id = COALESCE($3::varchar, install_scheduler_job_id),
        install_scheduler_job_url = COALESCE($4::text, install_scheduler_job_url),
        install_scheduler_sync_status = $5::varchar,
        install_scheduler_sync_error = $6::text,
        install_scheduler_payload = COALESCE($7::jsonb, install_scheduler_payload),
        install_scheduler_synced_at = CASE WHEN $5::varchar = 'created' THEN now() ELSE install_scheduler_synced_at END,
        updated_at = now()
    WHERE tenant_id = $1::uuid
      AND id = $2::uuid
  `, [
    tenantId,
    surveyId,
    input.jobId ?? null,
    input.jobUrl ?? null,
    input.syncStatus,
    input.syncError ?? null,
    input.payload == null ? null : JSON.stringify(input.payload)
  ]);
}

export async function updateSurveyFromInstallSchedulerCompletion(tenantId: string, surveyId: string, input: {
  installSchedulerJobId?: string | null;
  installSchedulerJobUrl?: string | null;
  installSchedulerSurveyId?: string | null;
  status?: string | null;
  surveyDetails: string;
  payload: unknown;
}): Promise<void> {
  await pool.query(`
    UPDATE app.survey_requests
    SET status = COALESCE(NULLIF($3::varchar, ''), 'completed'),
        survey_details = $4::text,
        install_scheduler_job_id = COALESCE($5::varchar, install_scheduler_job_id),
        install_scheduler_job_url = COALESCE($6::text, install_scheduler_job_url),
        install_scheduler_completed_survey_id = COALESCE($7::varchar, install_scheduler_completed_survey_id),
        install_scheduler_completed_at = now(),
        install_scheduler_sync_status = 'completed',
        install_scheduler_sync_error = NULL,
        install_scheduler_payload = $8::jsonb,
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE tenant_id = $1::uuid
      AND id = $2::uuid
  `, [
    tenantId,
    surveyId,
    input.status ?? "completed",
    input.surveyDetails,
    input.installSchedulerJobId ?? null,
    input.installSchedulerJobUrl ?? null,
    input.installSchedulerSurveyId ?? null,
    JSON.stringify(input.payload ?? {})
  ]);
}

export async function setSurveyRequestStatusForTenant(tenantId: string, surveyId: string, status: string): Promise<void> {
  await pool.query(`
    UPDATE app.survey_requests
    SET status = $3::varchar,
        updated_at = now()
    WHERE tenant_id = $1::uuid
      AND id = $2::uuid
  `, [tenantId, surveyId, status]);
}
