export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getCompanySettingsByTenantId } from "@/server/company";
import { artworkQuoteLineInScope, getArtworkApprovalByPublicToken, getQuoteDraftById, listArtworkApprovalPages, listQuoteLines, markArtworkApprovalViewedByToken, quoteUsesLineResponses, type ArtworkApprovalPageRecord } from "@/server/quotes";
import { customerLogoUrl, getCustomerById } from "@/server/customers";
import { getEnquiryById } from "@/server/enquiries";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";
import { ArtworkResponsePanel } from "./ArtworkResponsePanel";

type PageProps = { params: Promise<{ token: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isPdfArtwork(url: string | null | undefined, fileName?: string | null): boolean {
  const haystack = `${url ?? ""} ${fileName ?? ""}`.toLowerCase().split("?")[0];
  return haystack.endsWith(".pdf") || haystack.includes(".pdf ");
}

function proofArtworkPreview(page: ArtworkApprovalPageRecord) {
  if (isPdfArtwork(page.imageUrl, page.fileName)) {
    return (
      <div style={{ width: "100%", minHeight: 500, display: "grid", gap: 10 }}>
        <object data={page.imageUrl} type="application/pdf" style={{ width: "100%", height: 540, border: "none", borderRadius: 12, background: "#fff" }}>
          <iframe src={page.imageUrl} title={page.title} style={{ width: "100%", height: 540, border: "none", borderRadius: 12, background: "#fff" }} />
        </object>
        <a href={page.imageUrl} target="_blank" rel="noreferrer" style={{ color: "#3538cd", fontWeight: 900, textDecoration: "none", textAlign: "center" }}>Open PDF full size</a>
      </div>
    );
  }
  return <img src={page.imageUrl} alt={page.title} style={{ width: "100%", maxHeight: 720, objectFit: "contain", objectPosition: "center", display: "block" }} />;
}

function summaryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(mm|millimetres|millimeters)\b/g, "mm").trim();
}

function tidySummaryLine(value: string): string {
  return value.replace(/^([a-z0-9 ]{2,24})\s+-\s+(.+)$/i, (full, prefix, rest) => summaryKey(String(rest)).includes(summaryKey(String(prefix))) ? String(rest).trim() : full).replace(/\s+/g, " ").trim();
}

