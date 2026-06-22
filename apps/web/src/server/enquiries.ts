
import "server-only";

import { pool } from "@production-manager/db";

export type EnquiryRecord = {
  id: string;
  tenantId: string;
  clientName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  urgency: string | null;
  siteAddress: string | null;
  requestSummary: string;
  notes: string | null;
  status: string;
  linkedCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listEnquiriesForTenant(tenantId: string): Promise<EnquiryRecord[]> {
  const result = await pool.query<EnquiryRecord>(`
    SELECT
      id,
      tenant_id as "tenantId",
      client_name as "clientName",
      contact_name as "contactName",
      email,
      phone,
      source,
      urgency,
      site_address as "siteAddress",
      request_summary as "requestSummary",
      notes,
      status,
      linked_customer_id as "linkedCustomerId",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM app.enquiries
    WHERE tenant_id = $1::uuid
    ORDER BY created_at DESC
  `, [tenantId]);
  return result.rows;
}

export async function getEnquiryById(tenantId: string, enquiryId: string): Promise<EnquiryRecord | null> {
  const result = await pool.query<EnquiryRecord>(`
    SELECT
      id,
      tenant_id as "tenantId",
      client_name as "clientName",
      contact_name as "contactName",
      email,
      phone,
      source,
      urgency,
      site_address as "siteAddress",
      request_summary as "requestSummary",
      notes,
      status,
      linked_customer_id as "linkedCustomerId",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM app.enquiries
    WHERE tenant_id = $1::uuid AND id = $2::uuid
    LIMIT 1
  `, [tenantId, enquiryId]);
  return result.rows[0] ?? null;
}

export async function createEnquiryForTenant(tenantId: string, input: {
  clientName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  urgency?: string | null;
  siteAddress?: string | null;
  requestSummary: string;
  notes?: string | null;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(`
    INSERT INTO app.enquiries (
      tenant_id, client_name, contact_name, email, phone, source, urgency, site_address, request_summary, notes, status, linked_customer_id, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::varchar,$3::varchar,$4::varchar,$5::varchar,$6::varchar,$7::varchar,$8::text,$9::text,$10::text,'new',null,now(),now()
    ) RETURNING id
  `, [
    tenantId,
    input.clientName,
    input.contactName ?? null,
    input.email ?? null,
    input.phone ?? null,
    input.source ?? null,
    input.urgency ?? null,
    input.siteAddress ?? null,
    input.requestSummary,
    input.notes ?? null
  ]);
  return result.rows[0];
}

export async function updateEnquiryStatusForTenant(tenantId: string, enquiryId: string, status: string): Promise<void> {
  await pool.query(`
    UPDATE app.enquiries
    SET status = $3::varchar,
        updated_at = now()
    WHERE tenant_id = $1::uuid
      AND id = $2::uuid
  `, [tenantId, enquiryId, status]);
}
