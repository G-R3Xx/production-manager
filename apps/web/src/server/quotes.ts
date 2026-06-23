import "server-only";

import { randomBytes } from "crypto";
import { pool } from "@production-manager/db";

export type QuoteDraftRecord = {
  id: string;
  tenantId: string;
  enquiryId: string | null;
  surveyRequestId: string | null;
  linkedCustomerId: string | null;
  quoteNumber: string | null;
  publicToken: string | null;
  clientName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  discountPercent: string;
  notes: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  changesRequestedAt: string | null;
  clientResponseNotes: string | null;
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

export type ArtworkApprovalRecord = {
  id: string;
  tenantId: string;
  quoteId: string;
  publicToken: string | null;
  clientName: string;
  contactName: string | null;
  email: string | null;
  status: string;
  clientResponseNotes: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  approvedAt: string | null;
  changesRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtworkApprovalPageRecord = {
  id: string;
  approvalId: string;
  title: string;
  imageUrl: string;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
};

function makePublicToken(): string {
  return randomBytes(24).toString("hex");
}

function normaliseMoney(value: string | null | undefined, fallback = "0"): string {
  const cleaned = String(value ?? "").replace(/[$,]/g, "").trim();
  if (!cleaned) return fallback;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? String(parsed) : fallback;
}

async function ensureQuoteLifecycleColumns(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  await pool.query(`
    ALTER TABLE sales.quote_drafts
      ADD COLUMN IF NOT EXISTS quote_number varchar(50),
      ADD COLUMN IF NOT EXISTS public_token varchar(96),
      ADD COLUMN IF NOT EXISTS sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
      ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
      ADD COLUMN IF NOT EXISTS declined_at timestamptz,
      ADD COLUMN IF NOT EXISTS changes_requested_at timestamptz,
      ADD COLUMN IF NOT EXISTS client_response_notes text
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS quote_drafts_public_token_unique_idx
      ON sales.quote_drafts (public_token)
      WHERE public_token IS NOT NULL
  `);
}

async function ensureArtworkApprovalTables(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales.artwork_approvals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
      quote_id uuid NOT NULL REFERENCES sales.quote_drafts(id) ON DELETE CASCADE,
      public_token varchar(96),
      client_name varchar(255) NOT NULL,
      contact_name varchar(255),
      email varchar(255),
      status varchar(50) NOT NULL DEFAULT 'draft',
      client_response_notes text,
      sent_at timestamptz,
      viewed_at timestamptz,
      approved_at timestamptz,
      changes_requested_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS artwork_approvals_public_token_unique_idx
      ON sales.artwork_approvals (public_token)
      WHERE public_token IS NOT NULL
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS artwork_approvals_quote_unique_idx
      ON sales.artwork_approvals (quote_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales.artwork_approval_pages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      approval_id uuid NOT NULL REFERENCES sales.artwork_approvals(id) ON DELETE CASCADE,
      title varchar(255) NOT NULL,
      image_url text NOT NULL,
      notes text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS artwork_approval_pages_approval_sort_idx
      ON sales.artwork_approval_pages (approval_id, sort_order, created_at)
  `);
}

function quoteSelectSql(): string {
  return `
      id,
      tenant_id as "tenantId",
      enquiry_id as "enquiryId",
      survey_request_id as "surveyRequestId",
      linked_customer_id as "linkedCustomerId",
      quote_number as "quoteNumber",
      public_token as "publicToken",
      client_name as "clientName",
      contact_name as "contactName",
      email,
      phone,
      status,
      discount_percent::text as "discountPercent",
      notes,
      sent_at as "sentAt",
      viewed_at as "viewedAt",
      accepted_at as "acceptedAt",
      declined_at as "declinedAt",
      changes_requested_at as "changesRequestedAt",
      client_response_notes as "clientResponseNotes",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;
}

export async function listQuoteDraftsForTenant(tenantId: string): Promise<QuoteDraftRecord[]> {
  await ensureQuoteLifecycleColumns();
  const result = await pool.query<QuoteDraftRecord>(`
    SELECT ${quoteSelectSql()}
    FROM sales.quote_drafts
    WHERE tenant_id = $1::uuid
    ORDER BY created_at DESC
  `,[tenantId]);
  return result.rows;
}

export async function getQuoteDraftById(tenantId: string, quoteId: string): Promise<QuoteDraftRecord | null> {
  await ensureQuoteLifecycleColumns();
  const result = await pool.query<QuoteDraftRecord>(`
    SELECT ${quoteSelectSql()}
    FROM sales.quote_drafts
    WHERE tenant_id = $1::uuid AND id = $2::uuid
    LIMIT 1
  `,[tenantId, quoteId]);
  return result.rows[0] ?? null;
}

export async function getQuoteDraftByPublicToken(token: string): Promise<QuoteDraftRecord | null> {
  await ensureQuoteLifecycleColumns();
  const result = await pool.query<QuoteDraftRecord>(`
    SELECT ${quoteSelectSql()}
    FROM sales.quote_drafts
    WHERE public_token = $1
    LIMIT 1
  `,[token]);
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
  await ensureQuoteLifecycleColumns();
  const token = makePublicToken();
  const result = await pool.query<{ id: string }>(`
    INSERT INTO sales.quote_drafts (
      tenant_id, enquiry_id, survey_request_id, linked_customer_id, quote_number, public_token, client_name, contact_name, email, phone, status, discount_percent, notes, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,('Q-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))),$5,$6::varchar,$7::varchar,$8::varchar,$9::varchar,'draft',$10::numeric,$11::text,now(),now()
    ) RETURNING id
  `, [
    tenantId,
    input.enquiryId ?? null,
    input.surveyRequestId ?? null,
    input.linkedCustomerId ?? null,
    token,
    input.clientName,
    input.contactName ?? null,
    input.email ?? null,
    input.phone ?? null,
    normaliseMoney(input.discountPercent, "0"),
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
  `, [quoteId, input.productId ?? null, input.productName, input.optionSummary ?? null, normaliseMoney(input.quantity, "1"), normaliseMoney(input.unitPrice, "0"), input.notes ?? null]);
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

export async function markQuoteSentForTenant(tenantId: string, quoteId: string): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await pool.query(`
    UPDATE sales.quote_drafts
    SET status = 'sent',
        public_token = COALESCE(public_token, $3),
        quote_number = COALESCE(quote_number, 'Q-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 5))),
        sent_at = COALESCE(sent_at, now()),
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, quoteId, makePublicToken()]);
}

export async function markQuoteViewedByToken(token: string): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await pool.query(`
    UPDATE sales.quote_drafts
    SET viewed_at = COALESCE(viewed_at, now()),
        status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
        updated_at = now()
    WHERE public_token = $1
  `, [token]);
}

export async function respondToQuoteByToken(token: string, response: "accepted" | "changes_requested" | "declined", notes: string | null): Promise<void> {
  await ensureQuoteLifecycleColumns();
  const timestampColumn = response === "accepted" ? "accepted_at" : response === "declined" ? "declined_at" : "changes_requested_at";
  await pool.query(`
    UPDATE sales.quote_drafts
    SET status = $2,
        ${timestampColumn} = now(),
        client_response_notes = $3,
        updated_at = now()
    WHERE public_token = $1
  `, [token, response, notes]);
}

export async function createArtworkApprovalFromQuote(tenantId: string, quoteId: string): Promise<{ id: string }> {
  await ensureArtworkApprovalTables();
  const quote = await getQuoteDraftById(tenantId, quoteId);
  if (!quote) {
    throw new Error("Quote not found");
  }

  const existing = await getArtworkApprovalForQuote(tenantId, quoteId);
  if (existing) {
    return { id: existing.id };
  }

  const result = await pool.query<{ id: string }>(`
    INSERT INTO sales.artwork_approvals (
      tenant_id, quote_id, public_token, client_name, contact_name, email, status, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::uuid,$3,$4,$5,$6,'draft',now(),now()
    ) RETURNING id
  `, [tenantId, quoteId, makePublicToken(), quote.clientName, quote.contactName, quote.email]);

  return result.rows[0];
}

export async function getArtworkApprovalForQuote(tenantId: string, quoteId: string): Promise<ArtworkApprovalRecord | null> {
  await ensureArtworkApprovalTables();
  const result = await pool.query<ArtworkApprovalRecord>(`
    SELECT
      id,
      tenant_id as "tenantId",
      quote_id as "quoteId",
      public_token as "publicToken",
      client_name as "clientName",
      contact_name as "contactName",
      email,
      status,
      client_response_notes as "clientResponseNotes",
      sent_at as "sentAt",
      viewed_at as "viewedAt",
      approved_at as "approvedAt",
      changes_requested_at as "changesRequestedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM sales.artwork_approvals
    WHERE tenant_id = $1::uuid AND quote_id = $2::uuid
    LIMIT 1
  `, [tenantId, quoteId]);
  return result.rows[0] ?? null;
}

export async function getArtworkApprovalByPublicToken(token: string): Promise<ArtworkApprovalRecord | null> {
  await ensureArtworkApprovalTables();
  const result = await pool.query<ArtworkApprovalRecord>(`
    SELECT
      id,
      tenant_id as "tenantId",
      quote_id as "quoteId",
      public_token as "publicToken",
      client_name as "clientName",
      contact_name as "contactName",
      email,
      status,
      client_response_notes as "clientResponseNotes",
      sent_at as "sentAt",
      viewed_at as "viewedAt",
      approved_at as "approvedAt",
      changes_requested_at as "changesRequestedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM sales.artwork_approvals
    WHERE public_token = $1
    LIMIT 1
  `, [token]);
  return result.rows[0] ?? null;
}

export async function listArtworkApprovalPages(approvalId: string): Promise<ArtworkApprovalPageRecord[]> {
  await ensureArtworkApprovalTables();
  const result = await pool.query<ArtworkApprovalPageRecord>(`
    SELECT
      id,
      approval_id as "approvalId",
      title,
      image_url as "imageUrl",
      notes,
      sort_order as "sortOrder",
      created_at as "createdAt"
    FROM sales.artwork_approval_pages
    WHERE approval_id = $1::uuid
    ORDER BY sort_order ASC, created_at ASC
  `, [approvalId]);
  return result.rows;
}

export async function addArtworkApprovalPageForTenant(tenantId: string, approvalId: string, input: {
  title: string;
  imageUrl: string;
  notes?: string | null;
}): Promise<void> {
  await ensureArtworkApprovalTables();
  await pool.query(`
    INSERT INTO sales.artwork_approval_pages (approval_id, title, image_url, notes, sort_order, created_at, updated_at)
    SELECT aa.id, $3, $4, $5, COALESCE((SELECT max(sort_order) + 1 FROM sales.artwork_approval_pages WHERE approval_id = aa.id), 1), now(), now()
    FROM sales.artwork_approvals aa
    WHERE aa.tenant_id = $1::uuid AND aa.id = $2::uuid
  `, [tenantId, approvalId, input.title, input.imageUrl, input.notes ?? null]);
}

export async function removeArtworkApprovalPageForTenant(tenantId: string, approvalId: string, pageId: string): Promise<void> {
  await ensureArtworkApprovalTables();
  await pool.query(`
    DELETE FROM sales.artwork_approval_pages p
    USING sales.artwork_approvals aa
    WHERE p.approval_id = aa.id
      AND aa.tenant_id = $1::uuid
      AND p.approval_id = $2::uuid
      AND p.id = $3::uuid
  `, [tenantId, approvalId, pageId]);
}

export async function markArtworkApprovalSentForTenant(tenantId: string, approvalId: string): Promise<void> {
  await ensureArtworkApprovalTables();
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET status = 'sent',
        public_token = COALESCE(public_token, $3),
        sent_at = COALESCE(sent_at, now()),
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, approvalId, makePublicToken()]);
}

export async function markArtworkApprovalViewedByToken(token: string): Promise<void> {
  await ensureArtworkApprovalTables();
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET viewed_at = COALESCE(viewed_at, now()),
        status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
        updated_at = now()
    WHERE public_token = $1
  `, [token]);
}

export async function respondToArtworkApprovalByToken(token: string, response: "approved" | "changes_requested", notes: string | null): Promise<void> {
  await ensureArtworkApprovalTables();
  const timestampColumn = response === "approved" ? "approved_at" : "changes_requested_at";
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET status = $2,
        ${timestampColumn} = now(),
        client_response_notes = $3,
        updated_at = now()
    WHERE public_token = $1
  `, [token, response, notes]);
}
