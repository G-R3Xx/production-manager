import "server-only";

import { randomBytes } from "crypto";
import { pool } from "@production-manager/db";
import { relationHasColumns, relationsExist } from "@/server/schema-readiness";
import { getQuoteDraftById, listQuoteLines, type QuoteDraftRecord, type QuoteLineRecord } from "@/server/quotes";

export type InvoiceKind = "full_remaining" | "selected_lines" | "deposit" | "progress" | "final_balance" | "variation";
export type InvoiceStatus = "draft" | "issued" | "part_paid" | "paid" | "void";

export type InvoiceRecord = {
  id: string;
  tenantId: string;
  jobId: string;
  customerId: string | null;
  quoteId: string;
  invoiceNumber: string;
  invoiceKind: InvoiceKind | string;
  status: InvoiceStatus | string;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  myobUid: string | null;
  myobNumber: string | null;
  myobStatus: string | null;
  myobBalanceDue: string | null;
  myobTotalAmount: string | null;
  myobSyncStatus: string;
  myobSyncError: string | null;
  myobSyncedAt: string | null;
  sourceOrderUid: string | null;
  sourceOrderNumber: string | null;
  isFinal: boolean;
  payloadJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceLineRecord = {
  id: string;
  tenantId: string;
  invoiceId: string;
  quoteLineId: string | null;
  productId: string | null;
  sortOrder: number;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  displayTitle: string;
  displaySubtitle: string | null;
  selectionSummary: string | null;
  sourceKind: string;
  payloadJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceableQuoteLine = {
  id: string;
  productId: string | null;
  productName: string;
  optionSummary: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  invoicedQty: number;
  invoicedValue: number;
  remainingQty: number;
  remainingValue: number;
  configurationSnapshot: Record<string, unknown>;
};

export type InvoiceEmailState = {
  status: "not_sent" | "pending" | "sent" | "error";
  to: string | null;
  sentAt: string | null;
  messageId: string | null;
  lastError: string | null;
};

export function invoiceEmailState(invoice: Pick<InvoiceRecord, "payloadJson">): InvoiceEmailState {
  const payload = invoice.payloadJson && typeof invoice.payloadJson === "object" && !Array.isArray(invoice.payloadJson) ? invoice.payloadJson : {};
  const raw = payload.clientEmail && typeof payload.clientEmail === "object" && !Array.isArray(payload.clientEmail)
    ? payload.clientEmail as Record<string, unknown>
    : {};
  const statusValue = String(raw.status ?? "not_sent");
  const status: InvoiceEmailState["status"] = ["pending", "sent", "error"].includes(statusValue) ? statusValue as InvoiceEmailState["status"] : "not_sent";
  const clean = (value: unknown): string | null => { const text = String(value ?? "").trim(); return text || null; };
  return {
    status,
    to: clean(raw.to),
    sentAt: clean(raw.sentAt),
    messageId: clean(raw.messageId),
    lastError: clean(raw.lastError),
  };
}

export type JobInvoiceSummary = {
  quote: QuoteDraftRecord;
  lines: InvoiceableQuoteLine[];
  invoices: InvoiceRecord[];
  quoteSubtotal: number;
  previouslyInvoicedSubtotal: number;
  acceptedInvoicedSubtotal: number;
  variationInvoicedSubtotal: number;
  fixedAdvanceSubtotal: number;
  remainingSubtotal: number;
  remainingGst: number;
  remainingTotal: number;
  fullyInvoiced: boolean;
};

let invoiceSchemaReady = false;
let invoiceSchemaPromise: Promise<void> | null = null;

export async function ensureInvoiceWorkflowSchema(): Promise<void> {
  if (!process.env.DATABASE_URL || invoiceSchemaReady) return;
  if (invoiceSchemaPromise) return invoiceSchemaPromise;
  invoiceSchemaPromise = (async () => {
    const ready = await relationsExist(["app.invoices", "app.invoice_lines"])
      && await relationHasColumns("app.invoices", [
        "job_id", "invoice_kind", "myob_number", "myob_status", "myob_balance_due", "myob_total_amount",
        "myob_sync_status", "myob_sync_error", "myob_synced_at", "source_order_uid", "source_order_number",
        "is_final", "created_by"
      ])
      && await relationHasColumns("app.invoice_lines", ["source_kind"]);
    if (ready) {
      await pool.query(`CREATE INDEX IF NOT EXISTS invoices_tenant_job_created_idx ON app.invoices (tenant_id, job_id, created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS invoice_lines_tenant_invoice_idx ON app.invoice_lines (tenant_id, invoice_id, sort_order)`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_myob_uid_uidx ON app.invoices (tenant_id, myob_uid) WHERE myob_uid IS NOT NULL`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_syncing_per_job_uidx ON app.invoices (tenant_id, job_id) WHERE job_id IS NOT NULL AND myob_sync_status='syncing'`);
      invoiceSchemaReady = true;
      return;
    }

    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'part_paid', 'paid', 'void');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app.invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
        customer_id uuid,
        quote_id uuid NOT NULL,
        job_id uuid,
        invoice_number varchar(50) NOT NULL,
        invoice_kind varchar(40) NOT NULL DEFAULT 'full_remaining',
        status invoice_status NOT NULL DEFAULT 'draft',
        issue_date timestamptz,
        due_date timestamptz,
        subtotal numeric(12,2) NOT NULL DEFAULT 0,
        tax_total numeric(12,2) NOT NULL DEFAULT 0,
        grand_total numeric(12,2) NOT NULL DEFAULT 0,
        myob_uid varchar(255),
        myob_number varchar(120),
        myob_status varchar(80),
        myob_balance_due numeric(12,2),
        myob_total_amount numeric(12,2),
        myob_sync_status varchar(30) NOT NULL DEFAULT 'not_synced',
        myob_sync_error text,
        myob_synced_at timestamptz,
        source_order_uid varchar(255),
        source_order_number varchar(120),
        is_final boolean NOT NULL DEFAULT false,
        payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const invoiceAlters = [
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS job_id uuid`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS invoice_kind varchar(40) NOT NULL DEFAULT 'full_remaining'`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_number varchar(120)`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_status varchar(80)`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_balance_due numeric(12,2)`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_total_amount numeric(12,2)`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_sync_status varchar(30) NOT NULL DEFAULT 'not_synced'`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_sync_error text`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS myob_synced_at timestamptz`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS source_order_uid varchar(255)`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS source_order_number varchar(120)`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false`,
      `ALTER TABLE app.invoices ADD COLUMN IF NOT EXISTS created_by uuid`
    ];
    for (const sql of invoiceAlters) await pool.query(sql);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS app.invoice_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
        invoice_id uuid NOT NULL REFERENCES app.invoices(id) ON DELETE CASCADE,
        quote_line_id uuid,
        product_id uuid,
        sort_order integer NOT NULL DEFAULT 0,
        qty numeric(12,4) NOT NULL,
        unit_price numeric(12,2) NOT NULL DEFAULT 0,
        line_total numeric(12,2) NOT NULL DEFAULT 0,
        display_title varchar(255) NOT NULL,
        display_subtitle text,
        selection_summary text,
        source_kind varchar(40) NOT NULL DEFAULT 'quote_line',
        payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE app.invoice_lines ADD COLUMN IF NOT EXISTS source_kind varchar(40) NOT NULL DEFAULT 'quote_line'`);
    await pool.query(`ALTER TABLE app.invoice_lines ALTER COLUMN qty TYPE numeric(12,4) USING qty::numeric`);
    await pool.query(`CREATE INDEX IF NOT EXISTS invoices_tenant_job_created_idx ON app.invoices (tenant_id, job_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS invoice_lines_tenant_invoice_idx ON app.invoice_lines (tenant_id, invoice_id, sort_order)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_myob_uid_uidx ON app.invoices (tenant_id, myob_uid) WHERE myob_uid IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_syncing_per_job_uidx ON app.invoices (tenant_id, job_id) WHERE job_id IS NOT NULL AND myob_sync_status='syncing'`);
    invoiceSchemaReady = true;
  })().finally(() => { invoiceSchemaPromise = null; });
  return invoiceSchemaPromise;
}

function numberValue(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function qtyValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function localInvoiceNumber(): string {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `PMI-${yy}${mm}${dd}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function invoiceSelectSql(): string {
  return `
    id, tenant_id as "tenantId", job_id as "jobId", customer_id as "customerId", quote_id as "quoteId",
    invoice_number as "invoiceNumber", invoice_kind as "invoiceKind", status::text as status,
    issue_date::text as "issueDate", due_date::text as "dueDate", subtotal::text as subtotal,
    tax_total::text as "taxTotal", grand_total::text as "grandTotal", myob_uid as "myobUid",
    myob_number as "myobNumber", myob_status as "myobStatus", myob_balance_due::text as "myobBalanceDue",
    myob_total_amount::text as "myobTotalAmount", myob_sync_status as "myobSyncStatus",
    myob_sync_error as "myobSyncError", myob_synced_at::text as "myobSyncedAt",
    source_order_uid as "sourceOrderUid", source_order_number as "sourceOrderNumber", is_final as "isFinal",
    payload_json as "payloadJson", created_by as "createdBy", created_at::text as "createdAt", updated_at::text as "updatedAt"
  `;
}

function invoiceLineSelectSql(): string {
  return `
    id, tenant_id as "tenantId", invoice_id as "invoiceId", quote_line_id as "quoteLineId", product_id as "productId",
    sort_order as "sortOrder", qty::text as qty, unit_price::text as "unitPrice", line_total::text as "lineTotal",
    display_title as "displayTitle", display_subtitle as "displaySubtitle", selection_summary as "selectionSummary",
    source_kind as "sourceKind", payload_json as "payloadJson", created_at::text as "createdAt", updated_at::text as "updatedAt"
  `;
}

export async function listInvoicesForJob(tenantId: string, jobId: string): Promise<InvoiceRecord[]> {
  await ensureInvoiceWorkflowSchema();
  const result = await pool.query<InvoiceRecord>(`
    SELECT ${invoiceSelectSql()} FROM app.invoices
    WHERE tenant_id=$1::uuid AND job_id=$2::uuid
    ORDER BY created_at DESC
  `, [tenantId, jobId]);
  return result.rows;
}

export async function getInvoiceById(tenantId: string, invoiceId: string): Promise<InvoiceRecord | null> {
  await ensureInvoiceWorkflowSchema();
  const result = await pool.query<InvoiceRecord>(`SELECT ${invoiceSelectSql()} FROM app.invoices WHERE tenant_id=$1::uuid AND id=$2::uuid LIMIT 1`, [tenantId, invoiceId]);
  return result.rows[0] ?? null;
}

export async function listInvoiceLines(tenantId: string, invoiceId: string): Promise<InvoiceLineRecord[]> {
  await ensureInvoiceWorkflowSchema();
  const result = await pool.query<InvoiceLineRecord>(`
    SELECT ${invoiceLineSelectSql()} FROM app.invoice_lines
    WHERE tenant_id=$1::uuid AND invoice_id=$2::uuid ORDER BY sort_order, created_at
  `, [tenantId, invoiceId]);
  return result.rows;
}

function activeQuoteLines(lines: QuoteLineRecord[]): QuoteLineRecord[] {
  const hasExplicit = lines.some((line) => line.clientResponseStatus !== "pending");
  return hasExplicit ? lines.filter((line) => line.clientResponseStatus === "approved") : lines;
}

export async function getJobInvoiceSummary(tenantId: string, jobId: string, quoteId: string): Promise<JobInvoiceSummary> {
  await ensureInvoiceWorkflowSchema();
  const [quote, rawLines, invoices] = await Promise.all([
    getQuoteDraftById(tenantId, quoteId),
    listQuoteLines(quoteId),
    listInvoicesForJob(tenantId, jobId),
  ]);
  if (!quote) throw new Error("Quote not found for this job.");
  const quoteLines = activeQuoteLines(rawLines);
  const countableInvoices = invoices.filter((invoice) => ["issued", "part_paid", "paid"].includes(invoice.status));
  const countableIds = countableInvoices.map((invoice) => invoice.id);
  const lineUsage = new Map<string, { qty: number; value: number }>();
  if (countableIds.length) {
    const result = await pool.query<{ quoteLineId: string; qty: string; value: string }>(`
      SELECT quote_line_id as "quoteLineId", COALESCE(SUM(qty),0)::text as qty, COALESCE(SUM(line_total),0)::text as value
      FROM app.invoice_lines
      WHERE tenant_id=$1::uuid AND invoice_id=ANY($2::uuid[]) AND quote_line_id IS NOT NULL AND source_kind='quote_line'
      GROUP BY quote_line_id
    `, [tenantId, countableIds]);
    for (const row of result.rows) lineUsage.set(row.quoteLineId, { qty: numberValue(row.qty), value: numberValue(row.value) });
  }

  const mappedLines: InvoiceableQuoteLine[] = quoteLines.map((line) => {
    const quantity = numberValue(line.quantity);
    const unitPrice = numberValue(line.unitPrice);
    const lineTotal = numberValue(line.lineTotal, quantity * unitPrice);
    const used = lineUsage.get(line.id) ?? { qty: 0, value: 0 };
    const remainingQty = Math.max(0, qtyValue(quantity - used.qty));
    return {
      id: line.id,
      productId: line.productId,
      productName: line.productName,
      optionSummary: line.optionSummary,
      quantity,
      unitPrice,
      lineTotal: money(lineTotal),
      invoicedQty: qtyValue(used.qty),
      invoicedValue: money(used.value),
      remainingQty,
      remainingValue: money(remainingQty * unitPrice),
      configurationSnapshot: line.configurationSnapshot ?? {},
    };
  });

  const quoteSubtotal = money(mappedLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const previouslyInvoicedSubtotal = money(countableInvoices.reduce((sum, invoice) => sum + numberValue(invoice.subtotal), 0));
  const variationInvoicedSubtotal = money(countableInvoices
    .filter((invoice) => invoice.invoiceKind === "variation")
    .reduce((sum, invoice) => sum + numberValue(invoice.subtotal), 0));
  const acceptedInvoicedSubtotal = money(previouslyInvoicedSubtotal - variationInvoicedSubtotal);
  const fixedAdvanceSubtotal = money(countableInvoices
    .filter((invoice) => invoice.invoiceKind === "deposit" || invoice.invoiceKind === "progress")
    .reduce((sum, invoice) => sum + numberValue(invoice.subtotal), 0));
  const remainingSubtotal = Math.max(0, money(quoteSubtotal - acceptedInvoicedSubtotal));
  const remainingGst = money(remainingSubtotal * 0.1);
  return {
    quote,
    lines: mappedLines,
    invoices,
    quoteSubtotal,
    previouslyInvoicedSubtotal,
    acceptedInvoicedSubtotal,
    variationInvoicedSubtotal,
    fixedAdvanceSubtotal,
    remainingSubtotal,
    remainingGst,
    remainingTotal: money(remainingSubtotal + remainingGst),
    fullyInvoiced: remainingSubtotal <= 0.01,
  };
}

type CreateInvoiceLineInput = {
  quoteLineId: string | null;
  productId: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  displayTitle: string;
  displaySubtitle?: string | null;
  selectionSummary?: string | null;
  sourceKind: "quote_line" | "advance" | "advance_credit" | "variation";
  payloadJson?: Record<string, unknown>;
};

export type CreateJobInvoiceInput = {
  jobId: string;
  quoteId: string;
  kind: InvoiceKind;
  selectedQtyByQuoteLineId?: Record<string, number>;
  advanceAmount?: number | null;
  advancePercent?: number | null;
  advanceLabel?: string | null;
  variationDescription?: string | null;
  variationQty?: number | null;
  variationUnitPrice?: number | null;
  createdBy?: string | null;
  sourceOrderUid?: string | null;
  sourceOrderNumber?: string | null;
};

function quoteLineToInvoiceLine(line: InvoiceableQuoteLine, qty: number): CreateInvoiceLineInput {
  const safeQty = qtyValue(Math.min(Math.max(0, qty), line.remainingQty));
  return {
    quoteLineId: line.id,
    productId: line.productId,
    qty: safeQty,
    unitPrice: money(line.unitPrice),
    lineTotal: money(safeQty * line.unitPrice),
    displayTitle: line.productName,
    displaySubtitle: line.optionSummary,
    selectionSummary: line.optionSummary,
    sourceKind: "quote_line",
    payloadJson: { configurationSnapshot: line.configurationSnapshot },
  };
}

export async function createJobInvoiceForTenant(tenantId: string, input: CreateJobInvoiceInput): Promise<InvoiceRecord> {
  const summary = await getJobInvoiceSummary(tenantId, input.jobId, input.quoteId);
  if (!["accepted", "converted"].includes(String(summary.quote.status).toLowerCase())) {
    throw new Error("Only an accepted quote can be invoiced.");
  }
  const unresolvedDraft = summary.invoices.find((invoice) => invoice.status === "draft" && !invoice.myobUid && ["syncing", "error"].includes(invoice.myobSyncStatus));
  if (unresolvedDraft) {
    throw new Error(`Invoice ${unresolvedDraft.invoiceNumber} has not been confirmed in MYOB yet. Retry or resolve that draft before creating another invoice for this job.`);
  }
  if (input.kind !== "variation" && summary.remainingSubtotal <= 0.01) throw new Error("This job is already fully invoiced. Use Variation / extra for approved additional work.");

  const lines: CreateInvoiceLineInput[] = [];
  let isFinal = false;
  if (input.kind === "variation") {
    const description = String(input.variationDescription || "").trim().slice(0, 255);
    const qty = qtyValue(numberValue(input.variationQty, 1));
    const unitPrice = money(numberValue(input.variationUnitPrice));
    if (!description) throw new Error("Enter a description for the approved variation / extra.");
    if (qty <= 0) throw new Error("Variation quantity must be greater than 0.");
    if (unitPrice <= 0) throw new Error("Variation price P/U must be greater than $0.");
    lines.push({
      quoteLineId: null, productId: null, qty, unitPrice, lineTotal: money(qty * unitPrice),
      displayTitle: description, displaySubtitle: `Approved additional work · ${summary.quote.quoteNumber || "accepted quote"}`,
      selectionSummary: null, sourceKind: "variation", payloadJson: { outsideAcceptedQuote: true }
    });
  } else if (input.kind === "selected_lines") {
    for (const line of summary.lines) {
      const qty = numberValue(input.selectedQtyByQuoteLineId?.[line.id]);
      if (qty <= 0) continue;
      if (qty - line.remainingQty > 0.0001) throw new Error(`${line.productName}: invoice quantity exceeds the remaining quantity (${line.remainingQty}).`);
      const created = quoteLineToInvoiceLine(line, qty);
      if (created.lineTotal > 0) lines.push(created);
    }
    if (!lines.length) throw new Error("Select at least one line or enter a quantity to invoice.");
  } else if (input.kind === "deposit" || input.kind === "progress") {
    const percent = numberValue(input.advancePercent);
    const requested = numberValue(input.advanceAmount);
    const amount = percent > 0 ? money(summary.quoteSubtotal * (percent / 100)) : money(requested);
    if (amount <= 0) throw new Error("Enter a deposit/progress percentage or amount greater than $0.");
    if (amount - summary.remainingSubtotal > 0.01) throw new Error(`The requested amount exceeds the remaining job value of $${summary.remainingSubtotal.toFixed(2)} ex GST.`);
    const defaultLabel = input.kind === "deposit" ? "Deposit" : "Progress invoice";
    const label = String(input.advanceLabel || defaultLabel).trim().slice(0, 255) || defaultLabel;
    lines.push({
      quoteLineId: null,
      productId: null,
      qty: 1,
      unitPrice: amount,
      lineTotal: amount,
      displayTitle: `${label} — ${summary.quote.jobName || summary.quote.quoteNumber || "job"}`,
      displaySubtitle: `Against accepted quote ${summary.quote.quoteNumber || ""}`.trim(),
      selectionSummary: null,
      sourceKind: "advance",
      payloadJson: { percentage: percent > 0 ? percent : null },
    });
  } else {
    for (const line of summary.lines) {
      if (line.remainingQty <= 0.0001) continue;
      const created = quoteLineToInvoiceLine(line, line.remainingQty);
      if (created.lineTotal > 0) lines.push(created);
    }
    // Fixed deposits/progress invoices are not tied to quote-line quantities. Credit them on the final/full-remaining invoice.
    if (summary.fixedAdvanceSubtotal > 0.01) {
      lines.push({
        quoteLineId: null,
        productId: null,
        qty: 1,
        unitPrice: -summary.fixedAdvanceSubtotal,
        lineTotal: -summary.fixedAdvanceSubtotal,
        displayTitle: "Less deposit / progress invoices already issued",
        displaySubtitle: `Previously invoiced against ${summary.quote.quoteNumber || "this job"}`,
        selectionSummary: null,
        sourceKind: "advance_credit",
        payloadJson: { fixedAdvanceSubtotal: summary.fixedAdvanceSubtotal },
      });
    }
    isFinal = true;
    if (!lines.length) throw new Error("There are no remaining quote lines to invoice.");
  }

  let subtotal = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  if (subtotal <= 0.01) throw new Error("This invoice would have no remaining value.");
  if (input.kind !== "variation" && subtotal - summary.remainingSubtotal > 0.02) {
    // Selected line invoices after a deposit must not take the cumulative job above the accepted value.
    throw new Error(`This invoice is $${subtotal.toFixed(2)} ex GST, but only $${summary.remainingSubtotal.toFixed(2)} remains to invoice on the job.`);
  }
  const taxTotal = money(subtotal * 0.1);
  const grandTotal = money(subtotal + taxTotal);
  const invoiceNumber = localInvoiceNumber();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<InvoiceRecord>(`
      INSERT INTO app.invoices (
        tenant_id, job_id, customer_id, quote_id, invoice_number, invoice_kind, status,
        issue_date, subtotal, tax_total, grand_total, myob_sync_status, source_order_uid,
        source_order_number, is_final, payload_json, created_by, created_at, updated_at
      ) VALUES (
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,'draft',now(),$7,$8,$9,'syncing',$10,$11,$12,$13::jsonb,$14::uuid,now(),now()
      ) RETURNING ${invoiceSelectSql()}
    `, [tenantId, input.jobId, summary.quote.linkedCustomerId, input.quoteId, invoiceNumber, input.kind, subtotal, taxTotal, grandTotal,
      input.sourceOrderUid ?? null, input.sourceOrderNumber ?? null, isFinal,
      JSON.stringify({ quoteNumber: summary.quote.quoteNumber, jobName: summary.quote.jobName, mode: input.kind }), input.createdBy ?? null]);
    const invoice = inserted.rows[0];
    if (!invoice) throw new Error("Invoice draft could not be created.");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      await client.query(`
        INSERT INTO app.invoice_lines (
          tenant_id, invoice_id, quote_line_id, product_id, sort_order, qty, unit_price, line_total,
          display_title, display_subtitle, selection_summary, source_kind, payload_json, created_at, updated_at
        ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,now(),now())
      `, [tenantId, invoice.id, line.quoteLineId, line.productId, index, line.qty, line.unitPrice, line.lineTotal,
        line.displayTitle, line.displaySubtitle ?? null, line.selectionSummary ?? null, line.sourceKind, JSON.stringify(line.payloadJson ?? {})]);
    }
    await client.query("COMMIT");
    return invoice;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markInvoiceSyncError(tenantId: string, invoiceId: string, error: string, payload?: Record<string, unknown>): Promise<void> {
  await ensureInvoiceWorkflowSchema();
  await pool.query(`
    UPDATE app.invoices SET myob_sync_status='error', myob_sync_error=$3,
      payload_json=COALESCE(payload_json,'{}'::jsonb) || $4::jsonb, updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `, [tenantId, invoiceId, error, JSON.stringify(payload ?? {})]);
}

export async function markInvoiceSynced(tenantId: string, invoiceId: string, input: {
  myobUid: string;
  myobNumber?: string | null;
  myobStatus?: string | null;
  balanceDue?: number | null;
  totalAmount?: number | null;
  status?: InvoiceStatus;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await ensureInvoiceWorkflowSchema();
  await pool.query(`
    UPDATE app.invoices SET
      invoice_number=COALESCE(NULLIF($3,''),invoice_number),
      status=$4::invoice_status,
      myob_uid=$5, myob_number=$3, myob_status=$6,
      myob_balance_due=$7, myob_total_amount=$8,
      myob_sync_status='synced', myob_sync_error=NULL, myob_synced_at=now(),
      payload_json=COALESCE(payload_json,'{}'::jsonb) || $9::jsonb, updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `, [tenantId, invoiceId, input.myobNumber ?? null, input.status ?? "issued", input.myobUid, input.myobStatus ?? null,
    input.balanceDue ?? null, input.totalAmount ?? null, JSON.stringify(input.payload ?? {})]);
}

export async function updateInvoiceFromMyob(tenantId: string, invoiceId: string, input: {
  myobNumber?: string | null;
  myobStatus?: string | null;
  balanceDue?: number | null;
  totalAmount?: number | null;
  status: InvoiceStatus;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await ensureInvoiceWorkflowSchema();
  await pool.query(`
    UPDATE app.invoices SET status=$3::invoice_status,
      invoice_number=COALESCE(NULLIF($4,''),invoice_number), myob_number=COALESCE(NULLIF($4,''),myob_number),
      myob_status=$5, myob_balance_due=$6, myob_total_amount=$7, myob_sync_status='synced',
      myob_sync_error=NULL, myob_synced_at=now(), payload_json=COALESCE(payload_json,'{}'::jsonb) || $8::jsonb, updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `, [tenantId, invoiceId, input.status, input.myobNumber ?? null, input.myobStatus ?? null,
    input.balanceDue ?? null, input.totalAmount ?? null, JSON.stringify(input.payload ?? {})]);
}

export async function markInvoiceEmailPending(tenantId: string, invoiceId: string, recipient: string): Promise<void> {
  await ensureInvoiceWorkflowSchema();
  const current = await getInvoiceById(tenantId, invoiceId);
  const previous = current ? invoiceEmailState(current) : null;
  await pool.query(`
    UPDATE app.invoices SET payload_json=COALESCE(payload_json,'{}'::jsonb) || $3::jsonb, updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `, [tenantId, invoiceId, JSON.stringify({ clientEmail: { status: "pending", to: recipient, sentAt: previous?.sentAt ?? null, messageId: previous?.messageId ?? null, lastError: null } })]);
}

export async function markInvoiceEmailSent(tenantId: string, invoiceId: string, input: { recipient: string; messageId?: string | null }): Promise<void> {
  await ensureInvoiceWorkflowSchema();
  await pool.query(`
    UPDATE app.invoices SET payload_json=COALESCE(payload_json,'{}'::jsonb) || $3::jsonb, updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `, [tenantId, invoiceId, JSON.stringify({ clientEmail: { status: "sent", to: input.recipient, sentAt: new Date().toISOString(), messageId: input.messageId ?? null, lastError: null } })]);
}

export async function markInvoiceEmailFailed(tenantId: string, invoiceId: string, input: { recipient?: string | null; error: string }): Promise<void> {
  await ensureInvoiceWorkflowSchema();
  const current = await getInvoiceById(tenantId, invoiceId);
  const previous = current ? invoiceEmailState(current) : null;
  await pool.query(`
    UPDATE app.invoices SET payload_json=COALESCE(payload_json,'{}'::jsonb) || $3::jsonb, updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `, [tenantId, invoiceId, JSON.stringify({ clientEmail: {
    status: "error",
    to: input.recipient ?? previous?.to ?? null,
    sentAt: previous?.sentAt ?? null,
    messageId: previous?.messageId ?? null,
    lastError: input.error,
  } })]);
}

export async function syncJobInvoiceStatusForTenant(tenantId: string, jobId: string, quoteId: string): Promise<string> {
  const summary = await getJobInvoiceSummary(tenantId, jobId, quoteId);
  const countable = summary.invoices.filter((invoice) => ["issued", "part_paid", "paid"].includes(invoice.status));
  const allClientSent = countable.length > 0 && countable.every((invoice) => { const state = invoiceEmailState(invoice); return state.status === "sent" || Boolean(state.sentAt); });
  let invoiceStatus = "not_invoiced";
  if (summary.remainingSubtotal <= 0.01 && countable.length) {
    invoiceStatus = countable.every((invoice) => invoice.status === "paid") ? "paid" : allClientSent ? "sent" : "invoiced";
  } else if (countable.length) {
    invoiceStatus = "partially_invoiced";
  }
  await pool.query(`
    UPDATE app.jobs SET invoice_status=$3::varchar,
      current_stage=CASE
        WHEN $3::varchar IN ('invoiced','sent','paid') AND current_stage IN ('invoice_required','invoiced') THEN 'invoiced'
        WHEN $3::varchar NOT IN ('invoiced','sent','paid') AND current_stage='invoiced' THEN 'invoice_required'
        ELSE current_stage
      END,
      current_stage_label=CASE
        WHEN $3::varchar='paid' AND current_stage IN ('invoice_required','invoiced') THEN 'Paid'
        WHEN $3::varchar='sent' AND current_stage IN ('invoice_required','invoiced') THEN 'Invoice sent'
        WHEN $3::varchar='invoiced' AND current_stage IN ('invoice_required','invoiced') THEN 'Invoiced'
        WHEN $3::varchar='partially_invoiced' AND current_stage IN ('invoice_required','invoiced') THEN 'Partially invoiced'
        WHEN $3::varchar NOT IN ('invoiced','sent','paid') AND current_stage='invoiced' THEN 'Invoice required'
        ELSE current_stage_label
      END,
      next_action=CASE
        WHEN $3::varchar='paid' AND current_stage IN ('invoice_required','invoiced') THEN 'Close job'
        WHEN $3::varchar='sent' AND current_stage IN ('invoice_required','invoiced') THEN 'Await payment'
        WHEN $3::varchar='invoiced' AND current_stage IN ('invoice_required','invoiced') THEN 'Send invoice to client'
        WHEN $3::varchar='partially_invoiced' AND current_stage IN ('invoice_required','invoiced') THEN 'Invoice remaining balance'
        WHEN $3::varchar NOT IN ('invoiced','sent','paid') AND current_stage='invoiced' THEN 'Create MYOB invoice'
        ELSE next_action
      END,
      current_href=CASE WHEN current_stage IN ('invoice_required','invoiced') THEN '/jobs/' || id::text || '/invoice' ELSE current_href END,
      updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `, [tenantId, jobId, invoiceStatus]);
  return invoiceStatus;
}
