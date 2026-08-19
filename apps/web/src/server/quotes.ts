import "server-only";

import { randomBytes } from "crypto";
import { after } from "next/server";
import { pool } from "@production-manager/db";
import { createProductionJobFromArtworkApprovalForTenant } from "@/server/production";
import { createNotificationForTenant } from "@/server/notifications";

export type QuoteDraftRecord = {
  id: string;
  tenantId: string;
  enquiryId: string | null;
  surveyRequestId: string | null;
  linkedCustomerId: string | null;
  clientPurchaseOrderNumber: string | null;
  quoteNumber: string | null;
  publicToken: string | null;
  jobName: string | null;
  clientName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  discountPercent: string;
  notes: string | null;
  sentAt: string | null;
  emailStatus: string;
  emailTo: string | null;
  emailSentAt: string | null;
  emailMessageId: string | null;
  emailLastError: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  changesRequestedAt: string | null;
  clientResponseNotes: string | null;
  myobOrderUid: string | null;
  myobOrderNumber: string | null;
  myobOrderStatus: string | null;
  myobOrderSyncedAt: string | null;
  myobOrderSyncError: string | null;
  myobOrderPayloadJson: Record<string, unknown>;
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
  configurationSnapshot: Record<string, unknown>;
  clientResponseStatus: "pending" | "approved" | "changes_requested" | "cancelled" | string;
  clientResponseNotes: string | null;
  clientRespondedAt: string | null;
  clientRevisionExcluded: boolean;
  createdAt: string;
  updatedAt: string;
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
  projectName: string | null;
  siteAddress: string | null;
  drawingTitle: string | null;
  drawingNumber: string | null;
  revision: string | null;
  revisionNote: string | null;
  designerName: string | null;
  clientMessage: string | null;
  internalNotes: string | null;
  clientResponseNotes: string | null;
  clientSignatoryName: string | null;
  clientSignatureDataUrl: string | null;
  clientConfirmedAt: string | null;
  internallyApprovedAt: string | null;
  internallyApprovedBy: string | null;
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
  signCode: string | null;
  description: string | null;
  imageUrl: string;
  imageStoragePath: string | null;
  fileName: string | null;
  notes: string | null;
  productionType: string;
  quantity: string;
  colourSummary: string | null;
  sizeSummary: string | null;
  substrateSummary: string | null;
  installSummary: string | null;
  smallFormatSummary: string | null;
  sortOrder: number;
  sourceQuoteLineId: string | null;
  proofRevision: string | null;
  clientResponseStatus: "pending" | "approved" | "changes_requested";
  clientResponseNotes: string | null;
  clientRespondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function statusTimestamp(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export function quoteActivityFingerprint(
  quote: Pick<QuoteDraftRecord,
    "status" | "updatedAt" | "sentAt" | "emailStatus" | "emailSentAt" | "emailLastError" |
    "viewedAt" | "acceptedAt" | "declinedAt" | "changesRequestedAt" |
    "myobOrderStatus" | "myobOrderSyncedAt" | "myobOrderSyncError"
  >,
  lines: Array<Pick<QuoteLineRecord, "id" | "clientResponseStatus" | "clientRespondedAt" | "updatedAt">>,
): string {
  return JSON.stringify({
    status: quote.status,
    updatedAt: statusTimestamp(quote.updatedAt),
    sentAt: statusTimestamp(quote.sentAt),
    emailStatus: quote.emailStatus,
    emailSentAt: statusTimestamp(quote.emailSentAt),
    emailLastError: quote.emailLastError ?? "",
    viewedAt: statusTimestamp(quote.viewedAt),
    acceptedAt: statusTimestamp(quote.acceptedAt),
    declinedAt: statusTimestamp(quote.declinedAt),
    changesRequestedAt: statusTimestamp(quote.changesRequestedAt),
    myobOrderStatus: quote.myobOrderStatus ?? "",
    myobOrderSyncedAt: statusTimestamp(quote.myobOrderSyncedAt),
    myobOrderSyncError: quote.myobOrderSyncError ?? "",
    lines: lines.map((line) => [
      line.id,
      line.clientResponseStatus,
      statusTimestamp(line.clientRespondedAt),
      statusTimestamp(line.updatedAt),
    ]),
  });
}

export function artworkApprovalStatusFingerprint(
  approval: Pick<ArtworkApprovalRecord, "status" | "updatedAt" | "viewedAt" | "approvedAt" | "changesRequestedAt">,
  pages: Array<Pick<ArtworkApprovalPageRecord, "id" | "clientResponseStatus" | "clientRespondedAt" | "updatedAt">>
): string {
  return JSON.stringify({
    status: approval.status,
    updatedAt: statusTimestamp(approval.updatedAt),
    viewedAt: statusTimestamp(approval.viewedAt),
    approvedAt: statusTimestamp(approval.approvedAt),
    changesRequestedAt: statusTimestamp(approval.changesRequestedAt),
    pages: pages.map((page) => [
      page.id,
      page.clientResponseStatus,
      statusTimestamp(page.clientRespondedAt),
      statusTimestamp(page.updatedAt)
    ])
  });
}

export type ArtworkApprovalDetailsInput = {
  clientName: string;
  contactName?: string | null;
  email?: string | null;
  projectName?: string | null;
  siteAddress?: string | null;
  drawingTitle?: string | null;
  drawingNumber?: string | null;
  revision?: string | null;
  revisionNote?: string | null;
  designerName?: string | null;
  clientMessage?: string | null;
  internalNotes?: string | null;
};

export type ArtworkApprovalPageInput = {
  title: string;
  signCode?: string | null;
  description?: string | null;
  imageUrl: string;
  imageStoragePath?: string | null;
  fileName?: string | null;
  notes?: string | null;
  productionType?: string | null;
  quantity?: string | null;
  colourSummary?: string | null;
  sizeSummary?: string | null;
  substrateSummary?: string | null;
  installSummary?: string | null;
  smallFormatSummary?: string | null;
  sourceQuoteLineId?: string | null;
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

function nullableText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

let quoteLifecycleSchemaReady = false;
let quoteLifecycleSchemaPromise: Promise<void> | null = null;
let artworkApprovalSchemaReady = false;
let artworkApprovalSchemaPromise: Promise<void> | null = null;
let quoteLineClientResponseSchemaReady = false;
let quoteLineClientResponseSchemaPromise: Promise<void> | null = null;

async function ensureQuoteLifecycleColumns(): Promise<void> {
  if (!process.env.DATABASE_URL || quoteLifecycleSchemaReady) return;
  if (quoteLifecycleSchemaPromise) return quoteLifecycleSchemaPromise;

  quoteLifecycleSchemaPromise = (async () => {
  await pool.query(`
    ALTER TABLE sales.quote_drafts
      ADD COLUMN IF NOT EXISTS quote_number varchar(50),
      ADD COLUMN IF NOT EXISTS public_token varchar(96),
      ADD COLUMN IF NOT EXISTS job_name varchar(255),
      ADD COLUMN IF NOT EXISTS sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS email_status varchar(50) NOT NULL DEFAULT 'not_sent',
      ADD COLUMN IF NOT EXISTS email_to varchar(320),
      ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS email_message_id text,
      ADD COLUMN IF NOT EXISTS email_last_error text,
      ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
      ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
      ADD COLUMN IF NOT EXISTS declined_at timestamptz,
      ADD COLUMN IF NOT EXISTS changes_requested_at timestamptz,
      ADD COLUMN IF NOT EXISTS client_response_notes text,
      ADD COLUMN IF NOT EXISTS client_purchase_order_number varchar(120),
      ADD COLUMN IF NOT EXISTS myob_order_uid varchar(120),
      ADD COLUMN IF NOT EXISTS myob_order_number varchar(120),
      ADD COLUMN IF NOT EXISTS myob_order_status varchar(50) NOT NULL DEFAULT 'not_synced',
      ADD COLUMN IF NOT EXISTS myob_order_synced_at timestamptz,
      ADD COLUMN IF NOT EXISTS myob_order_sync_error text,
      ADD COLUMN IF NOT EXISTS myob_order_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS quote_drafts_public_token_unique_idx
      ON sales.quote_drafts (public_token)
      WHERE public_token IS NOT NULL
  `);
  quoteLifecycleSchemaReady = true;
  })().catch((error) => {
    quoteLifecycleSchemaPromise = null;
    throw error;
  });
  return quoteLifecycleSchemaPromise;
}

async function ensureQuoteLineConfigurationColumn(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await pool.query(`
    ALTER TABLE sales.quote_lines
      ADD COLUMN IF NOT EXISTS configuration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
  `);
}

async function ensureQuoteLineClientResponseColumns(): Promise<void> {
  if (!process.env.DATABASE_URL || quoteLineClientResponseSchemaReady) return;
  if (quoteLineClientResponseSchemaPromise) return quoteLineClientResponseSchemaPromise;

  quoteLineClientResponseSchemaPromise = (async () => {
  await pool.query(`
    ALTER TABLE sales.quote_lines
      ADD COLUMN IF NOT EXISTS client_response_status varchar(32) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS client_response_notes text,
      ADD COLUMN IF NOT EXISTS client_responded_at timestamptz,
      ADD COLUMN IF NOT EXISTS client_revision_excluded boolean NOT NULL DEFAULT false
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS quote_lines_client_response_idx
      ON sales.quote_lines (quote_id, client_response_status)
  `);
  quoteLineClientResponseSchemaReady = true;
  })().catch((error) => {
    quoteLineClientResponseSchemaPromise = null;
    throw error;
  });
  return quoteLineClientResponseSchemaPromise;
}

async function ensureArtworkApprovalTables(): Promise<void> {
  if (!process.env.DATABASE_URL || artworkApprovalSchemaReady) return;
  if (artworkApprovalSchemaPromise) return artworkApprovalSchemaPromise;

  artworkApprovalSchemaPromise = (async () => {
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
    ALTER TABLE sales.artwork_approvals
      ADD COLUMN IF NOT EXISTS project_name varchar(255),
      ADD COLUMN IF NOT EXISTS site_address text,
      ADD COLUMN IF NOT EXISTS drawing_title varchar(255),
      ADD COLUMN IF NOT EXISTS drawing_number varchar(80),
      ADD COLUMN IF NOT EXISTS revision varchar(40),
      ADD COLUMN IF NOT EXISTS revision_note text,
      ADD COLUMN IF NOT EXISTS designer_name varchar(255),
      ADD COLUMN IF NOT EXISTS client_message text,
      ADD COLUMN IF NOT EXISTS internal_notes text,
      ADD COLUMN IF NOT EXISTS client_signatory_name varchar(255),
      ADD COLUMN IF NOT EXISTS client_signature_data_url text,
      ADD COLUMN IF NOT EXISTS client_confirmed_at timestamptz,
      ADD COLUMN IF NOT EXISTS internally_approved_at timestamptz,
      ADD COLUMN IF NOT EXISTS internally_approved_by varchar(255),
      ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS artwork_approvals_public_token_unique_idx
      ON sales.artwork_approvals (public_token)
      WHERE public_token IS NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS artwork_approvals_quote_idx
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
    ALTER TABLE sales.artwork_approval_pages
      ADD COLUMN IF NOT EXISTS sign_code varchar(40),
      ADD COLUMN IF NOT EXISTS description text,
      ADD COLUMN IF NOT EXISTS image_storage_path text,
      ADD COLUMN IF NOT EXISTS file_name varchar(255),
      ADD COLUMN IF NOT EXISTS production_type varchar(50) NOT NULL DEFAULT 'signage',
      ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS colour_summary text,
      ADD COLUMN IF NOT EXISTS size_summary text,
      ADD COLUMN IF NOT EXISTS substrate_summary text,
      ADD COLUMN IF NOT EXISTS install_summary text,
      ADD COLUMN IF NOT EXISTS small_format_summary text,
      ADD COLUMN IF NOT EXISTS source_quote_line_id uuid,
      ADD COLUMN IF NOT EXISTS proof_revision varchar(40),
      ADD COLUMN IF NOT EXISTS client_response_status varchar(32) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS client_response_notes text,
      ADD COLUMN IF NOT EXISTS client_responded_at timestamptz,
      ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
  `);

  await pool.query(`
    UPDATE sales.artwork_approval_pages p
    SET proof_revision = aa.revision
    FROM sales.artwork_approvals aa
    WHERE p.approval_id = aa.id
      AND p.proof_revision IS NULL
      AND p.image_url NOT LIKE 'data:image/svg+xml%'
  `);

  // Existing approvals pre-date page-level decisions. Preserve their accepted
  // state by treating every existing page in an approved packet as approved.
  await pool.query(`
    UPDATE sales.artwork_approval_pages p
    SET client_response_status = 'approved',
        client_responded_at = COALESCE(p.client_responded_at, aa.approved_at, aa.updated_at)
    FROM sales.artwork_approvals aa
    WHERE p.approval_id = aa.id
      AND aa.status = 'approved'
      AND COALESCE(p.client_response_status, 'pending') = 'pending'
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS artwork_approval_pages_source_quote_line_idx
      ON sales.artwork_approval_pages (approval_id, source_quote_line_id)
      WHERE source_quote_line_id IS NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS artwork_approval_pages_approval_sort_idx
      ON sales.artwork_approval_pages (approval_id, sort_order, created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS artwork_approval_pages_client_response_idx
      ON sales.artwork_approval_pages (approval_id, client_response_status)
  `);
  artworkApprovalSchemaReady = true;
  })().catch((error) => {
    artworkApprovalSchemaPromise = null;
    throw error;
  });
  return artworkApprovalSchemaPromise;
}

function quoteSelectSql(): string {
  return `
      id,
      tenant_id as "tenantId",
      enquiry_id as "enquiryId",
      survey_request_id as "surveyRequestId",
      linked_customer_id as "linkedCustomerId",
      client_purchase_order_number as "clientPurchaseOrderNumber",
      quote_number as "quoteNumber",
      public_token as "publicToken",
      job_name as "jobName",
      client_name as "clientName",
      contact_name as "contactName",
      email,
      phone,
      status,
      discount_percent::text as "discountPercent",
      notes,
      sent_at as "sentAt",
      COALESCE(email_status, 'not_sent') as "emailStatus",
      email_to as "emailTo",
      email_sent_at as "emailSentAt",
      email_message_id as "emailMessageId",
      email_last_error as "emailLastError",
      viewed_at as "viewedAt",
      accepted_at as "acceptedAt",
      declined_at as "declinedAt",
      changes_requested_at as "changesRequestedAt",
      client_response_notes as "clientResponseNotes",
      myob_order_uid as "myobOrderUid",
      myob_order_number as "myobOrderNumber",
      myob_order_status as "myobOrderStatus",
      myob_order_synced_at as "myobOrderSyncedAt",
      myob_order_sync_error as "myobOrderSyncError",
      myob_order_payload_json as "myobOrderPayloadJson",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;
}

export async function listQuoteDraftsForTenant(tenantId: string, options?: { includeDeleted?: boolean; includeWebsiteOrders?: boolean }): Promise<QuoteDraftRecord[]> {
  await ensureQuoteLifecycleColumns();
  const result = await pool.query<QuoteDraftRecord>(`
    SELECT ${quoteSelectSql()}
    FROM sales.quote_drafts
    WHERE tenant_id = $1::uuid
      AND ($2::boolean OR status <> 'deleted')
      AND ($3::boolean OR COALESCE(notes,'') NOT LIKE 'WooCommerce order %')
    ORDER BY created_at DESC
  `,[tenantId, Boolean(options?.includeDeleted), Boolean(options?.includeWebsiteOrders)]);
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
      AND status <> 'deleted'
    LIMIT 1
  `,[token]);
  return result.rows[0] ?? null;
}


export async function listQuoteLineTotals(quoteIds: string[]): Promise<Map<string, number>> {
  await ensureQuoteLineClientResponseColumns();
  const uniqueIds = Array.from(new Set(quoteIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const result = await pool.query<{ quoteId: string; total: string }>(`
    SELECT
      quote_id as "quoteId",
      COALESCE(SUM(line_total), 0)::text as total
    FROM sales.quote_lines
    WHERE quote_id = ANY($1::uuid[])
      AND COALESCE(client_response_status, 'pending') <> 'cancelled'
    GROUP BY quote_id
  `, [uniqueIds]);

  return new Map(result.rows.map((row) => [row.quoteId, Number(row.total) || 0]));
}

export async function listQuoteLines(quoteId: string): Promise<QuoteLineRecord[]> {
  await ensureQuoteLineConfigurationColumn();
  await ensureQuoteLineClientResponseColumns();
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
      configuration_snapshot as "configurationSnapshot",
      COALESCE(client_response_status, 'pending') as "clientResponseStatus",
      client_response_notes as "clientResponseNotes",
      client_responded_at as "clientRespondedAt",
      COALESCE(client_revision_excluded, false) as "clientRevisionExcluded",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM sales.quote_lines
    WHERE quote_id = $1::uuid
    ORDER BY created_at ASC
  `,[quoteId]);
  const rowsById = new Map(result.rows.map((line) => [line.id, line]));
  const childrenByParent = new Map<string, QuoteLineRecord[]>();
  const linkedChildIds = new Set<string>();

  for (const line of result.rows) {
    const rawParentId = line.configurationSnapshot?.parentLineId;
    const parentId = typeof rawParentId === "string" ? rawParentId.trim() : "";
    if (!parentId || parentId === line.id || !rowsById.has(parentId)) continue;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(line);
    childrenByParent.set(parentId, children);
    linkedChildIds.add(line.id);
  }

  const ordered: QuoteLineRecord[] = [];
  const added = new Set<string>();
  for (const line of result.rows) {
    if (linkedChildIds.has(line.id)) continue;
    ordered.push(line);
    added.add(line.id);
    for (const child of childrenByParent.get(line.id) ?? []) {
      ordered.push(child);
      added.add(child.id);
    }
  }

  // Keep malformed/orphaned legacy rows visible rather than dropping them.
  for (const line of result.rows) {
    if (!added.has(line.id)) ordered.push(line);
  }
  return ordered;
}


export async function getQuoteDraftForSurveyRequest(tenantId: string, surveyRequestId: string): Promise<QuoteDraftRecord | null> {
  await ensureQuoteLifecycleColumns();
  const result = await pool.query<QuoteDraftRecord>(`
    SELECT ${quoteSelectSql()}
    FROM sales.quote_drafts
    WHERE tenant_id = $1::uuid
      AND survey_request_id = $2::uuid
      AND status <> 'deleted'
    ORDER BY created_at DESC
    LIMIT 1
  `, [tenantId, surveyRequestId]);
  return result.rows[0] ?? null;
}

export async function getQuoteDraftForEnquiry(tenantId: string, enquiryId: string): Promise<QuoteDraftRecord | null> {
  await ensureQuoteLifecycleColumns();
  const result = await pool.query<QuoteDraftRecord>(`
    SELECT ${quoteSelectSql()}
    FROM sales.quote_drafts
    WHERE tenant_id = $1::uuid
      AND enquiry_id = $2::uuid
      AND status <> 'deleted'
    ORDER BY created_at DESC
    LIMIT 1
  `, [tenantId, enquiryId]);
  return result.rows[0] ?? null;
}

export async function createQuoteDraftForTenant(tenantId: string, input: {
  enquiryId?: string | null;
  surveyRequestId?: string | null;
  linkedCustomerId?: string | null;
  clientPurchaseOrderNumber?: string | null;
  jobName?: string | null;
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
      tenant_id, enquiry_id, survey_request_id, linked_customer_id, client_purchase_order_number, quote_number, public_token, job_name, client_name, contact_name, email, phone, status, discount_percent, notes, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::varchar,('Q-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))),$6,$7::varchar,$8::varchar,$9::varchar,$10::varchar,$11::varchar,'draft',$12::numeric,$13::text,now(),now()
    ) RETURNING id
  `, [
    tenantId,
    input.enquiryId ?? null,
    input.surveyRequestId ?? null,
    input.linkedCustomerId ?? null,
    input.clientPurchaseOrderNumber ?? null,
    token,
    nullableText(input.jobName),
    input.clientName,
    input.contactName ?? null,
    input.email ?? null,
    input.phone ?? null,
    normaliseMoney(input.discountPercent, "0"),
    input.notes ?? null
  ]);
  if (input.enquiryId) {
    await pool.query(`
      UPDATE app.enquiries
      SET status = CASE WHEN status = 'deleted' THEN status ELSE 'quoted' END,
          updated_at = CASE WHEN status = 'deleted' THEN updated_at ELSE now() END
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
    `, [tenantId, input.enquiryId]);
  }
  return result.rows[0];
}

export async function updateQuoteLinkedCustomerForTenant(tenantId: string, quoteId: string, customerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quote = await client.query<{ enquiryId: string | null; surveyRequestId: string | null }>(`
      UPDATE sales.quote_drafts
      SET linked_customer_id = $3::uuid,
          updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid
      RETURNING enquiry_id as "enquiryId", survey_request_id as "surveyRequestId"
    `, [tenantId, quoteId, customerId]);
    if (!quote.rowCount) throw new Error("The quote could not be found.");
    const source = quote.rows[0];
    if (source?.enquiryId) {
      await client.query(`UPDATE app.enquiries SET linked_customer_id=$3::uuid,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, source.enquiryId, customerId]);
    }
    if (source?.surveyRequestId) {
      await client.query(`UPDATE app.survey_requests SET linked_customer_id=$3::uuid,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, source.surveyRequestId, customerId]);
    }
    await client.query(`UPDATE app.jobs SET linked_customer_id=$3::uuid,updated_at=now() WHERE tenant_id=$1::uuid AND quote_id=$2::uuid`, [tenantId, quoteId, customerId]);
    await client.query(`UPDATE production.production_jobs SET linked_customer_id=$3::uuid,updated_at=now() WHERE tenant_id=$1::uuid AND quote_id=$2::uuid`, [tenantId, quoteId, customerId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function addQuoteLine(quoteId: string, input: {
  productId?: string | null;
  productName: string;
  optionSummary?: string | null;
  quantity: string;
  unitPrice: string;
  notes?: string | null;
  configurationSnapshot?: Record<string, unknown> | null;
}): Promise<{ id: string }> {
  await ensureQuoteLineConfigurationColumn();
  const result = await pool.query<{ id: string }>(`
    INSERT INTO sales.quote_lines (
      quote_id, product_id, product_name, option_summary, quantity, unit_price, line_total, notes, configuration_snapshot, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::uuid,$3::varchar,$4::text,$5::numeric,$6::numeric,($5::numeric * $6::numeric),$7::text,$8::jsonb,now(),now()
    )
    RETURNING id
  `, [
    quoteId,
    input.productId ?? null,
    input.productName,
    input.optionSummary ?? null,
    normaliseMoney(input.quantity, "1"),
    normaliseMoney(input.unitPrice, "0"),
    input.notes ?? null,
    JSON.stringify(input.configurationSnapshot ?? {})
  ]);
  return result.rows[0];
}

export async function deleteQuoteLineForTenant(tenantId: string, quoteId: string, lineId: string): Promise<void> {
  await ensureQuoteLineConfigurationColumn();
  await pool.query(`
    DELETE FROM sales.quote_lines ql
    USING sales.quote_drafts qd
    WHERE ql.quote_id = qd.id
      AND qd.tenant_id = $1::uuid
      AND ql.quote_id = $2::uuid
      AND ql.id = $3::uuid
  `, [tenantId, quoteId, lineId]);
}

export async function updateQuoteLineForTenant(tenantId: string, quoteId: string, lineId: string, input: {
  productName: string;
  optionSummary?: string | null;
  quantity: string;
  unitPrice: string;
  notes?: string | null;
  configurationSnapshot?: Record<string, unknown> | null;
}): Promise<void> {
  await ensureQuoteLineConfigurationColumn();
  await ensureQuoteLineClientResponseColumns();
  await pool.query(`
    UPDATE sales.quote_lines ql
    SET product_name = $4::varchar,
        option_summary = $5::text,
        quantity = $6::numeric,
        unit_price = $7::numeric,
        line_total = ($6::numeric * $7::numeric),
        notes = $8::text,
        configuration_snapshot = COALESCE($9::jsonb, ql.configuration_snapshot),
        client_response_status = 'pending',
        client_response_notes = NULL,
        client_responded_at = NULL,
        client_revision_excluded = false,
        updated_at = now()
    FROM sales.quote_drafts qd
    WHERE ql.quote_id = qd.id
      AND qd.tenant_id = $1::uuid
      AND ql.quote_id = $2::uuid
      AND ql.id = $3::uuid
  `, [
    tenantId,
    quoteId,
    lineId,
    input.productName,
    input.optionSummary ?? null,
    normaliseMoney(input.quantity, "1"),
    normaliseMoney(input.unitPrice, "0"),
    input.notes ?? null,
    input.configurationSnapshot === undefined ? null : JSON.stringify(input.configurationSnapshot ?? {})
  ]);
}

export async function getQuoteLineForTenant(tenantId: string, quoteId: string, lineId: string): Promise<QuoteLineRecord | null> {
  await ensureQuoteLineConfigurationColumn();
  await ensureQuoteLineClientResponseColumns();
  const result = await pool.query<QuoteLineRecord>(`
    SELECT
      ql.id,
      ql.quote_id as "quoteId",
      ql.product_id as "productId",
      ql.product_name as "productName",
      ql.option_summary as "optionSummary",
      ql.quantity::text as quantity,
      ql.unit_price::text as "unitPrice",
      ql.line_total::text as "lineTotal",
      ql.notes,
      ql.configuration_snapshot as "configurationSnapshot",
      COALESCE(ql.client_response_status, 'pending') as "clientResponseStatus",
      ql.client_response_notes as "clientResponseNotes",
      ql.client_responded_at as "clientRespondedAt",
      COALESCE(ql.client_revision_excluded, false) as "clientRevisionExcluded",
      ql.created_at as "createdAt",
      ql.updated_at as "updatedAt"
    FROM sales.quote_lines ql
    JOIN sales.quote_drafts qd ON qd.id = ql.quote_id
    WHERE qd.tenant_id = $1::uuid
      AND ql.quote_id = $2::uuid
      AND ql.id = $3::uuid
    LIMIT 1
  `, [tenantId, quoteId, lineId]);
  return result.rows[0] ?? null;
}


export async function linkQuoteLineToProductForTenant(
  tenantId: string,
  quoteId: string,
  lineId: string,
  productId: string,
  productName: string
): Promise<void> {
  await ensureQuoteLineConfigurationColumn();
  await pool.query(`
    UPDATE sales.quote_lines ql
    SET
      product_id = $4::uuid,
      product_name = $5::varchar,
      updated_at = now()
    FROM sales.quote_drafts qd
    WHERE ql.quote_id = qd.id
      AND qd.tenant_id = $1::uuid
      AND ql.quote_id = $2::uuid
      AND ql.id = $3::uuid
  `, [tenantId, quoteId, lineId, productId, productName]);
}


export async function updateQuoteJobNameForTenant(tenantId: string, quoteId: string, jobName: string): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await pool.query(`
    UPDATE sales.quote_drafts
    SET job_name = $3::varchar,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, quoteId, nullableText(jobName)]);
}

export async function ensureQuotePublicIdentityForTenant(tenantId: string, quoteId: string): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await pool.query(`
    UPDATE sales.quote_drafts
    SET public_token = COALESCE(public_token, $3),
        quote_number = COALESCE(quote_number, 'Q-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 5))),
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, quoteId, makePublicToken()]);
}

export async function markQuoteSentForTenant(tenantId: string, quoteId: string): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await ensureQuoteLineClientResponseColumns();
  const previous = await pool.query<{ status: string }>(`
    SELECT status FROM sales.quote_drafts WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1
  `, [tenantId, quoteId]);
  if (previous.rows[0]?.status === "changes_requested") {
    // A resent revision keeps prior client cancellations out of the new client-facing scope.
    // Only lines that actually requested changes are reset for a fresh response cycle.
    await pool.query(`
      UPDATE sales.quote_lines
      SET client_revision_excluded = true, updated_at = now()
      WHERE quote_id = $1::uuid
        AND client_response_status = 'cancelled'
    `, [quoteId]);
    await pool.query(`
      UPDATE sales.quote_lines
      SET client_response_status = 'pending',
          client_response_notes = NULL,
          client_responded_at = NULL,
          client_revision_excluded = false,
          updated_at = now()
      WHERE quote_id = $1::uuid
        AND client_response_status = 'changes_requested'
    `, [quoteId]);
  }
  await pool.query(`
    UPDATE sales.quote_drafts
    SET status = 'sent',
        public_token = COALESCE(public_token, $3),
        quote_number = COALESCE(quote_number, 'Q-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 5))),
        sent_at = COALESCE(sent_at, now()),
        accepted_at = NULL,
        declined_at = NULL,
        changes_requested_at = NULL,
        myob_order_status = CASE WHEN myob_order_status = 'synced' THEN myob_order_status ELSE 'not_synced' END,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, quoteId, makePublicToken()]);
}

export async function markQuoteEmailPendingForTenant(tenantId: string, quoteId: string, recipient: string): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await pool.query(`
    UPDATE sales.quote_drafts
    SET email_status = 'pending',
        email_to = $3::varchar,
        email_last_error = NULL,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, quoteId, nullableText(recipient)]);
}

export async function markQuoteEmailSentForTenant(tenantId: string, quoteId: string, input: { recipient: string; messageId?: string | null }): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await pool.query(`
    UPDATE sales.quote_drafts
    SET email_status = 'sent',
        email_to = $3::varchar,
        email_sent_at = now(),
        email_message_id = $4::text,
        email_last_error = NULL,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, quoteId, nullableText(input.recipient), input.messageId ?? null]);
}

