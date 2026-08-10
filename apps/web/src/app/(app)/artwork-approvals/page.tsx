import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  artworkQuoteLineKind,
  getArtworkApprovalById,
  getArtworkApprovalForQuote,
  getQuoteDraftById,
  listArtworkApprovalPages,
  listArtworkApprovalsForTenant,
  listQuoteDraftsForTenant,
  listQuoteLines,
  type ArtworkApprovalPageRecord,
  type QuoteLineRecord
} from "@/server/quotes";
import { customerLogoUrl, listCustomersForTenant } from "@/server/customers";
import { listEnquiriesForTenant } from "@/server/enquiries";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";
import { AutoSubmitProofInputs } from "./AutoSubmitProofInputs";
import {
  addArtworkApprovalPageFromPageAction,
  createArtworkApprovalFromQuoteAction,
  deleteArtworkApprovalAction,
  directApproveArtworkApprovalAction,
  prefillArtworkApprovalPagesFromQuoteAction,
  removeArtworkApprovalPageFromPageAction,
  replaceArtworkApprovalPageProofAction,
  restoreArtworkApprovalAction,
  saveArtworkApprovalDetailsAction,
  sendArtworkApprovalFromPageAction,
  startArtworkApprovalRevisionAction
} from "./actions";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

function publicArtworkUrl(token: string | null | undefined): string {
  return token ? `${appBaseUrl()}/public/artwork-approvals/${token}` : "";
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function formatDate(value: string | null | undefined, fallback = "Not yet"): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isPdfArtwork(url: string | null | undefined, fileName?: string | null): boolean {
  const haystack = `${url ?? ""} ${fileName ?? ""}`.toLowerCase().split("?")[0];
  return haystack.endsWith(".pdf") || haystack.includes(".pdf ");
}

function isPlaceholderProof(page: ArtworkApprovalPageRecord): boolean {
  return page.imageUrl.startsWith("data:image/svg+xml") || (!page.fileName && !page.imageStoragePath && /auto-created from quote line/i.test(page.notes ?? ""));
}

function isProofReadyForRevision(page: ArtworkApprovalPageRecord, revision: string | null | undefined): boolean {
  if (isPlaceholderProof(page)) return false;
  if (!revision) return true;
  return page.proofRevision === revision;
}

function proofArtworkPreview(page: ArtworkApprovalPageRecord, maxHeight = 300) {
  if (isPdfArtwork(page.imageUrl, page.fileName)) {
    return (
      <div style={{ width: "100%", minHeight: Math.min(maxHeight, 300), display: "grid", gap: 8 }}>
        <object data={page.imageUrl} type="application/pdf" style={{ width: "100%", height: Math.min(maxHeight, 300), border: "none", borderRadius: 10, background: "#fff" }}>
          <iframe src={page.imageUrl} title={page.title} style={{ width: "100%", height: Math.min(maxHeight, 300), border: "none", borderRadius: 10, background: "#fff" }} />
        </object>
        <a href={page.imageUrl} target="_blank" rel="noreferrer" style={{ color: "#4338ca", fontWeight: 900, textDecoration: "none", textAlign: "center", fontSize: 12 }}>Open PDF proof</a>
      </div>
    );
  }
  return <img src={page.imageUrl} alt={page.title} style={{ width: "100%", height: "100%", maxHeight, objectFit: "contain", objectPosition: "center", display: "block" }} />;
}

function statusTone(status: string): { bg: string; fg: string; border: string } {
  if (status === "approved") return { bg: "#ecfdf3", fg: "#067647", border: "#abefc6" };
  if (status === "changes_requested") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  if (status === "sent" || status === "viewed") return { bg: "#eef4ff", fg: "#3538cd", border: "#c7d7fe" };
  if (status === "deleted") return { bg: "#fff5f4", fg: "#b42318", border: "#fecaca" };
  return { bg: "#f8fafc", fg: "#475467", border: "#d0d5dd" };
}

function summaryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(mm|millimetres|millimeters)\b/g, "mm").trim();
}

