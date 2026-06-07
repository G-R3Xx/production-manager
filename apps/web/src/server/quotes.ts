import "server-only";

import { pool } from "@production-manager/db";

export type QuoteRecord = {
  id: string;
  tenantId: string;
  quoteNumber: string;
  customerId: string | null;
  customerDisplayName: string | null;
  status: string;
  title: string | null;
  attentionName: string | null;
  siteAddress: string | null;
  validUntil: string | null;
  requestedInstallDate: string | null;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  createdBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuoteLineRecord = {
  id: string;
  tenantId: string;
  quoteId: string;
  sortOrder: number;
  productId: string | null;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  costTotal: string;
  displayTitle: string;
  displaySubtitle: string | null;
  selectionSummary: string;
  configuratorSnapshot: Record<string, unknown>;
  resolvedConfig: Record<string, unknown>;
  pricingBreakdown: unknown[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceRecord = {
  id: string;
  tenantId: string;
  customerId: string | null;
  quoteId: string | null;
  invoiceNumber: string;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  myobUid: string | null;
  createdAt: string;
  updatedAt: string;
};

function parseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function listQuotesForTenant(tenantId: string): Promise<QuoteRecord[]> {
  const result = await pool.query<QuoteRecord>(`
    SELECT
      q.id,
      q.tenant_id AS "tenantId",
      q.quote_number AS "quoteNumber",
      q.customer_id AS "customerId",
      c.display_name AS "customerDisplayName",
      q.status,
      q.title,
      q.attention_name AS "attentionName",
      q.site_address AS "siteAddress",
      q.valid_until AS "validUntil",
      q.requested_install_date AS "requestedInstallDate",
      q.subtotal::text AS subtotal,
      q.tax_total::text AS "taxTotal",
      q.grand_total::text AS "grandTotal",
      q.created_by AS "createdBy",
      q.approved_at AS "approvedAt",
      q.created_at AS "createdAt",
      q.updated_at AS "updatedAt"
    FROM app.quotes q
    LEFT JOIN app.customers c ON c.id = q.customer_id
    WHERE q.tenant_id = $1::uuid
    ORDER BY q.created_at DESC
  `,[tenantId]);
  return result.rows;
}

export async function listRecentQuoteLinesForTenant(tenantId: string): Promise<QuoteLineRecord[]> {
  const result = await pool.query<Omit<QuoteLineRecord, "configuratorSnapshot" | "resolvedConfig" | "pricingBreakdown"> & { configuratorSnapshot: unknown; resolvedConfig: unknown; pricingBreakdown: unknown }>(`
    SELECT
      id,
      tenant_id AS "tenantId",
      quote_id AS "quoteId",
      sort_order AS "sortOrder",
      product_id AS "productId",
      qty::text AS qty,
      unit_price::text AS "unitPrice",
      line_total::text AS "lineTotal",
      cost_total::text AS "costTotal",
      display_title AS "displayTitle",
      display_subtitle AS "displaySubtitle",
      selection_summary AS "selectionSummary",
      configurator_snapshot AS "configuratorSnapshot",
      resolved_config AS "resolvedConfig",
      pricing_breakdown AS "pricingBreakdown",
      notes,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM app.quote_lines
    WHERE tenant_id = $1::uuid
    ORDER BY created_at DESC
    LIMIT 20
  `,[tenantId]);
  return result.rows.map((row)=>({ ...row, configuratorSnapshot: parseRecord(row.configuratorSnapshot), resolvedConfig: parseRecord(row.resolvedConfig), pricingBreakdown: parseArray(row.pricingBreakdown)}));
}

export async function listInvoicesForTenant(tenantId: string): Promise<InvoiceRecord[]> {
  const result = await pool.query<InvoiceRecord>(`
    SELECT
      id, tenant_id AS "tenantId", customer_id AS "customerId", quote_id AS "quoteId",
      invoice_number AS "invoiceNumber", status, issue_date AS "issueDate", due_date AS "dueDate",
      subtotal::text AS subtotal, tax_total::text AS "taxTotal", grand_total::text AS "grandTotal",
      myob_uid AS "myobUid", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM app.invoices
    WHERE tenant_id = $1::uuid
    ORDER BY created_at DESC
  `,[tenantId]);
  return result.rows;
}

export async function createDraftQuote(input: {
  tenantId: string;
  customerId: string | null;
  title: string | null;
  attentionName: string | null;
  siteAddress: string | null;
  createdBy: string | null;
  lineProductId: string | null;
  lineTitle: string;
  lineSubtitle: string | null;
  selectionSummary: string;
  qty: string;
  unitPrice: string;
  costTotal: string;
  notes: string | null;
}): Promise<{ quoteId: string }> {
  const quoteNumberResult = await pool.query<{ quoteNumber: string }>(`
    SELECT 'Q-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((coalesce(max(substring(quote_number from '([0-9]+)$')::int), 0) + 1)::text, 3, '0') AS "quoteNumber"
    FROM app.quotes
    WHERE tenant_id = $1::uuid
  `,[input.tenantId]);
  const quoteNumber = quoteNumberResult.rows[0]?.quoteNumber ?? `Q-${Date.now()}`;
  const qty = Number(input.qty || '1');
  const unitPrice = Number(input.unitPrice || '0');
  const costTotal = Number(input.costTotal || '0');
  const lineTotal = qty * unitPrice;
  const quoteResult = await pool.query<{ id: string }>(`
    INSERT INTO app.quotes (tenant_id, quote_number, customer_id, status, title, attention_name, site_address, subtotal, tax_total, grand_total, created_by, created_at, updated_at)
    VALUES ($1::uuid,$2::varchar,$3::uuid,'draft'::quote_status,$4::varchar,$5::varchar,$6::text,$7::numeric,$8::numeric,$9::numeric,$10::uuid,now(),now())
    RETURNING id
  `,[input.tenantId, quoteNumber, input.customerId, input.title, input.attentionName, input.siteAddress, lineTotal.toFixed(2), '0.00', lineTotal.toFixed(2), input.createdBy]);
  const quoteId = quoteResult.rows[0].id;
  await pool.query(`
    INSERT INTO app.quote_lines (tenant_id, quote_id, sort_order, product_id, qty, unit_price, line_total, cost_total, display_title, display_subtitle, selection_summary, configurator_snapshot, resolved_config, pricing_breakdown, notes, created_at, updated_at)
    VALUES ($1::uuid,$2::uuid,0,$3::uuid,$4::numeric,$5::numeric,$6::numeric,$7::numeric,$8::varchar,$9::text,$10::text,$11::jsonb,$12::jsonb,$13::jsonb,$14::text,now(),now())
  `,[input.tenantId, quoteId, input.lineProductId, qty.toFixed(2), unitPrice.toFixed(2), lineTotal.toFixed(2), costTotal.toFixed(2), input.lineTitle, input.lineSubtitle, input.selectionSummary, JSON.stringify({ foundation: 'recipe_snapshot_placeholder' }), JSON.stringify({ foundation: 'resolved_recipe_placeholder' }), JSON.stringify([]), input.notes]);
  return { quoteId };
}