export async function markQuoteEmailFailedForTenant(tenantId: string, quoteId: string, input: { recipient?: string | null; error: string }): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await pool.query(`
    UPDATE sales.quote_drafts
    SET email_status = 'failed',
        email_to = COALESCE($3::varchar, email_to),
        email_last_error = $4::text,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, quoteId, nullableText(input.recipient), nullableText(input.error)]);
}

export async function setQuoteDraftStatusForTenant(tenantId: string, quoteId: string, status: string): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await pool.query(`
    UPDATE sales.quote_drafts
    SET status = $3::varchar,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, quoteId, status]);
}

export async function updateQuoteMyobOrderSyncForTenant(tenantId: string, quoteId: string, input: {
  status: "not_synced" | "ready_to_sync" | "syncing" | "synced" | "error";
  uid?: string | null;
  orderNumber?: string | null;
  error?: string | null;
  payloadJson?: Record<string, unknown>;
}): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await pool.query(`
    UPDATE sales.quote_drafts
    SET myob_order_status = $3::varchar,
        myob_order_uid = COALESCE($4::varchar, myob_order_uid),
        myob_order_number = COALESCE($5::varchar, myob_order_number),
        myob_order_sync_error = $6::text,
        myob_order_payload_json = COALESCE(myob_order_payload_json, '{}'::jsonb) || $7::jsonb,
        myob_order_synced_at = CASE WHEN $3::varchar = 'synced' THEN now() ELSE myob_order_synced_at END,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, quoteId, input.status, input.uid ?? null, input.orderNumber ?? null, input.error ?? null, JSON.stringify(input.payloadJson ?? {})]);
}

export async function markQuoteViewedByToken(token: string): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await pool.query(`
    UPDATE sales.quote_drafts
    SET viewed_at = COALESCE(viewed_at, now()),
        status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
        updated_at = now()
    WHERE public_token = $1
      AND (viewed_at IS NULL OR status = 'sent')
  `, [token]);
}

async function quoteDraftColumnExists(columnName: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const result = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'sales'
        AND table_name = 'quote_drafts'
        AND column_name = $1
    ) as exists
  `, [columnName]);
  return Boolean(result.rows[0]?.exists);
}