function tidySummaryLine(value: string): string {
  return value.replace(/^([a-z0-9 ]{2,24})\s+-\s+(.+)$/i, (full, prefix, rest) => {
    const prefixKey = summaryKey(String(prefix));
    const restKey = summaryKey(String(rest));
    return restKey.includes(prefixKey) ? String(rest).trim() : full;
  }).replace(/\s+/g, " ").trim();
}

function cleanSummaryLines(value: string | null | undefined, options?: { exclude?: RegExp }): string | null {
  const seen = new Set<string>();
  const lines = String(value ?? "").split(/\n+/g).map(tidySummaryLine).filter(Boolean).filter((line) => !options?.exclude?.test(line)).filter((line) => {
    const key = summaryKey(line);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const specific = lines.filter((line, index, list) => {
    const key = summaryKey(line);
    return !list.some((other, otherIndex) => otherIndex !== index && summaryKey(other).length > key.length && summaryKey(other).includes(key));
  });
  return specific.length ? specific.join("\n") : null;
}

function detailsList(page: ArtworkApprovalPageRecord): Array<{ label: string; value: string | null }> {
  const finishing = page.productionType === "small_format" || page.productionType === "plan_printing" || page.productionType === "poster_printing"
    ? cleanSummaryLines(page.smallFormatSummary)
    : cleanSummaryLines(page.installSummary);
  return [
    { label: "Quantity", value: page.quantity },
    { label: "Finished size", value: page.sizeSummary },
    { label: "Colour / print", value: cleanSummaryLines(page.colourSummary) },
    { label: "Stock", value: cleanSummaryLines(page.substrateSummary, { exclude: /\b(laminate|lamination|coating)\b/i }) },
    { label: "Finishing", value: finishing }
  ].filter((row) => String(row.value ?? "").trim());
}

function lineIsInArtworkScope(line: QuoteLineRecord, usesLineResponses: boolean): boolean {
  if (!artworkQuoteLineKind(line)) return false;
  if (line.clientResponseStatus === "cancelled") return false;
  if (usesLineResponses && line.clientResponseStatus !== "approved") return false;
  return true;
}

const card = { border: "1px solid #dbe4f0", borderRadius: 22, background: "#fff", boxShadow: "0 12px 34px rgba(15,23,42,0.05)" } as const;
const input = { minHeight: 42, borderRadius: 12, border: "1px solid #cfd9e8", padding: "0 12px", width: "100%", boxSizing: "border-box", font: "inherit", background: "#fff" } as const;
const textarea = { minHeight: 76, borderRadius: 12, border: "1px solid #cfd9e8", padding: "10px 12px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;
const label = { display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#344054" } as const;
const primaryButton = { minHeight: 40, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 900, cursor: "pointer", padding: "0 14px" } as const;
const secondaryButton = { ...primaryButton, background: "#fff", color: "#344054", border: "1px solid #cfd9e8" } as const;

function WorkflowStep({ label, done, active }: { label: string; done: boolean; active?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span style={{ width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center", flex: "0 0 auto", background: done ? "#067647" : active ? "#3538cd" : "#e4e7ec", color: "#fff", fontSize: 11, fontWeight: 950 }}>{done ? "✓" : "•"}</span>
      <span style={{ fontSize: 12, fontWeight: 900, color: done || active ? "#101828" : "#98a2b3", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

export default async function ArtworkApprovalsPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const selectedParam = readParam(params, "selected");
  const quoteParam = readParam(params, "quote");
  const filter = readParam(params, "filter");

  const [quoteDrafts, allApprovals, clients, allEnquiries] = await Promise.all([
    listQuoteDraftsForTenant(activeTenant.tenantId),
    listArtworkApprovalsForTenant(activeTenant.tenantId, { includeDeleted: true }),
    listCustomersForTenant(activeTenant.tenantId),
    listEnquiriesForTenant(activeTenant.tenantId, { includeDeleted: true })
  ]);

  const deletedCount = allApprovals.filter((item) => item.status === "deleted").length;
  const statusPriority: Record<string, number> = { changes_requested: 0, draft: 1, viewed: 2, sent: 3, approved: 4, deleted: 5 };
  const approvals = (filter === "deleted" ? allApprovals.filter((item) => item.status === "deleted") : allApprovals.filter((item) => item.status !== "deleted"))
    .sort((a, b) => (statusPriority[a.status] ?? 9) - (statusPriority[b.status] ?? 9) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const [quoteForCreate, existingForQuote] = quoteParam ? await Promise.all([
    getQuoteDraftById(activeTenant.tenantId, quoteParam),
    getArtworkApprovalForQuote(activeTenant.tenantId, quoteParam)
  ]) : [null, null] as const;

  const selectedApproval = selectedParam ? await getArtworkApprovalById(activeTenant.tenantId, selectedParam) : existingForQuote ?? approvals[0] ?? null;
  const selectedQuote = selectedApproval ? await getQuoteDraftById(activeTenant.tenantId, selectedApproval.quoteId) : quoteForCreate;
  const [quoteLines, proofPages] = await Promise.all([
    selectedQuote ? listQuoteLines(selectedQuote.id) : Promise.resolve([]),
    selectedApproval ? listArtworkApprovalPages(selectedApproval.id) : Promise.resolve([])
  ]);

  const customerById = new Map(clients.map((client) => [client.id, client]));
  const enquiryById = new Map(allEnquiries.map((item) => [item.id, item]));
  const logoForQuote = (quote: typeof quoteDrafts[number] | null | undefined) => {
    const sourceEnquiry = quote?.enquiryId ? enquiryById.get(quote.enquiryId) : null;
    return sourceEnquiry?.clientLogoUrl || customerLogoUrl(quote?.linkedCustomerId ? customerById.get(quote.linkedCustomerId) : null);
  };

  const selectedLogo = logoForQuote(selectedQuote);
  const usesLineResponses = quoteLines.some((line) => line.clientResponseStatus && line.clientResponseStatus !== "pending");
  const inScopeLines = quoteLines.filter((line) => lineIsInArtworkScope(line, usesLineResponses));
  const inScopeLineIds = new Set(inScopeLines.map((line) => line.id));
  const linkedPages = new Map(proofPages.filter((page) => page.sourceQuoteLineId).map((page) => [page.sourceQuoteLineId as string, page]));
  const activeProofPages = proofPages.filter((page) => !page.sourceQuoteLineId || inScopeLineIds.has(page.sourceQuoteLineId));
  const outOfScopePages = proofPages.filter((page) => page.sourceQuoteLineId && !inScopeLineIds.has(page.sourceQuoteLineId));
  const missingLinePages = inScopeLines.filter((line) => !linkedPages.has(line.id));
  const currentRevision = selectedApproval?.revision ?? null;
  const realProofCount = activeProofPages.filter((page) => isProofReadyForRevision(page, currentRevision)).length;
  const readyToSend = activeProofPages.length > 0 && realProofCount === activeProofPages.length && missingLinePages.length === 0;
  const quoteTotal = quoteLines.filter((line) => line.clientResponseStatus !== "cancelled").reduce((sum, line) => sum + parseMoney(line.lineTotal), 0);
  const publicUrl = selectedApproval ? publicArtworkUrl(selectedApproval.publicToken) : "";
  const selectedTone = statusTone(selectedApproval?.status ?? "draft");
  const quoteOptions = quoteDrafts.filter((quote) => quote.id !== quoteForCreate?.id && !allApprovals.some((approval) => approval.quoteId === quote.id && approval.status !== "deleted"));
  const nextSignCode = `S${proofPages.length + 1}`;

  const quoteAccepted = selectedQuote?.status === "accepted";
  const sent = Boolean(selectedApproval?.sentAt);
  const viewed = Boolean(selectedApproval?.viewedAt);
  const approved = selectedApproval?.status === "approved";
  const changesRequested = selectedApproval?.status === "changes_requested";

  return (
    <div style={{ maxWidth: 1680, margin: "0 auto", display: "grid", gap: 14 }}>
      <style>{`
        .artwork-workspace-grid{display:grid;grid-template-columns:300px minmax(0,1fr);gap:14px;align-items:start}
        .artwork-detail-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:14px;align-items:start}
        .artwork-proof-row{display:grid;grid-template-columns:240px minmax(0,1fr) 250px;overflow:hidden;min-height:190px}
        .artwork-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
        @media(max-width:1180px){.artwork-detail-grid{grid-template-columns:1fr}.artwork-detail-grid>aside{position:static!important}.artwork-proof-row{grid-template-columns:210px minmax(0,1fr)}.artwork-proof-row>.proof-actions{grid-column:1/-1;border-left:0!important;border-top:1px solid #e4e7ec}}
        @media(max-width:900px){.artwork-workspace-grid{grid-template-columns:1fr}.artwork-workspace-grid>aside{position:static!important;max-height:none!important}.artwork-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.artwork-proof-row{grid-template-columns:1fr}.artwork-proof-row>.proof-preview{border-right:0!important;border-bottom:1px solid #e4e7ec}.artwork-proof-row>.proof-actions{grid-column:auto}}
      `}</style>
      {message ? <div style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 14, padding: "11px 14px", fontWeight: 800 }}>{message}</div> : null}
      {error ? <div style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 14, padding: "11px 14px", fontWeight: 800 }}>{error}</div> : null}

      <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "#667085", fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>Artwork</p>
          <h1 style={{ margin: "4px 0 0", fontSize: 34, letterSpacing: "-0.04em" }}>Artwork workspace</h1>
          <p style={{ margin: "5px 0 0", color: "#667085" }}>Build proofs from the approved quote scope, send one clean client link, manage revisions, then release approved artwork to production.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/artwork-approvals" style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", textDecoration: "none", background: filter === "deleted" ? "#fff" : "#f2f4f7" }}>Active</Link>
          <Link href="/artwork-approvals?filter=deleted" style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", textDecoration: "none", background: filter === "deleted" ? "#f2f4f7" : "#fff" }}>Deleted ({deletedCount})</Link>
        </div>
      </header>

      <div className="artwork-workspace-grid">
        <aside style={{ ...card, padding: 12, display: "grid", gap: 12, position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong>Approval jobs</strong>
            <span style={{ borderRadius: 999, background: "#f2f4f7", padding: "4px 8px", fontSize: 11, fontWeight: 900 }}>{approvals.length}</span>
          </div>
          <div style={{ display: "grid", gap: 7 }}>
            {approvals.map((approval) => {
              const tone = statusTone(approval.status);
              const quote = quoteDrafts.find((item) => item.id === approval.quoteId);
              const selected = selectedApproval?.id === approval.id;
              return (
                <Link key={approval.id} href={`/artwork-approvals?selected=${approval.id}${filter === "deleted" ? "&filter=deleted" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ border: selected ? "2px solid #344054" : "1px solid #e4e7ec", borderRadius: 14, padding: 10, background: selected ? "#f8fafc" : "#fff", display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                      <ClientLogoBadge logoUrl={logoForQuote(quote)} name={approval.clientName} size={34} radius={9} padding={3} />
                      <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{approval.clientName}</strong>
                    </div>
                    <span style={{ color: "#667085", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{quote?.quoteNumber ?? "Quote"} · {approval.projectName || "Artwork"}</span>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                      <span style={{ borderRadius: 999, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, padding: "3px 7px", fontSize: 10, fontWeight: 950 }}>{approval.status.replace(/_/g, " ")}</span>
                      <span style={{ color: "#98a2b3", fontSize: 10 }}>{formatDate(approval.updatedAt, "")}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
            {!approvals.length ? <p style={{ color: "#667085", fontSize: 12 }}>No artwork approvals in this list.</p> : null}
          </div>

          <details open={!selectedApproval || Boolean(quoteForCreate && !existingForQuote)} style={{ borderTop: "1px solid #e4e7ec", paddingTop: 10 }}>
            <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 12 }}>Create from quote</summary>
            <form action={createArtworkApprovalFromQuoteAction} style={{ display: "grid", gap: 8, marginTop: 9 }}>
              <select name="quoteId" defaultValue={quoteForCreate?.id ?? quoteOptions[0]?.id ?? ""} style={{ ...input, minHeight: 38, fontSize: 12 }}>
                {quoteForCreate && !existingForQuote ? <option value={quoteForCreate.id}>{quoteForCreate.quoteNumber ?? "Draft"} · {quoteForCreate.clientName}</option> : null}
                {quoteOptions.map((quote) => <option key={quote.id} value={quote.id}>{quote.quoteNumber ?? "Draft"} · {quote.clientName}</option>)}
              </select>
              <button type="submit" disabled={!quoteForCreate && quoteOptions.length === 0} style={{ ...primaryButton, minHeight: 38, opacity: !quoteForCreate && quoteOptions.length === 0 ? 0.5 : 1 }}>Create approval</button>
            </form>
          </details>
        </aside>

        <main style={{ minWidth: 0, display: "grid", gap: 14 }}>
          {selectedApproval && selectedQuote ? (
            <>
              <section style={{ ...card, overflow: "hidden" }}>
                <div style={{ padding: 18, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                    <ClientLogoBadge logoUrl={selectedLogo} name={selectedApproval.clientName} size={52} radius={14} padding={4} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, color: "#667085", fontSize: 12, fontWeight: 850 }}>{selectedQuote.quoteNumber ?? "Quote"} · {formatMoney(quoteTotal)} ex GST</p>
                      <h2 style={{ margin: "3px 0 0", fontSize: 27, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedApproval.projectName || selectedApproval.clientName}</h2>
                      <p style={{ margin: "4px 0 0", color: "#475467" }}>{selectedApproval.clientName}{selectedApproval.contactName ? ` · ${selectedApproval.contactName}` : ""}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{ borderRadius: 999, background: selectedTone.bg, color: selectedTone.fg, border: `1px solid ${selectedTone.border}`, padding: "7px 10px", fontSize: 11, fontWeight: 950 }}>{selectedApproval.status.replace(/_/g, " ")}</span>
                    {publicUrl ? <a href={`${publicUrl}?preview=1`} target="_blank" rel="noreferrer" style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Client preview</a> : null}
                    <Link href={`/quotes?selected=${selectedQuote.id}`} style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Source quote</Link>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e4e7ec", borderBottom: "1px solid #e4e7ec", padding: "11px 18px", display: "flex", justifyContent: "space-between", gap: 12, overflowX: "auto", background: "#fbfcfe" }}>
                  <WorkflowStep label="Quote approved" done={quoteAccepted} active={!quoteAccepted} />
                  <WorkflowStep label="Proofs ready" done={readyToSend} active={quoteAccepted && !readyToSend} />
                  <WorkflowStep label="Sent" done={sent} active={readyToSend && !sent} />
                  <WorkflowStep label="Viewed" done={viewed} active={sent && !viewed} />
                  <WorkflowStep label="Approved" done={approved} active={viewed && !approved} />
                </div>

                <div className="artwork-metrics" style={{ padding: 14 }}>
                  {[
                    ["Revision", selectedApproval.revision || "A"],
                    ["Proofs", `${realProofCount}/${activeProofPages.length || 0} ready`],
                    ["Recipient", selectedApproval.email || "No email"],
                    ["Sent", formatDate(selectedApproval.sentAt)],
                    ["Viewed", formatDate(selectedApproval.viewedAt)]
                  ].map(([k, v]) => <div key={k} style={{ background: "#f8fafc", borderRadius: 12, padding: "9px 10px", minWidth: 0 }}><p style={{ margin: 0, color: "#667085", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>{k}</p><strong style={{ fontSize: 12, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>{v}</strong></div>)}
                </div>
              </section>

              {changesRequested ? (
                <section style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 18, padding: 14, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <div><strong style={{ color: "#c2410c" }}>Client requested changes</strong><p style={{ margin: "4px 0 0", color: "#7c2d12", whiteSpace: "pre-wrap" }}>{selectedApproval.clientResponseNotes || "Review the proof changes, upload the new artwork, then start a new revision."}</p></div>
                  <form action={startArtworkApprovalRevisionAction}><input type="hidden" name="approvalId" value={selectedApproval.id} /><button type="submit" style={{ ...primaryButton, background: "#c2410c" }}>Start next revision</button></form>
                </section>
              ) : null}

              <div className="artwork-detail-grid">
                <div style={{ display: "grid", gap: 14 }}>
                  <section style={{ ...card, padding: 16, display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <h2 style={{ margin: 0, fontSize: 21 }}>Proofs</h2>
                        <p style={{ margin: "4px 0 0", color: "#667085", fontSize: 12 }}>One proof slot per approved artwork line. Replace the placeholder with the finished proof; production details remain tied to the quote line.</p>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {missingLinePages.length ? <span style={{ color: "#b54708", fontSize: 12, fontWeight: 900 }}>{missingLinePages.length} missing slot{missingLinePages.length === 1 ? "" : "s"}</span> : null}
                        <form action={prefillArtworkApprovalPagesFromQuoteAction}><input type="hidden" name="approvalId" value={selectedApproval.id} /><button type="submit" style={{ ...secondaryButton, background: missingLinePages.length ? "#fffaeb" : "#fff" }}>Sync quote lines</button></form>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      {activeProofPages.map((page, index) => {
                        const placeholder = isPlaceholderProof(page);
                        const currentProof = isProofReadyForRevision(page, currentRevision);
                        const needsRevision = !placeholder && !currentProof;
                        return (
                          <article key={page.id} className="artwork-proof-row" style={{ border: currentProof ? "1px solid #d0d5dd" : "1px solid #fdb022", borderRadius: 17, background: "#fff" }}>
                            <div className="proof-preview" style={{ background: "#f8fafc", borderRight: "1px solid #e4e7ec", padding: 10, display: "grid", placeItems: "center", minHeight: 188 }}>{proofArtworkPreview(page, 190)}</div>
                            <div style={{ padding: 13, minWidth: 0 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ borderRadius: 999, background: currentProof ? "#ecfdf3" : "#fffaeb", color: currentProof ? "#067647" : "#b54708", padding: "4px 7px", fontSize: 10, fontWeight: 950 }}>{placeholder ? "PROOF NEEDED" : needsRevision ? `UPDATE FOR REV ${currentRevision || ""}` : "READY"}</span>
                                <span style={{ color: "#667085", fontSize: 11, fontWeight: 900 }}>{page.signCode || `S${index + 1}`}</span>
                              </div>
                              <h3 style={{ margin: "7px 0 4px", fontSize: 18 }}>{page.title}</h3>
                              {page.description ? <p style={{ margin: "0 0 9px", color: "#667085", fontSize: 12, lineHeight: 1.4 }}>{page.description}</p> : null}
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "7px 12px" }}>
                                {detailsList(page).map((row) => <div key={row.label}><span style={{ display: "block", color: "#98a2b3", fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>{row.label}</span><span style={{ display: "block", color: "#344054", fontSize: 11, whiteSpace: "pre-wrap", marginTop: 2 }}>{row.value}</span></div>)}
                              </div>
                            </div>
                            <div className="proof-actions" style={{ borderLeft: "1px solid #e4e7ec", background: "#fcfcfd", padding: 11, display: "grid", alignContent: "center", gap: 8 }}>
                              <strong style={{ fontSize: 12 }}>{placeholder ? "Upload finished proof" : needsRevision ? `Upload revision ${currentRevision || ""}` : "Replace proof"}</strong>
                              <form action={replaceArtworkApprovalPageProofAction} encType="multipart/form-data" style={{ display: "grid", gap: 7 }}>
                                <input type="hidden" name="approvalId" value={selectedApproval.id} /><input type="hidden" name="pageId" value={page.id} />
                                <AutoSubmitProofInputs />
                              </form>
                              {!placeholder ? <a href={page.imageUrl} target="_blank" rel="noreferrer" style={{ ...secondaryButton, minHeight: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", fontSize: 11 }}>Open full size</a> : null}
                              <form action={removeArtworkApprovalPageFromPageAction}><input type="hidden" name="approvalId" value={selectedApproval.id} /><input type="hidden" name="pageId" value={page.id} /><button type="submit" style={{ ...secondaryButton, minHeight: 32, width: "100%", color: "#b42318", fontSize: 11 }}>Remove page</button></form>
                            </div>
                          </article>
                        );
                      })}
                      {!activeProofPages.length ? <div style={{ border: "1px dashed #cbd5e1", borderRadius: 16, padding: 30, textAlign: "center", color: "#667085" }}>No proof slots yet. Use <strong>Sync quote lines</strong> to create them from the approved quote scope.</div> : null}
                    </div>

                    {outOfScopePages.length ? <details><summary style={{ cursor: "pointer", color: "#667085", fontSize: 12, fontWeight: 900 }}>{outOfScopePages.length} out-of-scope / cancelled proof page{outOfScopePages.length === 1 ? "" : "s"}</summary><p style={{ color: "#667085", fontSize: 12 }}>These pages are preserved for history but are not counted as required artwork for this approval.</p></details> : null}
                  </section>

                  <details style={{ ...card, padding: 14 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 950 }}>Add an extra proof page</summary>
                    <form action={addArtworkApprovalPageFromPageAction} encType="multipart/form-data" style={{ display: "grid", gap: 10, marginTop: 12 }}>
                      <input type="hidden" name="approvalId" value={selectedApproval.id} />
                      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 100px 150px", gap: 8 }}>
                        <label style={label}>Item<input name="signCode" defaultValue={nextSignCode} style={input} /></label>
                        <label style={label}>Title<input name="title" placeholder="Extra proof page" style={input} /></label>
                        <label style={label}>Qty<input name="quantity" defaultValue="1" style={input} /></label>
                        <label style={label}>Type<select name="productionType" defaultValue="signage" style={input}><option value="signage">Signage</option><option value="small_format">Small format</option><option value="plan_printing">Plan printing</option><option value="poster_printing">Poster printing</option></select></label>
                      </div>
                      <AutoSubmitProofInputs autoSubmit={false} />
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
                        <label style={label}>Description<textarea name="description" style={textarea} /></label><label style={label}>Size<textarea name="sizeSummary" style={textarea} /></label>
                        <label style={label}>Stock<textarea name="substrateSummary" style={textarea} /></label><label style={label}>Finishing<textarea name="installSummary" style={textarea} /></label>
                      </div>
                      <button type="submit" style={primaryButton}>Add proof page</button>
                    </form>
                  </details>
                </div>

                <aside style={{ display: "grid", gap: 12, position: "sticky", top: 16 }}>
                  <section style={{ ...card, padding: 14, display: "grid", gap: 12 }}>
                    <div><h2 style={{ margin: 0, fontSize: 18 }}>Send / release</h2><p style={{ margin: "4px 0 0", color: "#667085", fontSize: 11 }}>The client link stays the same through revisions.</p></div>
                    {!readyToSend && selectedApproval.status !== "deleted" ? <div style={{ border: "1px solid #fedf89", background: "#fffaeb", borderRadius: 12, padding: 10, color: "#93370d", fontSize: 11 }}><strong>Not ready to send.</strong> Upload every required proof and sync any missing quote lines first.</div> : null}
                    {selectedApproval.status !== "deleted" ? (
                      <>
                        <form action={sendArtworkApprovalFromPageAction}><input type="hidden" name="approvalId" value={selectedApproval.id} /><button type="submit" disabled={!readyToSend || approved} style={{ ...primaryButton, width: "100%", opacity: !readyToSend || approved ? 0.45 : 1 }}>Mark sent to client</button></form>
                        {publicUrl && selectedApproval.email ? <a href={`mailto:${selectedApproval.email}?subject=${encodeURIComponent(`Artwork proof approval - ${selectedApproval.projectName || selectedApproval.clientName}`)}&body=${encodeURIComponent(`Hi ${selectedApproval.contactName || selectedApproval.clientName},\n\nPlease review the artwork proof using the link below:\n\n${publicUrl}\n\nThanks`)}`} style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Email client link</a> : null}
                        <form action={directApproveArtworkApprovalAction}><input type="hidden" name="approvalId" value={selectedApproval.id} /><button type="submit" disabled={!readyToSend || approved} style={{ ...secondaryButton, width: "100%", color: "#067647", opacity: !readyToSend || approved ? 0.45 : 1 }}>Approve internally</button></form>
                      </>
                    ) : <form action={restoreArtworkApprovalAction}><input type="hidden" name="approvalId" value={selectedApproval.id} /><button type="submit" style={{ ...primaryButton, width: "100%", background: "#067647" }}>Restore approval</button></form>}
                  </section>

                  <section style={{ ...card, padding: 14 }}>
                    <details open={!selectedApproval.projectName || !selectedApproval.email}>
                      <summary style={{ cursor: "pointer", fontWeight: 950 }}>Approval details</summary>
                      <form action={saveArtworkApprovalDetailsAction} style={{ display: "grid", gap: 9, marginTop: 12 }}>
                        <input type="hidden" name="approvalId" value={selectedApproval.id} />
                        <label style={label}>Client<input name="clientName" defaultValue={selectedApproval.clientName} style={input} /></label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><label style={label}>Contact<input name="contactName" defaultValue={selectedApproval.contactName ?? ""} style={input} /></label><label style={label}>Email<input name="email" type="email" defaultValue={selectedApproval.email ?? ""} style={input} /></label></div>
                        <label style={label}>Project / job name<input name="projectName" defaultValue={selectedApproval.projectName ?? ""} style={input} /></label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8 }}><label style={label}>Drawing / proof title<input name="drawingTitle" defaultValue={selectedApproval.drawingTitle ?? ""} style={input} /></label><label style={label}>Revision<input name="revision" defaultValue={selectedApproval.revision ?? "A"} style={input} /></label></div>
                        <label style={label}>Drawing number<input name="drawingNumber" defaultValue={selectedApproval.drawingNumber ?? "S1"} style={input} /></label>
                        <label style={label}>Revision note<input name="revisionNote" defaultValue={selectedApproval.revisionNote ?? "Issued for approval"} style={input} /></label>
                        <label style={label}>Client message<textarea name="clientMessage" defaultValue={selectedApproval.clientMessage ?? "Please review the proof pages below."} style={textarea} /></label>
                        <details><summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 900, color: "#667085" }}>More details</summary><div style={{ display: "grid", gap: 8, marginTop: 8 }}><label style={label}>Designer<input name="designerName" defaultValue={selectedApproval.designerName ?? user.email ?? ""} style={input} /></label><label style={label}>Site / delivery<textarea name="siteAddress" defaultValue={selectedApproval.siteAddress ?? ""} style={textarea} /></label><label style={label}>Internal notes<textarea name="internalNotes" defaultValue={selectedApproval.internalNotes ?? ""} style={textarea} /></label></div></details>
                        <button type="submit" style={{ ...primaryButton, width: "100%" }}>Save details</button>
                      </form>
                    </details>
                  </section>

                  {(selectedApproval.clientResponseNotes || selectedApproval.clientSignatoryName || selectedApproval.internallyApprovedAt) ? <section style={{ ...card, padding: 14, display: "grid", gap: 7 }}><strong>Latest response</strong>{selectedApproval.clientSignatoryName ? <span style={{ fontSize: 12 }}>Approved by <strong>{selectedApproval.clientSignatoryName}</strong></span> : null}{selectedApproval.internallyApprovedAt ? <span style={{ fontSize: 12 }}>Internally approved {formatDate(selectedApproval.internallyApprovedAt)} by {selectedApproval.internallyApprovedBy ?? "staff"}</span> : null}{selectedApproval.clientResponseNotes ? <p style={{ margin: 0, fontSize: 12, color: "#475467", whiteSpace: "pre-wrap" }}>{selectedApproval.clientResponseNotes}</p> : null}{selectedApproval.clientSignatureDataUrl ? <img src={selectedApproval.clientSignatureDataUrl} alt="Client signature" style={{ width: 210, maxWidth: "100%", border: "1px solid #e4e7ec", borderRadius: 10 }} /> : null}</section> : null}

                  <details style={{ ...card, padding: 14 }}><summary style={{ cursor: "pointer", color: "#b42318", fontWeight: 900, fontSize: 12 }}>Danger zone</summary><div style={{ marginTop: 10 }}><form action={deleteArtworkApprovalAction}><input type="hidden" name="approvalId" value={selectedApproval.id} /><button type="submit" style={{ ...secondaryButton, width: "100%", color: "#b42318" }}>Delete approval</button></form></div></details>
                </aside>
              </div>
            </>
          ) : (
            <section style={{ ...card, minHeight: 520, display: "grid", placeItems: "center", padding: 30, textAlign: "center" }}>
              <div style={{ maxWidth: 560 }}><h2 style={{ margin: 0, fontSize: 28 }}>Start an artwork approval</h2><p style={{ color: "#667085", lineHeight: 1.6 }}>Select an existing approval job from the left, or create one from a quote. Approved quote lines become proof slots automatically, so there is no need to retype the job specification.</p></div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
