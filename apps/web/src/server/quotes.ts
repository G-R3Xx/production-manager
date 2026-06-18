
import "server-only";

import { pool } from "@production-manager/db";

export type QuoteDraftRecord = {
  id: string;
  tenantId: string;
  enquiryId: string | null;
  surveyRequestId: string | null;
  linkedCustomerId: string | null;
  clientName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  discountPercent: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuoteLineRecord = {
  id: string;
  quoteId: string;
  productId: string | null;
  productName: string;
  optionSummary: string | null;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  notes: string | null;
  createdAt: string;
};

export async function listQuoteDraftsForTenant(tenantId: string): Promise<QuoteDraftRecord[]> {
  const result = await pool.query<QuoteDraftRecord>(`
    SELECT
      id,
      tenant_id as "tenantId",
      enquiry_id as "enquiryId",
      survey_request_id as "surveyRequestId",
      linked_customer_id as "linkedCustomerId",
      client_name as "clientName",
      contact_name as "contactName",
      email,
      phone,
      status,
      discount_percent::text as "discountPercent",
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM sales.quote_drafts
    WHERE tenant_id = $1::uuid
    ORDER BY created_at DESC
  `,[tenantId]);
  return result.rows;
}

export async function getQuoteDraftById(tenantId: string, quoteId: string): Promise<QuoteDraftRecord | null> {
  const result = await pool.query<QuoteDraftRecord>(`
    SELECT
      id,
      tenant_id as "tenantId",
      enquiry_id as "enquiryId",
      survey_request_id as "surveyRequestId",
      linked_customer_id as "linkedCustomerId",
      client_name as "clientName",
      contact_name as "contactName",
      email,
      phone,
      status,
      discount_percent::text as "discountPercent",
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM sales.quote_drafts
    WHERE tenant_id = $1::uuid AND id = $2::uuid
    LIMIT 1
  `,[tenantId, quoteId]);
  return result.rows[0] ?? null;
}

export async function listQuoteLines(quoteId: string): Promise<QuoteLineRecord[]> {
  const result = await pool.query<QuoteLineRecord>(`
    SELECT
      id,
      quote_id as "quoteId",
      product_id as "productId",
      product_name as "productName",
      option_summary as "optionSummary",
      quantity::text as quantity,
      unit_price::text as "unitPrice",
      line_total::text as "lineTotal",
      notes,
      created_at as "createdAt"
    FROM sales.quote_lines
    WHERE quote_id = $1::uuid
    ORDER BY created_at ASC
  `,[quoteId]);
  return result.rows;
}

export async function createQuoteDraftForTenant(tenantId: string, input: {
  enquiryId?: string | null;
  surveyRequestId?: string | null;
  linkedCustomerId?: string | null;
  clientName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  discountPercent?: string | null;
  notes?: string | null;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(`
    INSERT INTO sales.quote_drafts (
      tenant_id, enquiry_id, survey_request_id, linked_customer_id, client_name, contact_name, email, phone, status, discount_percent, notes, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::varchar,$6::varchar,$7::varchar,$8::varchar,'draft',$9::numeric,$10::text,now(),now()
    ) RETURNING id
  `, [
    tenantId,
    input.enquiryId ?? null,
    input.surveyRequestId ?? null,
    input.linkedCustomerId ?? null,
    input.clientName,
    input.contactName ?? null,
    input.email ?? null,
    input.phone ?? null,
    input.discountPercent ?? "0",
    input.notes ?? null
  ]);
  return result.rows[0];
}

export async function addQuoteLine(quoteId: string, input: {
  productId?: string | null;
  productName: string;
  optionSummary?: string | null;
  quantity: string;
  unitPrice: string;
  notes?: string | null;
}): Promise<void> {
  await pool.query(`
    INSERT INTO sales.quote_lines (
      quote_id, product_id, product_name, option_summary, quantity, unit_price, line_total, notes, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::uuid,$3::varchar,$4::text,$5::numeric,$6::numeric,($5::numeric * $6::numeric),$7::text,now(),now()
    )
  `, [quoteId, input.productId ?? null, input.productName, input.optionSummary ?? null, input.quantity, input.unitPrice, input.notes ?? null]);
}


export async function deleteQuoteLineForTenant(tenantId: string, quoteId: string, lineId: string): Promise<void> {
  await pool.query(`
    DELETE FROM sales.quote_lines ql
    USING sales.quote_drafts qd
    WHERE ql.quote_id = qd.id
      AND qd.tenant_id = $1::uuid
      AND ql.quote_id = $2::uuid
      AND ql.id = $3::uuid
  `, [tenantId, quoteId, lineId]);
}