async function updateQuoteReadyForMyobByToken(token: string): Promise<void> {
  try {
    const hasMyobOrderStatus = await quoteDraftColumnExists("myob_order_status");
    if (!hasMyobOrderStatus) return;
    await pool.query(`
      UPDATE sales.quote_drafts
      SET myob_order_status = 'ready_to_sync',
          updated_at = now()
      WHERE public_token = $1
    `, [token]);
  } catch (error) {
    console.error("Quote acceptance saved, but MYOB ready status could not be updated", error);
  }
}

export async function respondToQuoteByToken(token: string, response: "accepted" | "changes_requested" | "declined", notes: string | null): Promise<void> {
  await ensureQuoteLifecycleColumns();
  await ensureQuoteLineClientResponseColumns();

  const timestampColumn = response === "accepted" ? "accepted_at" : response === "declined" ? "declined_at" : "changes_requested_at";

  const result = await pool.query<{ id: string }>(`
    UPDATE sales.quote_drafts
    SET status = $2::varchar,
        ${timestampColumn} = now(),
        client_response_notes = $3::text,
        updated_at = now()
    WHERE public_token = $1
    RETURNING id
  `, [token, response, notes]);

  if (!result.rowCount) {
    throw new Error("Quote response could not be saved because the public quote token was not found.");
  }

  if (response === "accepted" || response === "declined") {
    await pool.query(`
      UPDATE sales.quote_lines ql
      SET client_response_status = $2::varchar,
          client_response_notes = $3::text,
          client_responded_at = now(),
          updated_at = now()
      FROM sales.quote_drafts qd
      WHERE ql.quote_id = qd.id
        AND qd.public_token = $1
    `, [token, response === "accepted" ? "approved" : "cancelled", notes]);
  }

  if (response === "accepted") {
    await updateQuoteReadyForMyobByToken(token);
    await pool.query(`
      UPDATE app.enquiries e
      SET status = 'converted',
          updated_at = now()
      FROM sales.quote_drafts qd
      WHERE qd.public_token = $1
        AND qd.enquiry_id = e.id
        AND e.status <> 'deleted'
    `, [token]);
  }
}

