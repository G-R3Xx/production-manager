export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getCompanySettingsByTenantId } from "@/server/company";
import { artworkApprovalStatusFingerprint, artworkQuoteLineInScope, getArtworkApprovalByPublicToken, getQuoteDraftById, listArtworkApprovalPages, listQuoteLines, markArtworkApprovalViewedByToken, quoteUsesLineResponses, type ArtworkApprovalPageRecord, type QuoteLineRecord } from "@/server/quotes";
import { customerLogoUrl, getCustomerById } from "@/server/customers";
import { getEnquiryById } from "@/server/enquiries";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";
import { ArtworkResponsePanel } from "./ArtworkResponsePanel";
import { ArtworkProofPreview } from "./ArtworkProofPreview";
import { ArtworkPageResponseControls } from "./ArtworkPageResponseControls";
import { PublicStatusAutoRefresh } from "@/components/PublicStatusAutoRefresh";
import { ArtworkSpecificationPanel } from "@/components/ArtworkSpecificationPanel";
import { applyPmsColoursToArtworkSpecification, buildArtworkSpecificationSnapshot, pmsColoursForRevision, specificationForRevision } from "@/lib/artworkSpecification";

type PageProps = { params: Promise<{ token: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isPdfArtwork(url: string | null | undefined, fileName?: string | null): boolean {
  const haystack = `${url ?? ""} ${fileName ?? ""}`.toLowerCase().split("?")[0];
  return haystack.endsWith(".pdf") || haystack.includes(".pdf ");
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

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function compactText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function materialName(material: Record<string, unknown> | null): string | null {
  if (!material) return null;
  return compactText(material.customerFacingName) || compactText(material.name) || null;
}

function friendlyValue(value: unknown): string | null {
  const raw = compactText(value);
  if (!raw) return null;
  return raw.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function summaryValues(line: QuoteLineRecord | null | undefined, label: string): string[] {
  if (!line?.optionSummary) return [];
  const wanted = summaryKey(label);
  return line.optionSummary
    .split(/\s+[·•]\s+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const colon = part.indexOf(":");
      if (colon <= 0) return [];
      const currentLabel = summaryKey(part.slice(0, colon));
      return currentLabel === wanted ? [part.slice(colon + 1).trim()] : [];
    })
    .filter(Boolean);
}

function structuredDetails(page: ArtworkApprovalPageRecord, line: QuoteLineRecord | null | undefined): Array<{ label: string; value: string | null }> {
  const snapshot = recordValue(line?.configurationSnapshot);
  const materials = recordValue(snapshot?.materialSnapshots);
  const main = recordValue(materials?.main);
  const media = recordValue(materials?.media);
  const backing = recordValue(materials?.backing);
  const laminate = recordValue(materials?.laminate);
  const smallStock = recordValue(materials?.smallStock);
  const smallCoating = recordValue(materials?.smallCoating);
  const flowType = compactText(snapshot?.flowType || page.productionType).toLowerCase();
  const printMethod = compactText(snapshot?.printMethod).toLowerCase();
  const mainLooksLikeRoll = Boolean(main && (Number(main.rollWidthMm ?? 0) > 0 || /^(?:lm|linear\s*m(?:etre)?s?)$/i.test(compactText(main.stockUom)) || /\b(roll|vinyl|banner|sav|media)\b/i.test(compactText(main.materialType))));
  const resolvedMedia = media ?? (printMethod === "roll_stock" && mainLooksLikeRoll ? main : null);
  const baseStock = flowType === "small_format" || flowType === "plan_printing" || flowType === "poster_printing" ? (smallStock ?? main) : (mainLooksLikeRoll && resolvedMedia === main ? null : main);
  const resolvedLaminate = laminate ?? smallCoating;

  const ink = friendlyValue(snapshot?.ink ?? snapshot?.smallPrintColour) || cleanSummaryLines(page.colourSummary);
  const sides = friendlyValue(snapshot?.sides ?? snapshot?.smallSides);
  const printDirection = compactText(snapshot?.printDirection);
  const printBits = [ink, sides && !/^single sided$/i.test(sides) ? sides : null, printDirection && !/^(?:standard|positive)$/i.test(printDirection) ? friendlyValue(printDirection) : null].filter(Boolean) as string[];

  const finishingFromQuote = [...summaryValues(line, "Finishing"), ...summaryValues(line, "Finishings")];
  const fallbackFinishing = page.productionType === "small_format" || page.productionType === "plan_printing" || page.productionType === "poster_printing"
    ? cleanSummaryLines(page.smallFormatSummary, { exclude: /\b(laminate|lamination|coating|stock|substrate|print setup|artwork supplied|finished size|quantity|qty)\b/i })
    : cleanSummaryLines(page.installSummary, { exclude: /\b(laminate|lamination|coating)\b/i });
  const finishing = finishingFromQuote.length ? cleanSummaryLines(finishingFromQuote.join("\n"), { exclude: /\b(laminate|lamination|coating)\b/i }) : fallbackFinishing;

  const stockFallback = cleanSummaryLines(page.substrateSummary, { exclude: /\b(laminate|lamination|coating|roll stock|media)\b/i });
  const rows = [
    { label: "Quantity", value: page.quantity },
    { label: "Finished size", value: page.sizeSummary },
    { label: "Stock", value: materialName(baseStock) || stockFallback },
    { label: "Print media", value: materialName(resolvedMedia) },
    { label: "Colour / print", value: printBits.length ? printBits.join(" · ") : cleanSummaryLines(page.colourSummary) },
    { label: "Backing", value: materialName(backing) },
    { label: "Laminate", value: materialName(resolvedLaminate) },
    { label: "Finishing", value: finishing }
  ];

  const seen = new Set<string>();
  return rows.filter((row) => {
    const value = compactText(row.value);
    if (!value || /^none$/i.test(value)) return false;
    const key = `${summaryKey(row.label)}:${summaryKey(value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function artworkSpecification(page: ArtworkApprovalPageRecord, line: QuoteLineRecord | null | undefined, approvalRevision: string | null | undefined, refreshFromSource = false) {
  const revision = page.proofRevision || approvalRevision;
  const base = line && refreshFromSource
    ? buildArtworkSpecificationSnapshot(line)
    : specificationForRevision(page.payloadJson, revision) ?? (line ? buildArtworkSpecificationSnapshot(line) : null);
  const pmsColours = pmsColoursForRevision(page.payloadJson, revision, refreshFromSource);
  return applyPmsColoursToArtworkSpecification(base, pmsColours);
}

function proofDescription(page: ArtworkApprovalPageRecord, line: QuoteLineRecord | null | undefined): string | null {
  // Quote-backed proof pages already have the production specification broken into dedicated
  // fields. Do not repeat the entire option/process summary as a giant description.
  if (line) return null;
  return cleanSummaryLines(page.description);
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

function pageStatusTone(status: ArtworkApprovalPageRecord["clientResponseStatus"]) {
  if (status === "approved") return { bg: "#ecfdf3", fg: "#067647", border: "#abefc6", label: "✓ Page approved" };
  if (status === "changes_requested") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa", label: "Changes requested" };
  return { bg: "#f8fafc", fg: "#475467", border: "#d0d5dd", label: "Awaiting decision" };
}

function watermarkText(companyName: string, quoteNumber: string | null | undefined): string {
  const brand = String(companyName || "Tender Edge").trim().toUpperCase();
  const quote = String(quoteNumber || "").trim();
  return quote ? `PROOF ONLY • ${brand} • ${quote}` : `PROOF ONLY • ${brand}`;
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
  const sourceLineById = new Map(sourceLines.map((line) => [line.id, line]));
  const [linkedClient, sourceEnquiry] = await Promise.all([
    sourceQuote?.linkedCustomerId ? getCustomerById(approval.tenantId, sourceQuote.linkedCustomerId) : Promise.resolve(null),
    sourceQuote?.enquiryId ? getEnquiryById(approval.tenantId, sourceQuote.enquiryId) : Promise.resolve(null)
  ]);

  const clientLogoUrl = sourceEnquiry?.clientLogoUrl || customerLogoUrl(linkedClient);
  const companyName = companySettings?.tradingName || companySettings?.companyLegalName || companySettings?.tenantName || "Production Manager";
  const proofWatermarkText = watermarkText(companySettings?.tenantName || companySettings?.tradingName || companyName, sourceQuote?.quoteNumber || approval.drawingNumber);
  const companyLogoUrl = companySettings?.companyLogoUrl || "/brand/production-manager-logo.svg";
  const isApproved = approval.status === "approved";
  const hasChanges = approval.status === "changes_requested";
  const isOpenForResponse = approval.status === "sent" || approval.status === "viewed" || approval.status === "changes_requested";
  const showProofs = approval.status !== "draft" || previewMode;
  const tone = statusTone(approval.status);
  const approvedPageCount = pages.filter((page) => page.clientResponseStatus === "approved").length;
  const changesPageCount = pages.filter((page) => page.clientResponseStatus === "changes_requested").length;
  const allPagesApproved = pages.length > 0 && approvedPageCount === pages.length;
  const statusFingerprint = artworkApprovalStatusFingerprint(approval, allPages);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fa", padding: "20px 18px 46px" }}>
      <PublicStatusAutoRefresh statusUrl={`/api/public/artwork-approvals/${encodeURIComponent(token)}/status`} fingerprint={statusFingerprint} />
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gap: 14 }}>
        <style>{`
          .public-artwork-head{display:grid;grid-template-columns:190px minmax(0,1fr) auto;gap:18px;align-items:center}
          .public-artwork-proof{display:grid;grid-template-columns:minmax(0,1fr) 360px;min-height:520px}
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
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.5, fontSize: 13 }}>{approval.clientMessage || "Please review every proof page below. Check spelling, layout, required PMS colour matching, size, materials, laminate/finish, mounting and pickup / delivery / install details before approving."}</p>
            {isOpenForResponse ? <a href="#respond" style={{ minHeight: 38, borderRadius: 11, padding: "0 14px", background: "#111827", color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center", fontWeight: 900, whiteSpace: "nowrap" }}>Go to decision</a> : null}
          </div>
        </section>

        {isOpenForResponse && allPagesApproved && !hasChanges ? (
          <section style={{ border: "2px solid #12b76a", borderRadius: 18, background: "#ecfdf3", padding: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap", boxShadow: "0 10px 26px rgba(6,118,71,0.12)" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <strong style={{ color: "#067647", fontSize: 18 }}>✓ All proof pages approved</strong>
              <span style={{ color: "#344054", fontSize: 13 }}>One final production sign-off is required before the artwork is released.</span>
            </div>
            <a href="#respond" style={{ minHeight: 44, borderRadius: 12, padding: "0 16px", background: "#067647", color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center", fontWeight: 950, whiteSpace: "nowrap" }}>Complete final approval →</a>
          </section>
        ) : null}

        {showProofs && pages.length > 1 ? <nav style={{ border: "1px solid #d0d5dd", borderRadius: 16, background: "#fff", padding: 10, display: "flex", gap: 7, overflowX: "auto" }}>{pages.map((page, index) => { const pageTone = pageStatusTone(page.clientResponseStatus); return <a key={page.id} href={`#proof-${index + 1}`} style={{ border: `1px solid ${pageTone.border}`, borderRadius: 10, padding: "8px 10px", textDecoration: "none", color: pageTone.fg, background: pageTone.bg, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>{page.clientResponseStatus === "approved" ? "✓ " : page.clientResponseStatus === "changes_requested" ? "! " : ""}{page.signCode || `S${index + 1}`} · {page.title}</a>; })}</nav> : null}

        {showProofs ? <section style={{ display: "grid", gap: 14 }}>
          {pages.map((page, index) => {
            const pageTone = pageStatusTone(page.clientResponseStatus);
            return (
            <article id={`proof-${index + 1}`} key={page.id} style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", boxShadow: "0 14px 40px rgba(15,23,42,0.06)", overflow: "hidden", scrollMarginTop: 18 }}>
              <header style={{ padding: "13px 16px", borderBottom: "1px solid #e4e7ec", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "#fbfcfe" }}>
                <div style={{ minWidth: 0 }}><p style={{ margin: 0, color: "#667085", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" }}>{page.signCode || `S${index + 1}`} · Proof {index + 1} of {pages.length}</p><h2 style={{ margin: "3px 0 0", fontSize: 20 }}>{page.title}</h2></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}><span style={{ borderRadius: 999, border: `1px solid ${pageTone.border}`, background: pageTone.bg, color: pageTone.fg, padding: "5px 8px", fontSize: 10, fontWeight: 950 }}>{pageTone.label}</span><span style={{ color: "#667085", fontWeight: 900, fontSize: 12, whiteSpace: "nowrap" }}>Watermarked proof preview</span></div>
              </header>
              <div className="public-artwork-proof">
                <div style={{ padding: 18, display: "grid", placeItems: "center", background: "#eef2f6", overflow: "hidden" }}><ArtworkProofPreview url={page.imageUrl} title={page.title} isPdf={isPdfArtwork(page.imageUrl, page.fileName)} watermarkText={proofWatermarkText} /></div>
                <aside style={{ borderLeft: "1px solid #e4e7ec", background: "#f8fafc", padding: 16, display: "grid", alignContent: "start", gap: 11 }}>
                  {(() => {
                    const sourceLine = page.sourceQuoteLineId ? sourceLineById.get(page.sourceQuoteLineId) : null;
                    const specification = artworkSpecification(page, sourceLine, approval.revision, approval.status === "draft");
                    return specification?.items.length
                      ? <ArtworkSpecificationPanel items={specification.items} />
                      : <>{structuredDetails(page, sourceLine).map((row) => <div key={row.label} style={{ borderTop: "1px solid #e4e7ec", paddingTop: 9 }}><span style={{ color: "#98a2b3", fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>{row.label}</span><p style={{ margin: "4px 0 0", color: "#1d2939", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{row.value}</p></div>)}</>;
                  })()}
                  {proofDescription(page, page.sourceQuoteLineId ? sourceLineById.get(page.sourceQuoteLineId) : null) ? <div><span style={{ color: "#98a2b3", fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>Description</span><p style={{ margin: "4px 0 0", color: "#344054", fontSize: 12, lineHeight: 1.45 }}>{proofDescription(page, page.sourceQuoteLineId ? sourceLineById.get(page.sourceQuoteLineId) : null)}</p></div> : null}
                  {page.notes && !/auto-created from quote line/i.test(page.notes) ? <div style={{ borderTop: "1px solid #e4e7ec", paddingTop: 9 }}><span style={{ color: "#98a2b3", fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>Notes</span><p style={{ margin: "4px 0 0", color: "#344054", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{page.notes}</p></div> : null}
                  <ArtworkPageResponseControls token={token} pageId={page.id} status={page.clientResponseStatus} notes={page.clientResponseNotes} isOpen={isOpenForResponse} />
                </aside>
              </div>
            </article>
            );
          })}
          {!pages.length ? <section style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", padding: 28, textAlign: "center", color: "#667085" }}>No proof pages are available yet.</section> : null}
        </section> : (
          <section style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", padding: 28, textAlign: "center", boxShadow: "0 14px 40px rgba(15,23,42,0.05)" }}>
            <h2 style={{ margin: 0 }}>A new artwork revision is being prepared</h2>
            <p style={{ margin: "7px auto 0", color: "#667085", maxWidth: 620, lineHeight: 1.55 }}>This link is still valid, but the current revision has not been issued yet. Please wait for our team to let you know when the updated proofs are ready to review.</p>
          </section>
        )}

        {hasChanges ? (
          <section style={{ border: "1px solid #fed7aa", borderRadius: 22, background: "#fff7ed", padding: 18, display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0, color: "#c2410c" }}>Changes requested on {changesPageCount} proof page{changesPageCount === 1 ? "" : "s"}</h2>
            <p style={{ margin: 0, color: "#7c2d12" }}>Each request is shown beside the affected proof. You can continue deciding the remaining pages while our artwork team reviews those notes.</p>
          </section>
        ) : null}

        {isApproved ? (
          <section style={{ border: "1px solid #abefc6", borderRadius: 22, background: "#ecfdf3", padding: 18, display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0, color: "#067647" }}>Artwork approved for production</h2>
            <p style={{ margin: 0, color: "#344054" }}>{approval.clientSignatoryName ? <>Approved by <strong>{approval.clientSignatoryName}</strong>{approval.approvedAt ? ` on ${formatDate(approval.approvedAt)}` : ""}.</> : "This artwork has been approved."}</p>
            {approval.clientResponseNotes ? <p style={{ margin: 0, color: "#475467", whiteSpace: "pre-wrap" }}>{approval.clientResponseNotes}</p> : null}
            {approval.clientSignatureDataUrl ? <img src={approval.clientSignatureDataUrl} alt="Signature" style={{ width: 250, maxWidth: "100%", border: "1px solid #abefc6", borderRadius: 12, background: "#fff" }} /> : null}
          </section>
        ) : isOpenForResponse ? <ArtworkResponsePanel token={token} pageCount={pages.length} approvedPageCount={approvedPageCount} /> : (
          <section style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", padding: 18, color: "#475467" }}>
            <strong>Preview only</strong>
            <p style={{ margin: "5px 0 0", lineHeight: 1.5 }}>This revision has not been issued for approval yet. You can review the proof, but approval controls will appear once the artwork team sends the revision.</p>
          </section>
        )}
      </div>
    </main>
  );
}
