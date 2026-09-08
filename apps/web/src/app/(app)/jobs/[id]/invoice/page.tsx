import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getJobById } from "@/server/jobs";
import { getJobInvoiceSummary, listInvoiceLines } from "@/server/invoicing";
import { InvoiceBuilder } from "./InvoiceBuilder";
import { refreshInvoiceAction, retryInvoiceAction } from "./actions";

type PageProps = { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };
const INVOICE_ROLES = new Set(["owner", "manager", "accounts"]);
const card = { background: "#fff", border: "1px solid #dfe7f2", borderRadius: 20, padding: 20, boxShadow: "0 12px 34px rgba(15,23,42,.05)" } as const;
const money = (value: number) => value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
}
function invoiceKindLabel(value: string) {
  if (value === "deposit") return "Deposit";
  if (value === "progress") return "Progress";
  if (value === "selected_lines") return "Selected / partial";
  if (value === "final_balance") return "Final balance";
  if (value === "variation") return "Variation / extra";
  return "Full / remaining";
}
function statusTone(status: string) {
  if (status === "paid") return { bg: "#ecfdf3", fg: "#067647", border: "#abefc6" };
  if (status === "part_paid") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  if (status === "issued") return { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" };
  if (status === "void") return { bg: "#f2f4f7", fg: "#475467", border: "#d0d5dd" };
  return { bg: "#fff1f2", fg: "#b42318", border: "#fecdd3" };
}

export default async function JobInvoicePage({ params, searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  const canCreate = INVOICE_ROLES.has(tenant.tenantRole);
  if (!canCreate) redirect("/dashboard?error=You%20do%20not%20have%20permission%20to%20view%20job%20invoicing");
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const message = readParam(query, "message");
  const error = readParam(query, "error");
  const job = await getJobById(tenant.tenantId, id);
  if (!job) return notFound();
  const quoteId = job.quoteId;
  if (!quoteId) redirect(`/jobs/${job.id}?error=${encodeURIComponent("This job does not have a quote to invoice.")}`);

  const summary = await getJobInvoiceSummary(tenant.tenantId, job.id, quoteId);
  const unresolvedDraft = summary.invoices.find((invoice) => invoice.status === "draft" && !invoice.myobUid && ["syncing", "error"].includes(invoice.myobSyncStatus));
  const invoiceLinePairs = await Promise.all(summary.invoices.map(async (invoice) => ({ invoice, lines: await listInvoiceLines(tenant.tenantId, invoice.id) })));

  return <div style={{ maxWidth: 1500, margin: "0 auto", display: "grid", gap: 16 }}>
    {message ? <div style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 14, padding: 12, fontWeight: 800 }}>{message}</div> : null}
    {error ? <div style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 14, padding: 12, fontWeight: 800 }}>{error}</div> : null}

    <section style={{ ...card, background: "linear-gradient(135deg,#fff 0%,#f7fbff 100%)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <p style={{ margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 950, letterSpacing: ".08em", textTransform: "uppercase" }}>Invoicing · {job.jobNumber}</p>
          <h1 style={{ margin: "5px 0 3px", fontSize: 34, letterSpacing: "-.035em" }}>{job.title}</h1>
          <p style={{ margin: 0, color: "#667085" }}>{job.clientName} · {summary.quote.quoteNumber || "Accepted quote"}{summary.quote.clientPurchaseOrderNumber ? ` · PO ${summary.quote.clientPurchaseOrderNumber}` : ""}{job.myobOrderNumber ? ` · MYOB Order ${job.myobOrderNumber}` : " · MYOB Order not linked"}</p>
        </div>
        <Link href={`/jobs/${job.id}`} style={{ minHeight: 42, display: "inline-flex", alignItems: "center", padding: "0 14px", border: "1px solid #d0d5dd", borderRadius: 12, color: "#344054", fontWeight: 900, textDecoration: "none", background: "#fff" }}>← Job workspace</Link>
      </div>
    </section>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
      {[
        ["Accepted job ex GST", money(summary.quoteSubtotal)],
        ["Previously invoiced", money(summary.previouslyInvoicedSubtotal)],
        ["Remaining ex GST", money(summary.remainingSubtotal)],
        ["Remaining inc GST", money(summary.remainingTotal)],
      ].map(([label, value]) => <div key={label} style={{ ...card, padding: 16 }}><div style={{ color: "#667085", fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{label}</div><strong style={{ display: "block", marginTop: 5, fontSize: 24 }}>{value}</strong></div>)}
    </section>

    {summary.fullyInvoiced ? <section style={{ ...card, borderColor: "#abefc6", background: "#ecfdf3", padding: 14 }}><strong style={{ color: "#067647", fontSize: 17 }}>✓ Accepted job value is fully invoiced</strong><p style={{ margin: "4px 0 0", color: "#067647", fontSize: 13 }}>You can still create an approved Variation / extra below. Refresh MYOB statuses in the history to keep payment state current.</p></section> : null}

    <section style={card}>
      <div style={{ marginBottom: 14 }}><p style={{ margin: 0, color: "#4f46e5", fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Create invoice</p><h2 style={{ margin: "4px 0 4px" }}>What are we invoicing?</h2><p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Full job, partial quantities, deposits/progress and approved variations stay tied to this job. MYOB remains the accounting source of truth.{summary.variationInvoicedSubtotal > 0.01 ? ` Variations invoiced to date: ${money(summary.variationInvoicedSubtotal)} ex GST.` : ""}</p></div>
      {unresolvedDraft ? <div style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 14, padding: 14, fontWeight: 800 }}>Invoice {unresolvedDraft.invoiceNumber} has not been confirmed in MYOB. Use <strong>Retry MYOB creation</strong> in Invoice history before creating another invoice for this job.</div> : <InvoiceBuilder
        jobId={job.id}
        quoteId={quoteId}
        quoteNumber={summary.quote.quoteNumber}
        lines={summary.lines}
        quoteSubtotal={summary.quoteSubtotal}
        remainingSubtotal={summary.remainingSubtotal}
        fixedAdvanceSubtotal={summary.fixedAdvanceSubtotal}
        canCreate={canCreate}
        hasInvoices={summary.invoices.some((invoice) => ["issued", "part_paid", "paid"].includes(invoice.status) && invoice.invoiceKind !== "variation")}
        fullyInvoiced={summary.fullyInvoiced}
      />}
    </section>

    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}><div><p style={{ margin: 0, color: "#4f46e5", fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Invoice history</p><h2 style={{ margin: "4px 0 0" }}>{summary.invoices.length ? `${summary.invoices.length} invoice${summary.invoices.length === 1 ? "" : "s"}` : "No invoices yet"}</h2></div></div>
      <div style={{ display: "grid", gap: 10 }}>
        {invoiceLinePairs.map(({ invoice, lines }) => {
          const tone = statusTone(invoice.status);
          return <details key={invoice.id} style={{ border: "1px solid #e4e7ec", borderRadius: 14, padding: 13, background: "#fff" }}>
            <summary style={{ cursor: "pointer", listStyle: "none", display: "grid", gridTemplateColumns: "1.2fr .8fr .8fr .8fr auto", gap: 12, alignItems: "center" }}>
              <span><strong style={{ fontSize: 15 }}>{invoice.myobNumber || invoice.invoiceNumber}</strong><small style={{ display: "block", color: "#667085", marginTop: 3 }}>{invoiceKindLabel(invoice.invoiceKind)} · {dateTime(invoice.issueDate || invoice.createdAt)}</small></span>
              <span><small style={{ display: "block", color: "#667085", fontWeight: 900 }}>EX GST</small><strong>{money(Number(invoice.subtotal))}</strong></span>
              <span><small style={{ display: "block", color: "#667085", fontWeight: 900 }}>TOTAL</small><strong>{money(Number(invoice.grandTotal))}</strong></span>
              <span><small style={{ display: "block", color: "#667085", fontWeight: 900 }}>BALANCE</small><strong>{invoice.myobBalanceDue != null ? money(Number(invoice.myobBalanceDue)) : "—"}</strong></span>
              <span style={{ borderRadius: 999, padding: "6px 9px", background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{invoice.myobSyncStatus === "error" ? "Sync error" : invoice.status.replace("_", " ")}</span>
            </summary>
            <div style={{ borderTop: "1px solid #eef2f6", marginTop: 12, paddingTop: 12, display: "grid", gap: 10 }}>
              {lines.map((line) => <div key={line.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 120px", gap: 10, fontSize: 13 }}><span><strong>{line.displayTitle}</strong>{line.displaySubtitle ? <small style={{ display: "block", color: "#667085", marginTop: 2 }}>{line.displaySubtitle}</small> : null}</span><span>Qty {Number(line.qty).toLocaleString("en-AU")}</span><span>{money(Number(line.unitPrice))} P/U</span><strong>{money(Number(line.lineTotal))}</strong></div>)}
              {invoice.myobSyncError ? <div style={{ color: "#b42318", background: "#fff5f4", border: "1px solid #fda29b", borderRadius: 10, padding: 10 }}>{invoice.myobSyncError}</div> : null}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {invoice.myobSyncStatus === "error" && !invoice.myobUid ? <form action={retryInvoiceAction}><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="invoiceId" value={invoice.id} /><button type="submit" style={{ minHeight: 38, border: 0, borderRadius: 10, padding: "0 12px", background: "#b42318", color: "#fff", fontWeight: 900 }}>Retry MYOB creation</button></form> : null}
                {invoice.myobUid ? <form action={refreshInvoiceAction}><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="invoiceId" value={invoice.id} /><button type="submit" style={{ minHeight: 38, border: "1px solid #d0d5dd", borderRadius: 10, padding: "0 12px", background: "#fff", color: "#344054", fontWeight: 900 }}>Refresh MYOB status</button></form> : null}
                {invoice.myobStatus ? <span style={{ alignSelf: "center", color: "#667085", fontSize: 12 }}>MYOB status: <strong>{invoice.myobStatus}</strong>{invoice.myobSyncedAt ? ` · synced ${dateTime(invoice.myobSyncedAt)}` : ""}</span> : null}
              </div>
            </div>
          </details>;
        })}
        {!summary.invoices.length ? <div style={{ border: "1px dashed #cfd9e8", borderRadius: 14, padding: 18, color: "#667085" }}>When the job is ready, create its first MYOB invoice above.</div> : null}
      </div>
    </section>
  </div>;
}