export type QuoteLineClientResponse = "approved" | "changes_requested" | "cancelled";

export async function respondToQuoteLineByToken(
  token: string,
  lineId: string,
  response: QuoteLineClientResponse,
  notes: string | null,
  options?: { deferNotification?: boolean }
): Promise<{ quoteStatus: string; lineStatus: QuoteLineClientResponse; subtotal: number; gst: number; total: number }> {
  await ensureQuoteLifecycleColumns();
  await ensureQuoteLineClientResponseColumns();

  const client = await pool.connect();
  let tenantId = "";
  let quoteId = "";
  let quoteNumber = "Quote";
  let productName = "Quote line";
  let overallStatus = "viewed";
  let subtotal = 0;
  try {
    await client.query("BEGIN");
    const quoteResult = await client.query<{ id: string; tenantId: string; quoteNumber: string | null; status: string; enquiryId: string | null }>(`
      SELECT id::text, tenant_id::text as "tenantId", quote_number as "quoteNumber", status, enquiry_id::text as "enquiryId"
      FROM sales.quote_drafts
      WHERE public_token = $1 AND status <> 'deleted'
      FOR UPDATE
    `, [token]);
    const quote = quoteResult.rows[0];
    if (!quote) throw new Error("Quote not found.");
    tenantId = quote.tenantId;
    quoteId = quote.id;
    quoteNumber = quote.quoteNumber ?? "Quote";

    if (quote.status === "accepted" || quote.status === "declined") {
      throw new Error("This quote has already been finalised.");
    }

    const lineResult = await client.query<{ productName: string }>(`
      UPDATE sales.quote_lines
      SET client_response_status = $3::varchar,
          client_response_notes = $4::text,
          client_responded_at = now(),
          updated_at = now()
      WHERE quote_id = $1::uuid AND id = $2::uuid
        AND COALESCE(client_revision_excluded, false) = false
      RETURNING product_name as "productName"
    `, [quote.id, lineId, response, notes]);
    if (!lineResult.rowCount) throw new Error("Quote line not found.");
    productName = lineResult.rows[0]?.productName ?? productName;

    const summary = await client.query<{ total: string; approved: string; requested: string; cancelled: string; pending: string; subtotal: string }>(`
      SELECT
        count(*)::text as total,
        count(*) FILTER (WHERE client_response_status = 'approved')::text as approved,
        count(*) FILTER (WHERE client_response_status = 'changes_requested')::text as requested,
        count(*) FILTER (WHERE client_response_status = 'cancelled')::text as cancelled,
        count(*) FILTER (WHERE COALESCE(client_response_status, 'pending') = 'pending')::text as pending,
        COALESCE(SUM(CASE WHEN COALESCE(client_response_status, 'pending') <> 'cancelled' THEN line_total ELSE 0 END), 0)::text as subtotal
      FROM sales.quote_lines
      WHERE quote_id = $1::uuid
        AND COALESCE(client_revision_excluded, false) = false
    `, [quote.id]);
    const counts = summary.rows[0];
    const total = Number(counts?.total ?? 0);
    const approved = Number(counts?.approved ?? 0);
    const requested = Number(counts?.requested ?? 0);
    const cancelled = Number(counts?.cancelled ?? 0);
    const pending = Number(counts?.pending ?? 0);
    subtotal = Number(counts?.subtotal ?? 0);
    if (!Number.isFinite(subtotal)) subtotal = 0;

    if (requested > 0) overallStatus = "changes_requested";
    else if (total > 0 && pending === 0 && approved > 0 && approved + cancelled === total) overallStatus = "accepted";
    else if (total > 0 && cancelled === total) overallStatus = "declined";
    else overallStatus = "viewed";

    await client.query(`
      UPDATE sales.quote_drafts
      SET status = $2::varchar,
          accepted_at = CASE WHEN $2 = 'accepted' THEN COALESCE(accepted_at, now()) ELSE NULL END,
          declined_at = CASE WHEN $2 = 'declined' THEN COALESCE(declined_at, now()) ELSE NULL END,
          changes_requested_at = CASE WHEN $2 = 'changes_requested' THEN COALESCE(changes_requested_at, now()) ELSE NULL END,
          myob_order_status = CASE
            WHEN $2 = 'accepted' AND myob_order_status <> 'synced' THEN 'ready_to_sync'
            WHEN $2 <> 'accepted' AND myob_order_status IN ('not_synced','ready_to_sync','error') THEN 'not_synced'
            ELSE myob_order_status
          END,
          updated_at = now()
      WHERE id = $1::uuid
    `, [quote.id, overallStatus]);

    if (overallStatus === "accepted" && quote.enquiryId) {
      await client.query(`
        UPDATE app.enquiries
        SET status = 'converted',
            updated_at = now()
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
          AND status <> 'deleted'
      `, [quote.tenantId, quote.enquiryId]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const responseLabel = response === "approved" ? "approved" : response === "cancelled" ? "cancelled" : "requested changes to";
  const saveNotification = () => createNotificationForTenant(tenantId, {
    eventType: "quote_line_response",
    title: `Client ${responseLabel} a quote line`,
    message: `${quoteNumber}: ${productName}${notes ? ` — ${notes}` : ""}`,
    href: `/quotes?selected=${quoteId}&focusLine=${lineId}#quote-line-${lineId}`,
    payloadJson: { quoteId, lineId, response, notes }
  }).catch((error) => console.error("Quote line response saved, but notification failed", error));
  if (options?.deferNotification) after(saveNotification);
  else await saveNotification();

  const gst = subtotal * 0.1;
  return { quoteStatus: overallStatus, lineStatus: response, subtotal, gst, total: subtotal + gst };
}

export async function createArtworkApprovalForAcceptedQuoteToken(token: string): Promise<{ id: string } | null> {
  await ensureQuoteLifecycleColumns();
  await ensureArtworkApprovalTables();
  const quote = await getQuoteDraftByPublicToken(token);
  if (!quote) return null;
  return createArtworkApprovalFromQuote(quote.tenantId, quote.id);
}

export async function createArtworkApprovalFromQuote(tenantId: string, quoteId: string): Promise<{ id: string }> {
  await ensureArtworkApprovalTables();
  const quote = await getQuoteDraftById(tenantId, quoteId);
  if (!quote) {
    throw new Error("Quote not found");
  }

  const existing = await getArtworkApprovalForQuote(tenantId, quoteId);
  if (existing) {
    await prefillArtworkApprovalPagesFromQuoteLines(tenantId, existing.id);
    return { id: existing.id };
  }

  const result = await pool.query<{ id: string }>(`
    INSERT INTO sales.artwork_approvals (
      tenant_id,
      quote_id,
      public_token,
      client_name,
      contact_name,
      email,
      status,
      project_name,
      drawing_title,
      drawing_number,
      revision,
      revision_note,
      client_message,
      created_at,
      updated_at
    ) VALUES (
      $1::uuid,$2::uuid,$3,$4,$5,$6,'draft',$7,$8,$9,'A','Issued for approval',$10,now(),now()
    ) RETURNING id
  `, [
    tenantId,
    quoteId,
    makePublicToken(),
    quote.clientName,
    quote.contactName,
    quote.email,
    quote.jobName || (quote.notes ? quote.notes.slice(0, 255) : quote.clientName),
    quote.quoteNumber ? `Artwork proof for ${quote.quoteNumber}` : "Artwork proof",
    "S1",
    "Please review the proof pages below."
  ]);

  await prefillArtworkApprovalPagesFromQuoteLines(tenantId, result.rows[0].id);
  return result.rows[0];
}

function normaliseForSearch(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[_/\\-]+/g, " ").replace(/\s+/g, " ").trim();
}

type ArtworkQuoteLineKind = "signage" | "plan_printing" | "poster_printing" | "small_format";

function artworkQuoteLineKindFromSnapshot(snapshot: Record<string, unknown> | null | undefined): ArtworkQuoteLineKind | null | undefined {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const flowType = String(snapshot.flowType ?? "").trim().toLowerCase();
  if (flowType === "signage") return "signage";
  if (flowType === "small_format") return "small_format";
  if (flowType === "plan_printing") return "plan_printing";
  if (flowType === "poster_printing") return "poster_printing";
  if (flowType === "service") return null;
  // Custom components are production items and can still require an artwork / fabrication proof.
  if (flowType === "component") return "signage";
  return undefined;
}

export function artworkQuoteLineKind(line: Pick<QuoteLineRecord, "productName" | "optionSummary" | "notes" | "configurationSnapshot">): ArtworkQuoteLineKind | null {
  const snapshotKind = artworkQuoteLineKindFromSnapshot(line.configurationSnapshot);
  if (snapshotKind !== undefined) return snapshotKind;

  const product = normaliseForSearch(line.productName);
  const combined = normaliseForSearch([line.productName, line.optionSummary, line.notes].filter(Boolean).join(" · "));

  if (/\b(pickup|delivery|install|installation|freight|courier)\b/.test(product)) return null;
  if (/\b(pickup|delivery charge|client collects|installer|install hr|install\b|travel)\b/.test(combined)) return null;

  if (/\b(plan printing|plans?|drawing|drawings|cad|architectural|engineering|blueprint|a0|a1|a2|a3|a4)\b/.test(combined)) {
    return "plan_printing";
  }

  if (/\b(poster printing|poster|posters|photo print|photo prints|presentation print|display print|display prints)\b/.test(combined)) {
    return "poster_printing";
  }

  if (/\b(card|cards|business card|flyer|flyers|brochure|brochures|booklet|booklets|book\b|books\b|ncr|duplicate|triplicate|quadruplicate|carbon|gsm|cello|fold|folding|score|creasing|staple|saddle stitch|sequential numbering|padding|tape colour|cover:)\b/.test(combined)) {
    return "small_format";
  }

  if (/\b(acrylic|acm|aluminium composite|corflute|coreflute|pvc|foamboard|banner|vinyl|roll stock|laminate|jingwei|router|cnc|drill holes|eyelets|direct print|cut vinyl|clear reverse|reverse print|positive print|white ink|cmyk|signage|sign\b|panel\b)\b/.test(combined)) {
    return "signage";
  }

  // Legacy quote lines did not always persist a structured flowType or use one of the
  // keywords above. Once service-only lines have been excluded, keep the approved
  // production line in artwork scope rather than silently dropping it.
  return "signage";
}

function normalisedQuoteLineResponseStatus(line: Pick<QuoteLineRecord, "clientResponseStatus">): string {
  return String(line.clientResponseStatus ?? "pending").trim().toLowerCase() || "pending";
}

export function quoteUsesLineResponses(lines: Array<Pick<QuoteLineRecord, "clientResponseStatus">>): boolean {
  return lines.some((line) => normalisedQuoteLineResponseStatus(line) !== "pending");
}

export function artworkQuoteLineInScope(
  line: Pick<QuoteLineRecord, "productName" | "optionSummary" | "notes" | "configurationSnapshot" | "clientResponseStatus">,
  quoteStatus: string | null | undefined,
  usesLineResponses: boolean
): boolean {
  if (!artworkQuoteLineKind(line)) return false;

  const lineStatus = normalisedQuoteLineResponseStatus(line);
  if (lineStatus === "cancelled") return false;

  // An accepted quote is final accepted scope. This covers both whole-quote and
  // per-line acceptance, including older records where an accepted quote may
  // still contain a stale pending line status.
  if (String(quoteStatus ?? "").trim().toLowerCase() === "accepted") return true;

  if (usesLineResponses && lineStatus !== "approved") return false;
  return true;
}

function extractFirstMatch(source: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].trim();
    if (match?.[0]) return match[0].trim();
  }
  return null;
}

