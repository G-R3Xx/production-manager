
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
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export async function listSurveyRequestsForTenant(tenantId: string): Promise<SurveyRequestRecord[]> {
  const result = await pool.query<SurveyRequestRecord>(`
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
      created_at as "createdAt",
      updated_at as "updatedAt",
      completed_at as "completedAt"
    FROM app.survey_requests
    WHERE tenant_id = $1::uuid
    ORDER BY created_at DESC
  `, [tenantId]);
  return result.rows;
}

export async function getSurveyRequestById(tenantId: string, surveyId: string): Promise<SurveyRequestRecord | null> {
  const result = await pool.query<SurveyRequestRecord>(`
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
      created_at as "createdAt",
      updated_at as "updatedAt",
      completed_at as "completedAt"
    FROM app.survey_requests
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
      tenant_id, enquiry_id, linked_customer_id, client_name, contact_name, phone, site_address, due_date, assigned_to, notes, survey_details, status, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::uuid,$3::uuid,$4::varchar,$5::varchar,$6::varchar,$7::text,$8::date,$9::varchar,$10::text,null,'requested',now(),now()
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
