import "server-only";

import { randomBytes } from "crypto";
import { pool } from "@production-manager/db";
import { createProductionJobFromArtworkApprovalForTenant } from "@/server/production";

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
  createdAt: string;
};

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
      ADD COLUMN IF NOT EXISTS client_response_notes text,
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
      ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
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

export async function listQuoteDraftsForTenant(tenantId: string, options?: { includeDeleted?: boolean }): Promise<QuoteDraftRecord[]> {
  await ensureQuoteLifecycleColumns();
  const result = await pool.query<QuoteDraftRecord>(`
    SELECT ${quoteSelectSql()}
    FROM sales.quote_drafts
    WHERE tenant_id = $1::uuid
      AND ($2::boolean OR status <> 'deleted')
    ORDER BY created_at DESC
  `,[tenantId, Boolean(options?.includeDeleted)]);
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
  const uniqueIds = Array.from(new Set(quoteIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const result = await pool.query<{ quoteId: string; total: string }>(`
    SELECT
      quote_id as "quoteId",
      COALESCE(SUM(line_total), 0)::text as total
    FROM sales.quote_lines
    WHERE quote_id = ANY($1::uuid[])
    GROUP BY quote_id
  `, [uniqueIds]);

  return new Map(result.rows.map((row) => [row.quoteId, Number(row.total) || 0]));
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

  if (response === "accepted") {
    await updateQuoteReadyForMyobByToken(token);
  }
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
    quote.notes ? quote.notes.slice(0, 255) : quote.clientName,
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

export function artworkQuoteLineKind(line: Pick<QuoteLineRecord, "productName" | "optionSummary" | "notes">): "signage" | "small_format" | null {
  const product = normaliseForSearch(line.productName);
  const combined = normaliseForSearch([line.productName, line.optionSummary, line.notes].filter(Boolean).join(" · "));

  if (/\b(pickup|delivery|install|installation|freight|courier)\b/.test(product)) return null;
  if (/\b(pickup|delivery charge|client collects|installer|install hr|install\b|travel)\b/.test(combined)) return null;
  if (/\b(custom component|assembly|parts:)\b/.test(combined)) return null;

  if (/\b(card|cards|business card|flyer|flyers|brochure|brochures|booklet|booklets|book\b|books\b|ncr|duplicate|triplicate|quadruplicate|carbon|gsm|cello|fold|folding|score|creasing|staple|saddle stitch|sequential numbering|padding|tape colour|cover:)\b/.test(combined)) {
    return "small_format";
  }

  if (/\b(acrylic|acm|aluminium composite|corflute|coreflute|pvc|foamboard|banner|vinyl|roll stock|laminate|jingwei|router|cnc|drill holes|eyelets|direct print|cut vinyl|clear reverse|reverse print|positive print|white ink|cmyk|signage|sign\b|panel\b)\b/.test(combined)) {
    return "signage";
  }

  return null;
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

function titleCaseSignCode(index: number, kind: "signage" | "small_format"): string {
  return kind === "small_format" ? `P${index}` : `S${index}`;
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

function buildArtworkPageFromQuoteLine(line: QuoteLineRecord, index: number, kind: "signage" | "small_format"): ArtworkApprovalPageInput {
  const parts = optionParts(line);
  const combined = [line.productName, line.optionSummary, line.notes].filter(Boolean).join(" · ");
  const size = extractFinishedSizeFromQuoteLine(line) ?? extractFirstMatch(combined, [/(\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*mm)/i, /(\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?)/i]);
  const code = titleCaseSignCode(index, kind);
  const qty = normaliseMoney(line.quantity, "1");

  const colourParts = uniqueSpecificSummaryLines(parts.filter((part) => /\b(cmyk|mono|white ink|white|pantone|colour|color|clear|reverse|positive)\b/i.test(part)));
  const materialParts = uniqueSpecificSummaryLines(parts.filter((part) =>
    /\b(acrylic|acm|corflute|coreflute|pvc|foamboard|banner|vinyl|roll|stock|paper|gsm|satin|cello|sheet)\b/i.test(part)
    && !/\b(laminate|lamination|lam-|gloss laminate|matt laminate|matte laminate|coating)\b/i.test(part)
  ));
  const finishingParts = uniqueSpecificSummaryLines(parts.filter((part) => /\b(finishing|jingwei|router|cnc|drill|holes|eyelet|trim|cutting|fold|score|crease|staple|saddle|numbering|padding|tape|laminate|lamination|lam-|coating)\b/i.test(part)));
  const fallbackSubstrate = uniqueSpecificSummaryLines([line.productName, ...materialParts]).join("\n") || line.productName;

  return {
    title: line.productName || `${kind === "small_format" ? "Small format" : "Sign"} proof`,
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
    smallFormatSummary: kind === "small_format" ? parts.join("\n") : null,
    sourceQuoteLineId: line.id
  };
}

export async function countArtworkEligibleQuoteLines(quoteId: string): Promise<number> {
  const lines = await listQuoteLines(quoteId);
  return lines.filter((line) => artworkQuoteLineKind(line)).length;
}

export async function prefillArtworkApprovalPagesFromQuoteLines(tenantId: string, approvalId: string): Promise<{ created: number; skipped: number }> {
  await ensureArtworkApprovalTables();
  const approval = await getArtworkApprovalById(tenantId, approvalId);
  if (!approval) return { created: 0, skipped: 0 };

  const [lines, existingPages] = await Promise.all([
    listQuoteLines(approval.quoteId),
    listArtworkApprovalPages(approval.id)
  ]);
  const existingLineIds = new Set(existingPages.map((page) => page.sourceQuoteLineId).filter(Boolean));
  let created = 0;
  let skipped = 0;
  let nextIndex = existingPages.length + 1;

  for (const line of lines) {
    const kind = artworkQuoteLineKind(line);
    if (!kind) {
      skipped += 1;
      continue;
    }
    if (existingLineIds.has(line.id)) {
      skipped += 1;
      continue;
    }

    await addArtworkApprovalPageForTenant(tenantId, approval.id, buildArtworkPageFromQuoteLine(line, nextIndex, kind));
    created += 1;
    nextIndex += 1;
  }

  return { created, skipped };
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
  await ensureArtworkApprovalTables();
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
  await ensureArtworkApprovalTables();
  const result = await pool.query<ArtworkApprovalRecord>(`
    SELECT ${artworkApprovalSelectSql()}
    FROM sales.artwork_approvals
    WHERE tenant_id = $1::uuid AND id = $2::uuid
    LIMIT 1
  `, [tenantId, approvalId]);
  return result.rows[0] ?? null;
}

export async function getArtworkApprovalForQuote(tenantId: string, quoteId: string): Promise<ArtworkApprovalRecord | null> {
  await ensureArtworkApprovalTables();
  const result = await pool.query<ArtworkApprovalRecord>(`
    SELECT ${artworkApprovalSelectSql()}
    FROM sales.artwork_approvals
    WHERE tenant_id = $1::uuid AND quote_id = $2::uuid
    LIMIT 1
  `, [tenantId, quoteId]);
  return result.rows[0] ?? null;
}

export async function getArtworkApprovalByPublicToken(token: string): Promise<ArtworkApprovalRecord | null> {
  await ensureArtworkApprovalTables();
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
      created_at as "createdAt"
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

export async function replaceArtworkApprovalPageProofForTenant(tenantId: string, approvalId: string, pageId: string, input: {
  imageUrl: string;
  imageStoragePath?: string | null;
  fileName?: string | null;
}): Promise<void> {
  await ensureArtworkApprovalTables();
  await pool.query(`
    UPDATE sales.artwork_approval_pages p
    SET image_url = $4::text,
        image_storage_path = COALESCE($5::text, image_storage_path),
        file_name = COALESCE($6::varchar, file_name),
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
  `, [token]);
}

export async function respondToArtworkApprovalByToken(token: string, response: "approved" | "changes_requested", notes: string | null, signatoryName?: string | null, signatureDataUrl?: string | null): Promise<void> {
  await ensureArtworkApprovalTables();
  const timestampColumn = response === "approved" ? "approved_at" : "changes_requested_at";
  const result = await pool.query<{ id: string; tenantId: string }>(`
    UPDATE sales.artwork_approvals
    SET status = $2,
        ${timestampColumn} = now(),
        client_response_notes = $3,
        client_signatory_name = CASE WHEN $2 = 'approved' THEN $4 ELSE client_signatory_name END,
        client_signature_data_url = CASE WHEN $2 = 'approved' THEN $5 ELSE client_signature_data_url END,
        client_confirmed_at = CASE WHEN $2 = 'approved' THEN now() ELSE client_confirmed_at END,
        updated_at = now()
    WHERE public_token = $1
    RETURNING id, tenant_id as "tenantId"
  `, [token, response, notes, signatoryName ?? null, signatureDataUrl ?? null]);

  if (response === "approved") {
    const approvedApproval = result.rows[0];
    if (approvedApproval) {
      await createProductionJobFromArtworkApprovalForTenant(approvedApproval.tenantId, approvedApproval.id, signatoryName ?? "client approval");
    }
  }
}