function optionParts(line: Pick<QuoteLineRecord, "optionSummary">): string[] {
  return String(line.optionSummary ?? "")
    .split(/\s+·\s+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normaliseArtworkSize(value: string | null | undefined): string | null {
  const source = String(value ?? "").replace(/[×*]/g, "x").replace(/\s+/g, " ").trim();
  const match = source.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(mm|m)?/i);
  if (!match) return null;
  const unit = match[3] ? match[3].toLowerCase() : "mm";
  return `${match[1]} × ${match[2]}${unit}`;
}

function isLikelyStockOrMaterialSize(value: string): boolean {
  const source = value.toLowerCase();
  const hasMaterialWord = /\b(material|substrate|stock|sheet|roll|media|acm|aluminium composite|acrylic|corflute|coreflute|pvc|foamboard|foamex|polycarbonate|vinyl|banner)\b/.test(source);
  const hasThickness = /\b\d+(?:\.\d+)?\s*mm\b/.test(source);
  return hasMaterialWord && hasThickness;
}

function extractFinishedSizeFromQuoteLine(line: QuoteLineRecord): string | null {
  const parts = optionParts(line);
  const labelled = parts.find((part) => /^(?:finished\s*)?size\s*:/i.test(part));
  const labelledSize = normaliseArtworkSize(labelled);
  if (labelledSize) return labelledSize;

  const standalone = parts.find((part) => /^\d+(?:\.\d+)?\s*[×x*]\s*\d+(?:\.\d+)?\s*(?:mm|m)?$/i.test(part));
  const standaloneSize = normaliseArtworkSize(standalone);
  if (standaloneSize) return standaloneSize;

  const nonStockPart = parts.find((part) => normaliseArtworkSize(part) && !isLikelyStockOrMaterialSize(part));
  return normaliseArtworkSize(nonStockPart);
}

function summaryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(mm|millimetres|millimeters)\b/g, "mm")
    .trim();
}

