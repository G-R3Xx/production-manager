
import "server-only";

import { pool } from "@production-manager/db";


export type EnquiryCorrespondenceRecord = {
  id: string;
  tenantId: string;
  enquiryId: string;
  fileName: string;
  fileUrl: string;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  previewKind: string | null;
  emailSubject: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  emailDate: string | null;
  bodyPreview: string | null;
  createdAt: string;
};

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

export async function listEnquiriesForTenant(tenantId: string, options?: { includeDeleted?: boolean }): Promise<EnquiryRecord[]> {
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
      AND ($2::boolean OR status <> 'deleted')
    ORDER BY created_at DESC
  `, [tenantId, Boolean(options?.includeDeleted)]);
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
  linkedCustomerId?: string | null;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(`
    INSERT INTO app.enquiries (
      tenant_id, client_name, contact_name, email, phone, source, urgency, site_address, request_summary, notes, status, linked_customer_id, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::varchar,$3::varchar,$4::varchar,$5::varchar,$6::varchar,$7::varchar,$8::text,$9::text,$10::text,'new',$11::uuid,now(),now()
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
    input.notes ?? null,
    input.linkedCustomerId ?? null
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


export async function ensureEnquiryCorrespondenceTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app.enquiry_correspondence (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
      enquiry_id uuid NOT NULL REFERENCES app.enquiries(id) ON DELETE CASCADE,
      file_name text NOT NULL,
      file_url text NOT NULL,
      storage_path text,
      mime_type text,
      size_bytes bigint,
      uploaded_by text,
      preview_kind text,
      email_subject text,
      email_from text,
      email_to text,
      email_date text,
      body_preview text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS enquiry_correspondence_enquiry_created_idx
      ON app.enquiry_correspondence (enquiry_id, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS enquiry_correspondence_tenant_created_idx
      ON app.enquiry_correspondence (tenant_id, created_at DESC)
  `);

  await pool.query(`
    ALTER TABLE app.enquiry_correspondence
      ADD COLUMN IF NOT EXISTS preview_kind text,
      ADD COLUMN IF NOT EXISTS email_subject text,
      ADD COLUMN IF NOT EXISTS email_from text,
      ADD COLUMN IF NOT EXISTS email_to text,
      ADD COLUMN IF NOT EXISTS email_date text,
      ADD COLUMN IF NOT EXISTS body_preview text
  `);
}

export async function listEnquiryCorrespondenceForTenant(tenantId: string): Promise<EnquiryCorrespondenceRecord[]> {
  await ensureEnquiryCorrespondenceTable();
  const result = await pool.query<EnquiryCorrespondenceRecord>(`
    SELECT
      id,
      tenant_id as "tenantId",
      enquiry_id as "enquiryId",
      file_name as "fileName",
      file_url as "fileUrl",
      storage_path as "storagePath",
      mime_type as "mimeType",
      CASE WHEN size_bytes IS NULL THEN NULL ELSE size_bytes::bigint END as "sizeBytes",
      uploaded_by as "uploadedBy",
      preview_kind as "previewKind",
      email_subject as "emailSubject",
      email_from as "emailFrom",
      email_to as "emailTo",
      email_date as "emailDate",
      body_preview as "bodyPreview",
      created_at as "createdAt"
    FROM app.enquiry_correspondence
    WHERE tenant_id = $1::uuid
    ORDER BY created_at DESC
  `, [tenantId]);
  return result.rows.map((row) => ({
    ...row,
    sizeBytes: row.sizeBytes == null ? null : Number(row.sizeBytes)
  }));
}

export async function createEnquiryCorrespondenceForTenant(tenantId: string, input: {
  enquiryId: string;
  fileName: string;
  fileUrl: string;
  storagePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  uploadedBy?: string | null;
  previewKind?: string | null;
  emailSubject?: string | null;
  emailFrom?: string | null;
  emailTo?: string | null;
  emailDate?: string | null;
  bodyPreview?: string | null;
}): Promise<{ id: string }> {
  await ensureEnquiryCorrespondenceTable();
  const result = await pool.query<{ id: string }>(`
    INSERT INTO app.enquiry_correspondence (
      tenant_id, enquiry_id, file_name, file_url, storage_path, mime_type, size_bytes, uploaded_by,
      preview_kind, email_subject, email_from, email_to, email_date, body_preview, created_at
    ) VALUES (
      $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::bigint, $8::text,
      $9::text, $10::text, $11::text, $12::text, $13::text, $14::text, now()
    ) RETURNING id
  `, [
    tenantId,
    input.enquiryId,
    input.fileName,
    input.fileUrl,
    input.storagePath ?? null,
    input.mimeType ?? null,
    input.sizeBytes ?? null,
    input.uploadedBy ?? null,
    input.previewKind ?? null,
    input.emailSubject ?? null,
    input.emailFrom ?? null,
    input.emailTo ?? null,
    input.emailDate ?? null,
    input.bodyPreview ?? null
  ]);
  return result.rows[0];
}