function cleanSummaryLines(value: string | null | undefined, options?: { exclude?: RegExp }): string | null {
  const seen = new Set<string>();
  const lines = String(value ?? "").split(/\n+/g).map(tidySummaryLine).filter(Boolean).filter((line) => !options?.exclude?.test(line)).filter((line) => {
    const key = summaryKey(line);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const specific = lines.filter((line, index, list) => !list.some((other, otherIndex) => otherIndex !== index && summaryKey(other).length > summaryKey(line).length && summaryKey(other).includes(summaryKey(line))));
  return specific.length ? specific.join("\n") : null;
}

function detailsList(page: ArtworkApprovalPageRecord): Array<{ label: string; value: string | null }> {
  const finishing = page.productionType === "small_format" || page.productionType === "plan_printing" || page.productionType === "poster_printing" ? cleanSummaryLines(page.smallFormatSummary) : cleanSummaryLines(page.installSummary);
  return [
    { label: "Quantity", value: page.quantity },
    { label: "Finished size", value: page.sizeSummary },
    { label: "Colour / print", value: cleanSummaryLines(page.colourSummary) },
    { label: "Stock", value: cleanSummaryLines(page.substrateSummary, { exclude: /\b(laminate|lamination|coating)\b/i }) },
    { label: "Finishing", value: finishing }
  ].filter((row) => String(row.value ?? "").trim());
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium" }).format(date);
}

function statusTone(status: string) {
  if (status === "approved") return { bg: "#ecfdf3", fg: "#067647", border: "#abefc6", label: "Approved" };
  if (status === "changes_requested") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa", label: "Changes requested" };
  if (status === "viewed") return { bg: "#eef4ff", fg: "#3538cd", border: "#c7d7fe", label: "Under review" };
  return { bg: "#f8fafc", fg: "#475467", border: "#d0d5dd", label: "Awaiting review" };
}

export default async function PublicArtworkApprovalPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const message = readParam(query, "message");
  const error = readParam(query, "error");
  const previewMode = readParam(query, "preview") === "1";
  const approval = await getArtworkApprovalByPublicToken(token);
  if (!approval) notFound();

  await markArtworkApprovalViewedByToken(token);

  const [allPages, companySettings, sourceQuote, sourceLines] = await Promise.all([
    listArtworkApprovalPages(approval.id),
    getCompanySettingsByTenantId(approval.tenantId),
    getQuoteDraftById(approval.tenantId, approval.quoteId),
    listQuoteLines(approval.quoteId)
  ]);
  const usesLineResponses = quoteUsesLineResponses(sourceLines);
  const inScopeLineIds = new Set(sourceLines
    .filter((line) => artworkQuoteLineInScope(line, sourceQuote?.status, usesLineResponses))
    .map((line) => line.id));
  const pages = allPages.filter((page) => !page.sourceQuoteLineId || inScopeLineIds.has(page.sourceQuoteLineId));
  const [linkedClient, sourceEnquiry] = await Promise.all([
    sourceQuote?.linkedCustomerId ? getCustomerById(approval.tenantId, sourceQuote.linkedCustomerId) : Promise.resolve(null),
    sourceQuote?.enquiryId ? getEnquiryById(approval.tenantId, sourceQuote.enquiryId) : Promise.resolve(null)
  ]);

  const clientLogoUrl = sourceEnquiry?.clientLogoUrl || customerLogoUrl(linkedClient);
  const companyName = companySettings?.tradingName || companySettings?.companyLegalName || companySettings?.tenantName || "Production Manager";
  const companyLogoUrl = companySettings?.companyLogoUrl || "/brand/production-manager-logo.svg";
  const isApproved = approval.status === "approved";
  const hasChanges = approval.status === "changes_requested";
  const isOpenForResponse = approval.status === "sent" || approval.status === "viewed";
  const showProofs = approval.status !== "draft" || previewMode;
  const tone = statusTone(approval.status);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fa", padding: "20px 18px 46px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gap: 14 }}>
        <style>{`
          .public-artwork-head{display:grid;grid-template-columns:190px minmax(0,1fr) auto;gap:18px;align-items:center}
          .public-artwork-proof{display:grid;grid-template-columns:minmax(0,1fr) 300px;min-height:520px}
          @media(max-width:760px){.public-artwork-head{grid-template-columns:1fr}.public-artwork-head>div:last-child{justify-items:start!important}.public-artwork-proof{grid-template-columns:1fr;min-height:0}.public-artwork-proof>aside{border-left:0!important;border-top:1px solid #e4e7ec}.public-artwork-message{grid-template-columns:1fr!important}.public-artwork-message>a{width:fit-content}}
        `}</style>
        {message ? <div style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 13, padding: "11px 14px", fontWeight: 850 }}>{message}</div> : null}
        {error ? <div style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 13, padding: "11px 14px", fontWeight: 850 }}>{error}</div> : null}

        <section style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", boxShadow: "0 14px 40px rgba(15,23,42,0.07)", overflow: "hidden" }}>
          <div className="public-artwork-head" style={{ padding: 18 }}>
            <img src={companyLogoUrl} alt={`${companyName} logo`} style={{ width: 178, maxWidth: "100%", maxHeight: 92, objectFit: "contain", objectPosition: "left center" }} />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, color: "#667085", fontSize: 11, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>Artwork approval</p>
              <h1 style={{ margin: "4px 0 0", fontSize: 31, letterSpacing: "-0.035em", overflow: "hidden", textOverflow: "ellipsis" }}>{approval.projectName || approval.drawingTitle || approval.clientName}</h1>
              <div style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 8 }}><ClientLogoBadge logoUrl={clientLogoUrl} name={approval.clientName} size={36} radius={9} padding={3} /><span style={{ color: "#475467", fontSize: 13 }}>{approval.clientName}{approval.contactName ? ` · ${approval.contactName}` : ""}</span></div>
            </div>
            <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
              <span style={{ borderRadius: 999, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, padding: "6px 10px", fontSize: 11, fontWeight: 950 }}>{tone.label}</span>
              <strong style={{ fontSize: 13 }}>{sourceQuote?.quoteNumber || approval.drawingNumber || "Artwork proof"}</strong>
              <span style={{ color: "#667085", fontSize: 12 }}>Revision {approval.revision || "A"}{approval.sentAt ? ` · sent ${formatDate(approval.sentAt)}` : ""}</span>
            </div>
          </div>
          <div className="public-artwork-message" style={{ borderTop: "1px solid #e4e7ec", padding: "12px 18px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 14, alignItems: "center", background: "#fbfcfe" }}>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.5, fontSize: 13 }}>{approval.clientMessage || "Please review every proof page below. Check spelling, layout, size, material and finishing details before approving."}</p>
            {isOpenForResponse ? <a href="#respond" style={{ minHeight: 38, borderRadius: 11, padding: "0 14px", background: "#111827", color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center", fontWeight: 900, whiteSpace: "nowrap" }}>Go to decision</a> : null}
          </div>
        </section>

        {showProofs && pages.length > 1 ? <nav style={{ border: "1px solid #d0d5dd", borderRadius: 16, background: "#fff", padding: 10, display: "flex", gap: 7, overflowX: "auto" }}>{pages.map((page, index) => <a key={page.id} href={`#proof-${index + 1}`} style={{ border: "1px solid #e4e7ec", borderRadius: 10, padding: "8px 10px", textDecoration: "none", color: "#344054", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>{page.signCode || `S${index + 1}`} · {page.title}</a>)}</nav> : null}

        {showProofs ? <section style={{ display: "grid", gap: 14 }}>
          {pages.map((page, index) => (
            <article id={`proof-${index + 1}`} key={page.id} style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", boxShadow: "0 14px 40px rgba(15,23,42,0.06)", overflow: "hidden", scrollMarginTop: 18 }}>
              <header style={{ padding: "13px 16px", borderBottom: "1px solid #e4e7ec", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "#fbfcfe" }}>
                <div style={{ minWidth: 0 }}><p style={{ margin: 0, color: "#667085", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" }}>{page.signCode || `S${index + 1}`} · Proof {index + 1} of {pages.length}</p><h2 style={{ margin: "3px 0 0", fontSize: 20 }}>{page.title}</h2></div>
                <a href={page.imageUrl} target="_blank" rel="noreferrer" style={{ color: "#3538cd", fontWeight: 900, textDecoration: "none", fontSize: 12, whiteSpace: "nowrap" }}>Open full size ↗</a>
              </header>
              <div className="public-artwork-proof">
                <div style={{ padding: 18, display: "grid", placeItems: "center", background: "#fff", overflow: "hidden" }}>{proofArtworkPreview(page)}</div>
                <aside style={{ borderLeft: "1px solid #e4e7ec", background: "#f8fafc", padding: 16, display: "grid", alignContent: "start", gap: 11 }}>
                  {page.description ? <div><span style={{ color: "#98a2b3", fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>Description</span><p style={{ margin: "4px 0 0", color: "#344054", fontSize: 12, lineHeight: 1.45 }}>{page.description}</p></div> : null}
                  {detailsList(page).map((row) => <div key={row.label} style={{ borderTop: "1px solid #e4e7ec", paddingTop: 9 }}><span style={{ color: "#98a2b3", fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>{row.label}</span><p style={{ margin: "4px 0 0", color: "#1d2939", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{row.value}</p></div>)}
                  {page.notes && !/auto-created from quote line/i.test(page.notes) ? <div style={{ borderTop: "1px solid #e4e7ec", paddingTop: 9 }}><span style={{ color: "#98a2b3", fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>Notes</span><p style={{ margin: "4px 0 0", color: "#344054", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{page.notes}</p></div> : null}
                </aside>
              </div>
            </article>
          ))}
          {!pages.length ? <section style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", padding: 28, textAlign: "center", color: "#667085" }}>No proof pages are available yet.</section> : null}
        </section> : (
          <section style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", padding: 28, textAlign: "center", boxShadow: "0 14px 40px rgba(15,23,42,0.05)" }}>
            <h2 style={{ margin: 0 }}>A new artwork revision is being prepared</h2>
            <p style={{ margin: "7px auto 0", color: "#667085", maxWidth: 620, lineHeight: 1.55 }}>This link is still valid, but the current revision has not been issued yet. Please wait for our team to let you know when the updated proofs are ready to review.</p>
          </section>
        )}

        {isApproved ? (
          <section style={{ border: "1px solid #abefc6", borderRadius: 22, background: "#ecfdf3", padding: 18, display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0, color: "#067647" }}>Artwork approved for production</h2>
            <p style={{ margin: 0, color: "#344054" }}>{approval.clientSignatoryName ? <>Approved by <strong>{approval.clientSignatoryName}</strong>{approval.approvedAt ? ` on ${formatDate(approval.approvedAt)}` : ""}.</> : "This artwork has been approved."}</p>
            {approval.clientResponseNotes ? <p style={{ margin: 0, color: "#475467", whiteSpace: "pre-wrap" }}>{approval.clientResponseNotes}</p> : null}
            {approval.clientSignatureDataUrl ? <img src={approval.clientSignatureDataUrl} alt="Signature" style={{ width: 250, maxWidth: "100%", border: "1px solid #abefc6", borderRadius: 12, background: "#fff" }} /> : null}
          </section>
        ) : hasChanges ? (
          <section style={{ border: "1px solid #fed7aa", borderRadius: 22, background: "#fff7ed", padding: 18, display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0, color: "#c2410c" }}>Changes requested</h2>
            <p style={{ margin: 0, color: "#7c2d12" }}>Your change request has been sent back to our artwork team. We will update this same link when the next revision is ready.</p>
            {approval.clientResponseNotes ? <p style={{ margin: 0, color: "#9a3412", whiteSpace: "pre-wrap" }}><strong>Your notes:</strong> {approval.clientResponseNotes}</p> : null}
          </section>
        ) : isOpenForResponse ? <ArtworkResponsePanel token={token} pageCount={pages.length} /> : (
          <section style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", padding: 18, color: "#475467" }}>
            <strong>Preview only</strong>
            <p style={{ margin: "5px 0 0", lineHeight: 1.5 }}>This revision has not been issued for approval yet. You can review the proof, but approval controls will appear once the artwork team sends the revision.</p>
          </section>
        )}
      </div>
    </main>
  );
}