function tidyArtworkSummaryLine(value: string): string {
  return value
    .replace(/^([a-z0-9 ]{2,24})\s+-\s+(.+)$/i, (full, prefix, rest) => {
      const prefixKey = summaryKey(String(prefix));
      const restKey = summaryKey(String(rest));
      return restKey.includes(prefixKey) ? String(rest).trim() : full;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSpecificSummaryLines(lines: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const cleaned = lines
    .map((line) => tidyArtworkSummaryLine(String(line ?? "")))
    .filter(Boolean)
    .filter((line) => {
      const key = summaryKey(line);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return cleaned.filter((line, index, list) => {
    const key = summaryKey(line);
    if (!key) return false;
    return !list.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      const otherKey = summaryKey(other);
      return otherKey.length > key.length && otherKey.includes(key);
    });
  });
}

function titleCaseSignCode(index: number, kind: ArtworkQuoteLineKind): string {
  if (kind === "small_format") return `P${index}`;
  if (kind === "plan_printing") return `PL${index}`;
  if (kind === "poster_printing") return `PO${index}`;
  return `S${index}`;
}

function escapeSvg(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function placeholderArtworkImage(line: QuoteLineRecord, code: string): string {
  const title = `${code} - ${line.productName}`.slice(0, 92);
  const subtitle = "Upload proof artwork here";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="#ffffff"/><rect x="80" y="80" width="1440" height="840" rx="36" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4" stroke-dasharray="22 18"/><text x="800" y="450" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700" text-anchor="middle" fill="#334155">${escapeSvg(title)}</text><text x="800" y="535" font-family="Arial, Helvetica, sans-serif" font-size="34" text-anchor="middle" fill="#64748b">${subtitle}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildArtworkPageFromQuoteLine(line: QuoteLineRecord, index: number, kind: ArtworkQuoteLineKind): ArtworkApprovalPageInput {
  const parts = optionParts(line);
  const combined = [line.productName, line.optionSummary, line.notes].filter(Boolean).join(" · ");
  const size = extractFinishedSizeFromQuoteLine(line) ?? extractFirstMatch(combined, [/(\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*mm)/i, /(\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?)/i]);
  const code = titleCaseSignCode(index, kind);
  const qty = normaliseMoney(line.quantity, "1");

  const colourParts = uniqueSpecificSummaryLines(parts.filter((part) => /\b(cmyk|mono|white ink|white|pantone|colour|color|clear|reverse|positive)\b/i.test(part)));
  const explicitSubstrate = parts.find((part) => /^(?:substrate|stock|material)\s*:/i.test(part));
  const explicitSubstrateName = explicitSubstrate
    ? explicitSubstrate.replace(/^(?:substrate|stock|material)\s*:\s*/i, "").trim()
    : "";
  const materialParts = uniqueSpecificSummaryLines(parts.filter((part) =>
    /\b(acrylic|acm|corflute|coreflute|pvc|foamboard|banner|vinyl|sav|adhesive|air release|roll|stock|paper|gsm|satin|cello|sheet)\b/i.test(part)
    && !/\b(laminate|lamination|lam-|gloss laminate|matt laminate|matte laminate|coating)\b/i.test(part)
  ));
  const finishingParts = uniqueSpecificSummaryLines(parts.filter((part) => /\b(finishing|jingwei|router|cnc|drill|holes|eyelet|trim|cutting|fold|score|crease|staple|saddle|numbering|padding|tape|laminate|lamination|lam-|coating)\b/i.test(part)));
  const fallbackSubstrate = explicitSubstrateName || uniqueSpecificSummaryLines([line.productName, ...materialParts]).join("\n") || line.productName;

  return {
    title: line.productName || `${kind === "small_format" ? "Small format" : kind === "plan_printing" ? "Plan printing" : kind === "poster_printing" ? "Poster printing" : "Sign"} proof`,
    signCode: code,
    description: line.optionSummary || line.notes || null,
    imageUrl: placeholderArtworkImage(line, code),
    imageStoragePath: null,
    fileName: null,
    notes: "Auto-created from quote line. Replace this placeholder by uploading the final proof artwork.",
    productionType: kind,
    quantity: qty,
    colourSummary: colourParts.length ? colourParts.join("\n") : null,
    sizeSummary: size,
    substrateSummary: fallbackSubstrate || null,
    installSummary: kind === "signage" && finishingParts.length ? finishingParts.join("\n") : null,
    smallFormatSummary: kind !== "signage" ? parts.join("\n") : null,
    sourceQuoteLineId: line.id
  };
}

export async function countArtworkEligibleQuoteLines(quoteId: string): Promise<number> {
  const lines = await listQuoteLines(quoteId);
  return lines.filter((line) => artworkQuoteLineKind(line)).length;
}

export async function prefillArtworkApprovalPagesFromQuoteLines(tenantId: string, approvalId: string): Promise<{ created: number; updated: number; skipped: number; outOfScope: number; eligible: number; total: number; approved: number; cancelled: number; pending: number; quoteStatus: string; quoteNumber: string | null }> {
  await ensureArtworkApprovalTables();
  const approval = await getArtworkApprovalById(tenantId, approvalId);
  if (!approval) return { created: 0, updated: 0, skipped: 0, outOfScope: 0, eligible: 0, total: 0, approved: 0, cancelled: 0, pending: 0, quoteStatus: "", quoteNumber: null };

  const [lines, existingPages, quote] = await Promise.all([
    listQuoteLines(approval.quoteId),
    listArtworkApprovalPages(approval.id),
    getQuoteDraftById(tenantId, approval.quoteId)
  ]);
  const existingByLineId = new Map(existingPages.filter((page) => page.sourceQuoteLineId).map((page) => [page.sourceQuoteLineId as string, page]));
  const usesLineResponses = quoteUsesLineResponses(lines);
  const activeLineIds = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let nextIndex = existingPages.length + 1;

  for (const line of lines) {
    if (!artworkQuoteLineInScope(line, quote?.status, usesLineResponses)) {
      skipped += 1;
      continue;
    }
    const kind = artworkQuoteLineKind(line);
    if (!kind) {
      skipped += 1;
      continue;
    }

    activeLineIds.add(line.id);
    const pageInput = buildArtworkPageFromQuoteLine(line, nextIndex, kind);
    const existing = existingByLineId.get(line.id);
    if (!existing) {
      await addArtworkApprovalPageForTenant(tenantId, approval.id, pageInput);
      created += 1;
      nextIndex += 1;
      continue;
    }

    const existingIsPlaceholder = existing.imageUrl.startsWith("data:image/svg+xml")
      || (!existing.fileName && !existing.imageStoragePath && /auto-created from quote line/i.test(existing.notes ?? ""));

    await pool.query(`
      UPDATE sales.artwork_approval_pages p
      SET title = $4::varchar,
          sign_code = COALESCE(NULLIF(p.sign_code, ''), $5::varchar),
          description = $6::text,
          image_url = CASE WHEN $7::boolean THEN $8::text ELSE p.image_url END,
          notes = CASE WHEN $7::boolean THEN $9::text ELSE p.notes END,
          production_type = COALESCE(NULLIF($10::varchar, ''), 'signage'),
          quantity = NULLIF($11::text, '')::numeric,
          colour_summary = $12::text,
          size_summary = $13::text,
          substrate_summary = $14::text,
          install_summary = $15::text,
          small_format_summary = $16::text,
          proof_revision = CASE WHEN $7::boolean THEN aa.revision ELSE p.proof_revision END,
          updated_at = now()
      FROM sales.artwork_approvals aa
      WHERE p.approval_id = aa.id
        AND aa.tenant_id = $1::uuid
        AND p.approval_id = $2::uuid
        AND p.id = $3::uuid
    `, [
      tenantId,
      approval.id,
      existing.id,
      pageInput.title,
      pageInput.signCode ?? null,
      pageInput.description ?? null,
      existingIsPlaceholder,
      pageInput.imageUrl,
      pageInput.notes ?? null,
      pageInput.productionType ?? "signage",
      normaliseMoney(pageInput.quantity, "1"),
      nullableText(pageInput.colourSummary),
      nullableText(pageInput.sizeSummary),
      nullableText(pageInput.substrateSummary),
      nullableText(pageInput.installSummary),
      nullableText(pageInput.smallFormatSummary)
    ]);
    updated += 1;
  }

  const outOfScope = existingPages.filter((page) => page.sourceQuoteLineId && !activeLineIds.has(page.sourceQuoteLineId)).length;
  const statuses = lines.map((line) => normalisedQuoteLineResponseStatus(line));
  const approved = statuses.filter((status) => status === "approved").length;
  const cancelled = statuses.filter((status) => status === "cancelled").length;
  const pending = statuses.filter((status) => status === "pending").length;

  return {
    created,
    updated,
    skipped,
    outOfScope,
    eligible: activeLineIds.size,
    total: lines.length,
    approved,
    cancelled,
    pending,
    quoteStatus: quote?.status ?? "",
    quoteNumber: quote?.quoteNumber ?? null
  };
}

function artworkApprovalSelectSql(): string {
  return `
      id,
      tenant_id as "tenantId",
      quote_id as "quoteId",
      public_token as "publicToken",
      client_name as "clientName",
      contact_name as "contactName",
      email,
      status,
      project_name as "projectName",
      site_address as "siteAddress",
      drawing_title as "drawingTitle",
      drawing_number as "drawingNumber",
      revision,
      revision_note as "revisionNote",
      designer_name as "designerName",
      client_message as "clientMessage",
      internal_notes as "internalNotes",
      client_response_notes as "clientResponseNotes",
      client_signatory_name as "clientSignatoryName",
      client_signature_data_url as "clientSignatureDataUrl",
      client_confirmed_at as "clientConfirmedAt",
      internally_approved_at as "internallyApprovedAt",
      internally_approved_by as "internallyApprovedBy",
      sent_at as "sentAt",
      viewed_at as "viewedAt",
      approved_at as "approvedAt",
      changes_requested_at as "changesRequestedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;
}

export async function listArtworkApprovalsForTenant(tenantId: string, options?: { includeDeleted?: boolean }): Promise<ArtworkApprovalRecord[]> {
  const result = await pool.query<ArtworkApprovalRecord>(`
    SELECT ${artworkApprovalSelectSql()}
    FROM sales.artwork_approvals
    WHERE tenant_id = $1::uuid
      AND ($2::boolean OR status <> 'deleted')
    ORDER BY updated_at DESC, created_at DESC
  `, [tenantId, Boolean(options?.includeDeleted)]);
  return result.rows;
}

export async function getArtworkApprovalById(tenantId: string, approvalId: string): Promise<ArtworkApprovalRecord | null> {
  const result = await pool.query<ArtworkApprovalRecord>(`
    SELECT ${artworkApprovalSelectSql()}
    FROM sales.artwork_approvals
    WHERE tenant_id = $1::uuid AND id = $2::uuid
    LIMIT 1
  `, [tenantId, approvalId]);
  return result.rows[0] ?? null;
}

export async function getArtworkApprovalForQuote(tenantId: string, quoteId: string): Promise<ArtworkApprovalRecord | null> {
  const result = await pool.query<ArtworkApprovalRecord>(`
    SELECT ${artworkApprovalSelectSql()}
    FROM sales.artwork_approvals
    WHERE tenant_id = $1::uuid AND quote_id = $2::uuid
    LIMIT 1
  `, [tenantId, quoteId]);
  return result.rows[0] ?? null;
}

export async function getArtworkApprovalByPublicToken(token: string): Promise<ArtworkApprovalRecord | null> {
  const result = await pool.query<ArtworkApprovalRecord>(`
    SELECT ${artworkApprovalSelectSql()}
    FROM sales.artwork_approvals
    WHERE public_token = $1
      AND status <> 'deleted'
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
      sign_code as "signCode",
      description,
      image_url as "imageUrl",
      image_storage_path as "imageStoragePath",
      file_name as "fileName",
      notes,
      production_type as "productionType",
      quantity::text as quantity,
      colour_summary as "colourSummary",
      size_summary as "sizeSummary",
      substrate_summary as "substrateSummary",
      install_summary as "installSummary",
      small_format_summary as "smallFormatSummary",
      sort_order as "sortOrder",
      source_quote_line_id as "sourceQuoteLineId",
      proof_revision as "proofRevision",
      COALESCE(client_response_status, 'pending') as "clientResponseStatus",
      client_response_notes as "clientResponseNotes",
      client_responded_at as "clientRespondedAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM sales.artwork_approval_pages
    WHERE approval_id = $1::uuid
    ORDER BY sort_order ASC, created_at ASC
  `, [approvalId]);
  return result.rows;
}

export async function updateArtworkApprovalDetailsForTenant(tenantId: string, approvalId: string, input: ArtworkApprovalDetailsInput): Promise<void> {
  await ensureArtworkApprovalTables();
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET client_name = $3::varchar,
        contact_name = $4::varchar,
        email = $5::varchar,
        project_name = $6::varchar,
        site_address = $7::text,
        drawing_title = $8::varchar,
        drawing_number = $9::varchar,
        revision = $10::varchar,
        revision_note = $11::text,
        designer_name = $12::varchar,
        client_message = $13::text,
        internal_notes = $14::text,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [
    tenantId,
    approvalId,
    input.clientName,
    input.contactName ?? null,
    input.email ?? null,
    input.projectName ?? null,
    input.siteAddress ?? null,
    input.drawingTitle ?? null,
    input.drawingNumber ?? null,
    input.revision ?? null,
    input.revisionNote ?? null,
    input.designerName ?? null,
    input.clientMessage ?? null,
    input.internalNotes ?? null
  ]);
}

export async function addArtworkApprovalPageForTenant(tenantId: string, approvalId: string, input: ArtworkApprovalPageInput): Promise<void> {
  await ensureArtworkApprovalTables();
  await reopenArtworkApprovalForTenant(tenantId, approvalId, "A proof page was added after approval.");
  await pool.query(`
    INSERT INTO sales.artwork_approval_pages (
      approval_id,
      title,
      sign_code,
      description,
      image_url,
      image_storage_path,
      file_name,
      notes,
      production_type,
      quantity,
      colour_summary,
      size_summary,
      substrate_summary,
      install_summary,
      small_format_summary,
      source_quote_line_id,
      proof_revision,
      sort_order,
      created_at,
      updated_at
    )
    SELECT aa.id,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           COALESCE(NULLIF($10, ''), 'signage'),
           NULLIF($11, '')::numeric,
           $12,
           $13,
           $14,
           $15,
           $16,
           NULLIF($17::text, '')::uuid,
           aa.revision,
           COALESCE((SELECT max(sort_order) + 1 FROM sales.artwork_approval_pages WHERE approval_id = aa.id), 1),
           now(),
           now()
    FROM sales.artwork_approvals aa
    WHERE aa.tenant_id = $1::uuid AND aa.id = $2::uuid
  `, [
    tenantId,
    approvalId,
    input.title,
    input.signCode ?? null,
    input.description ?? null,
    input.imageUrl,
    input.imageStoragePath ?? null,
    input.fileName ?? null,
    input.notes ?? null,
    input.productionType ?? "signage",
    normaliseMoney(input.quantity, "1"),
    nullableText(input.colourSummary),
    nullableText(input.sizeSummary),
    nullableText(input.substrateSummary),
    nullableText(input.installSummary),
    nullableText(input.smallFormatSummary),
    input.sourceQuoteLineId ?? null
  ]);
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, approvalId]);
}

export async function removeArtworkApprovalPageForTenant(tenantId: string, approvalId: string, pageId: string): Promise<void> {
  await ensureArtworkApprovalTables();
  await reopenArtworkApprovalForTenant(tenantId, approvalId, "A proof page was removed after approval.");
  await pool.query(`
    DELETE FROM sales.artwork_approval_pages p
    USING sales.artwork_approvals aa
    WHERE p.approval_id = aa.id
      AND aa.tenant_id = $1::uuid
      AND p.approval_id = $2::uuid
      AND p.id = $3::uuid
  `, [tenantId, approvalId, pageId]);
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, approvalId]);
}

export async function replaceArtworkApprovalPageProofForTenant(tenantId: string, approvalId: string, pageId: string, input: {
  imageUrl: string;
  imageStoragePath?: string | null;
  fileName?: string | null;
}): Promise<void> {
  await ensureArtworkApprovalTables();
  await reopenArtworkApprovalForTenant(tenantId, approvalId, "An approved proof page was replaced.");
  await pool.query(`
    UPDATE sales.artwork_approval_pages p
    SET image_url = $4::text,
        image_storage_path = COALESCE($5::text, image_storage_path),
        file_name = COALESCE($6::varchar, file_name),
        proof_revision = aa.revision,
        client_response_status = 'pending',
        client_response_notes = NULL,
        client_responded_at = NULL,
        notes = CASE
          WHEN notes ILIKE 'Auto-created from quote line.%' THEN NULL
          ELSE notes
        END,
        updated_at = now()
    FROM sales.artwork_approvals aa
    WHERE p.approval_id = aa.id
      AND aa.tenant_id = $1::uuid
      AND p.approval_id = $2::uuid
      AND p.id = $3::uuid
  `, [tenantId, approvalId, pageId, input.imageUrl, input.imageStoragePath ?? null, input.fileName ?? null]);
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, approvalId]);
}

export async function markArtworkApprovalSentForTenant(tenantId: string, approvalId: string): Promise<void> {
  await ensureArtworkApprovalTables();
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET status = 'sent',
        public_token = COALESCE(public_token, $3),
        sent_at = now(),
        viewed_at = NULL,
        changes_requested_at = NULL,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
      AND status NOT IN ('approved','deleted')
  `, [tenantId, approvalId, makePublicToken()]);
}

function nextArtworkRevision(value: string | null | undefined): string {
  const current = String(value ?? "A").trim().toUpperCase();
  if (/^[A-Z]+$/.test(current)) {
    const chars = current.split("");
    for (let index = chars.length - 1; index >= 0; index -= 1) {
      if (chars[index] !== "Z") {
        chars[index] = String.fromCharCode(chars[index].charCodeAt(0) + 1);
        return chars.join("");
      }
      chars[index] = "A";
    }
    return `A${chars.join("")}`;
  }
  if (/^\d+$/.test(current)) return String(Number(current) + 1);
  return `${current}.1`;
}

export async function reopenArtworkApprovalForTenant(
  tenantId: string,
  approvalId: string,
  reason = "Approval reopened manually."
): Promise<{ reopened: boolean; revision: string; previousStatus: string }> {
  await ensureArtworkApprovalTables();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      status: string;
      revision: string | null;
      clientSignatoryName: string | null;
      clientConfirmedAt: string | null;
      approvedAt: string | null;
      internallyApprovedBy: string | null;
      internallyApprovedAt: string | null;
    }>(`
      SELECT
        status,
        revision,
        client_signatory_name as "clientSignatoryName",
        client_confirmed_at as "clientConfirmedAt",
        approved_at as "approvedAt",
        internally_approved_by as "internallyApprovedBy",
        internally_approved_at as "internallyApprovedAt"
      FROM sales.artwork_approvals
      WHERE tenant_id = $1::uuid AND id = $2::uuid
      FOR UPDATE
    `, [tenantId, approvalId]);
    const current = result.rows[0];
    if (!current) throw new Error("Artwork approval not found.");
    if (current.status === "deleted") throw new Error("Restore the artwork approval before reopening it.");
    if (current.status !== "approved") {
      await client.query("COMMIT");
      return { reopened: false, revision: current.revision || "A", previousStatus: current.status };
    }

    const previousRevision = current.revision || "A";
    const revision = nextArtworkRevision(previousRevision);
    const previousApprover = current.clientSignatoryName || current.internallyApprovedBy || "unknown approver";
    const previousApprovalTime = current.clientConfirmedAt || current.approvedAt || current.internallyApprovedAt || "unknown time";
    const auditNote = `Approval reopened from Revision ${previousRevision} on ${new Date().toISOString()}. Previous approval: ${previousApprover} at ${previousApprovalTime}. Reason: ${reason}`;

    await client.query(`
      UPDATE sales.artwork_approvals
      SET status = 'draft',
          revision = $3::varchar,
          revision_note = $4::text,
          internal_notes = concat_ws(E'\\n', NULLIF(internal_notes, ''), $5::text),
          client_response_notes = NULL,
          client_signatory_name = NULL,
          client_signature_data_url = NULL,
          client_confirmed_at = NULL,
          internally_approved_at = NULL,
          internally_approved_by = NULL,
          sent_at = NULL,
          viewed_at = NULL,
          approved_at = NULL,
          changes_requested_at = NULL,
          updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid
    `, [tenantId, approvalId, revision, `Reopened for approval: ${reason}`, auditNote]);

    // Unchanged proofs are carried into the new revision. The changed/new page is
    // then replaced, added or removed by the calling action.
    await client.query(`
      UPDATE sales.artwork_approval_pages
      SET proof_revision = $2::varchar,
          updated_at = now()
      WHERE approval_id = $1::uuid
    `, [approvalId, revision]);

    // Do not delete production history. Pause active work until the revised
    // approval is accepted, while leaving completed/deleted jobs untouched.
    await client.query(`
      UPDATE production.production_jobs
      SET status = CASE WHEN status IN ('completed', 'deleted') THEN status ELSE 'waiting_on_files' END,
          internal_notes = concat_ws(E'\\n', NULLIF(internal_notes, ''), $3::text),
          updated_at = now()
      WHERE tenant_id = $1::uuid AND artwork_approval_id = $2::uuid
    `, [tenantId, approvalId, `Artwork approval reopened as Revision ${revision}; production paused pending re-approval.`]);

    await client.query("COMMIT");
    return { reopened: true, revision, previousStatus: current.status };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reopenArtworkApprovalPageForTenant(
  tenantId: string,
  approvalId: string,
  pageId: string,
  reason = "A proof page was reopened manually."
): Promise<{ reopened: boolean; revision: string; previousStatus: string }> {
  const result = await reopenArtworkApprovalForTenant(tenantId, approvalId, reason);
  const pageResult = await pool.query(`
    UPDATE sales.artwork_approval_pages p
    SET client_response_status = 'pending',
        client_response_notes = NULL,
        client_responded_at = NULL,
        updated_at = now()
    FROM sales.artwork_approvals aa
    WHERE p.approval_id = aa.id
      AND aa.tenant_id = $1::uuid
      AND p.approval_id = $2::uuid
      AND p.id = $3::uuid
  `, [tenantId, approvalId, pageId]);
  if (!pageResult.rowCount) throw new Error("Artwork proof page not found.");
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET status = CASE WHEN status = 'approved' THEN 'draft' ELSE status END,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, approvalId]);
  return result;
}

export async function startArtworkApprovalRevisionForTenant(tenantId: string, approvalId: string): Promise<string> {
  await ensureArtworkApprovalTables();
  const current = await getArtworkApprovalById(tenantId, approvalId);
  if (!current) throw new Error("Artwork approval not found.");
  if (current.status === "approved") throw new Error("Approved artwork cannot be moved back into revision. Create a new approval if production scope changes.");
  if (current.status === "deleted") throw new Error("Restore the artwork approval before starting a new revision.");

  const revision = nextArtworkRevision(current.revision);
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET status = 'draft',
        revision = $3::varchar,
        revision_note = 'Revised for approval',
        client_response_notes = NULL,
        client_signatory_name = NULL,
        client_signature_data_url = NULL,
        client_confirmed_at = NULL,
        sent_at = NULL,
        viewed_at = NULL,
        approved_at = NULL,
        changes_requested_at = NULL,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, approvalId, revision]);
  await pool.query(`
    UPDATE sales.artwork_approval_pages
    SET proof_revision = CASE
          WHEN client_response_status = 'changes_requested' THEN proof_revision
          ELSE $2::varchar
        END,
        client_response_status = CASE
          WHEN client_response_status = 'changes_requested' THEN 'pending'
          ELSE client_response_status
        END,
        client_response_notes = CASE
          WHEN client_response_status = 'changes_requested' THEN NULL
          ELSE client_response_notes
        END,
        client_responded_at = CASE
          WHEN client_response_status = 'changes_requested' THEN NULL
          ELSE client_responded_at
        END,
        updated_at = now()
    WHERE approval_id = $1::uuid
  `, [approvalId, revision]);
  return revision;
}

export async function setArtworkApprovalStatusForTenant(tenantId: string, approvalId: string, status: string): Promise<void> {
  await ensureArtworkApprovalTables();
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET status = $3::varchar,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, approvalId, status]);
}

export async function markArtworkApprovalInternallyApprovedForTenant(tenantId: string, approvalId: string, approvedBy: string | null): Promise<void> {
  await ensureArtworkApprovalTables();
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET status = 'approved',
        internally_approved_at = now(),
        internally_approved_by = $3,
        approved_at = COALESCE(approved_at, now()),
        client_response_notes = COALESCE(client_response_notes, 'Internally approved by staff/manager. No client approval request was sent.'),
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, approvalId, approvedBy]);
  await pool.query(`
    UPDATE sales.artwork_approval_pages
    SET client_response_status = 'approved',
        client_response_notes = COALESCE(client_response_notes, 'Approved internally.'),
        client_responded_at = now(),
        updated_at = now()
    WHERE approval_id = $1::uuid
  `, [approvalId]);
  await createProductionJobFromArtworkApprovalForTenant(tenantId, approvalId, approvedBy);
}

export async function markArtworkApprovalViewedByToken(token: string): Promise<void> {
  await ensureArtworkApprovalTables();
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET viewed_at = COALESCE(viewed_at, now()),
        status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
        updated_at = now()
    WHERE public_token = $1
      AND (viewed_at IS NULL OR status = 'sent')
  `, [token]);
}

async function activeArtworkPagesForApproval(approval: ArtworkApprovalRecord): Promise<ArtworkApprovalPageRecord[]> {
  const [pages, lines, quote] = await Promise.all([
    listArtworkApprovalPages(approval.id),
    listQuoteLines(approval.quoteId),
    getQuoteDraftById(approval.tenantId, approval.quoteId)
  ]);
  const usesLineResponses = quoteUsesLineResponses(lines);
  const activeLineIds = new Set(lines
    .filter((line) => artworkQuoteLineInScope(line, quote?.status, usesLineResponses))
    .map((line) => line.id));
  return pages.filter((page) => !page.sourceQuoteLineId || activeLineIds.has(page.sourceQuoteLineId));
}

export async function respondToArtworkApprovalPageByToken(
  token: string,
  pageId: string,
  response: "approved" | "changes_requested",
  notes: string | null
): Promise<{ allPagesApproved: boolean; hasChanges: boolean }> {
  await ensureArtworkApprovalTables();
  const approval = await getArtworkApprovalByPublicToken(token);
  if (!approval || !["sent", "viewed", "changes_requested"].includes(approval.status)) {
    throw new Error("This artwork revision is not currently open for page decisions.");
  }

  const activePages = await activeArtworkPagesForApproval(approval);
  const target = activePages.find((page) => page.id === pageId);
  if (!target) throw new Error("This proof page is no longer part of the current approval.");
  if (approval.revision && target.proofRevision !== approval.revision) {
    throw new Error("This proof page has been replaced by a newer revision. Refresh the page and review the latest proof.");
  }

  await pool.query(`
    UPDATE sales.artwork_approval_pages
    SET client_response_status = $3::varchar,
        client_response_notes = $4::text,
        client_responded_at = now(),
        updated_at = now()
    WHERE approval_id = $1::uuid AND id = $2::uuid
  `, [approval.id, pageId, response, notes]);

  const statuses = activePages.map((page) => page.id === pageId ? response : page.clientResponseStatus);
  const hasChanges = statuses.some((status) => status === "changes_requested");
  const nextStatus = hasChanges ? "changes_requested" : "viewed";
  const pageMessage = response === "changes_requested" ? `${target.signCode || target.title}: ${notes || "Changes requested"}` : null;
  await pool.query(`
    UPDATE sales.artwork_approvals
    SET status = $2::varchar,
        client_response_notes = CASE WHEN $2::varchar = 'changes_requested' THEN $3::text ELSE NULL END,
        changes_requested_at = CASE WHEN $2::varchar = 'changes_requested' THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = $1::uuid
  `, [approval.id, nextStatus, pageMessage]);

  if (response === "changes_requested") {
    await createNotificationForTenant(approval.tenantId, {
      eventType: "artwork_changes_requested",
      title: `Artwork changes requested — ${target.signCode || target.title}`,
      message: notes,
      href: `/artwork-approvals?selected=${approval.id}`,
      payloadJson: { artworkApprovalId: approval.id, artworkPageId: pageId, response }
    });
  }

  return {
    allPagesApproved: statuses.length > 0 && statuses.every((status) => status === "approved"),
    hasChanges
  };
}

export async function respondToArtworkApprovalByToken(token: string, response: "approved" | "changes_requested", notes: string | null, signatoryName?: string | null, signatureDataUrl?: string | null): Promise<void> {
  await ensureArtworkApprovalTables();
  if (response === "approved") {
    const approval = await getArtworkApprovalByPublicToken(token);
    if (!approval) throw new Error("Artwork approval not found.");
    const activePages = await activeArtworkPagesForApproval(approval);
    if (!activePages.length || activePages.some((page) => page.clientResponseStatus !== "approved")) {
      throw new Error("Approve every current proof page before signing off the artwork for production.");
    }
  }
  const timestampColumn = response === "approved" ? "approved_at" : "changes_requested_at";
  const result = await pool.query<{ id: string; tenantId: string }>(`
    UPDATE sales.artwork_approvals
    SET status = $2::varchar,
        ${timestampColumn} = now(),
        client_response_notes = $3::text,
        client_signatory_name = CASE WHEN $2::varchar = 'approved' THEN $4::varchar ELSE client_signatory_name END,
        client_signature_data_url = CASE WHEN $2::varchar = 'approved' THEN $5::text ELSE client_signature_data_url END,
        client_confirmed_at = CASE WHEN $2::varchar = 'approved' THEN now() ELSE client_confirmed_at END,
        updated_at = now()
    WHERE public_token = $1::varchar
      AND status IN ('sent','viewed')
    RETURNING id, tenant_id as "tenantId"
  `, [token, response, notes, signatoryName ?? null, signatureDataUrl ?? null]);

  if (!result.rowCount) {
    throw new Error("This artwork revision is not currently open for approval.");
  }

  if (response === "approved") {
    const approvedApproval = result.rows[0];
    if (approvedApproval) {
      await createProductionJobFromArtworkApprovalForTenant(approvedApproval.tenantId, approvedApproval.id, signatoryName ?? "client approval");
    }
  }
  const respondedApproval = result.rows[0];
  if (respondedApproval) {
    await createNotificationForTenant(respondedApproval.tenantId, {
      eventType: response === "approved" ? "artwork_approved" : "artwork_changes_requested",
      title: response === "approved" ? "Artwork approved" : "Artwork changes requested",
      message: notes,
      href: `/artwork-approvals?selected=${respondedApproval.id}`,
      payloadJson: { artworkApprovalId: respondedApproval.id, response }
    });
  }
}
