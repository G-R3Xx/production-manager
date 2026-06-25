export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getCompanySettingsByTenantId } from "@/server/company";
import { getArtworkApprovalByPublicToken, getQuoteDraftById, listArtworkApprovalPages, markArtworkApprovalViewedByToken, type ArtworkApprovalPageRecord } from "@/server/quotes";
import { approveArtworkAction, requestArtworkChangesAction } from "./actions";
import { SignaturePad } from "./SignaturePad";
import { customerLogoUrl, getCustomerById } from "@/server/customers";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}


function isPdfArtwork(url: string | null | undefined, fileName?: string | null): boolean {
  const haystack = `${url ?? ""} ${fileName ?? ""}`.toLowerCase().split("?")[0];
  return haystack.endsWith(".pdf") || haystack.includes(".pdf ");
}

function proofArtworkPreview(page: ArtworkApprovalPageRecord, maxHeight = 480) {
  if (isPdfArtwork(page.imageUrl, page.fileName)) {
    return (
      <div style={{ width: "100%", minHeight: Math.min(maxHeight, 420), display: "grid", gap: 10 }}>
        <object data={page.imageUrl} type="application/pdf" style={{ width: "100%", height: Math.min(maxHeight, 420), border: "none", borderRadius: 12, background: "#fff" }}>
          <iframe src={page.imageUrl} title={page.title} style={{ width: "100%", height: Math.min(maxHeight, 420), border: "none", borderRadius: 12, background: "#fff" }} />
        </object>
        <a href={page.imageUrl} target="_blank" rel="noreferrer" style={{ color: "#6d28d9", fontWeight: 900, textDecoration: "none", textAlign: "center" }}>Open PDF proof</a>
      </div>
    );
  }

  return <img src={page.imageUrl} alt={page.title} style={{ width: "100%", height: "100%", maxHeight, objectFit: "contain", objectPosition: "center", display: "block" }} />;
}

function summaryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(mm|millimetres|millimeters)\b/g, "mm")
    .trim();
}

function tidySummaryLine(value: string): string {
  return value
    .replace(/^([a-z0-9 ]{2,24})\s+-\s+(.+)$/i, (full, prefix, rest) => {
      const prefixKey = summaryKey(String(prefix));
      const restKey = summaryKey(String(rest));
      return restKey.includes(prefixKey) ? String(rest).trim() : full;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSummaryLines(value: string | null | undefined, options?: { exclude?: RegExp }): string | null {
  const seen = new Set<string>();
  const lines = String(value ?? "")
    .split(/\n+/g)
    .map((line) => tidySummaryLine(line))
    .filter(Boolean)
    .filter((line) => !options?.exclude?.test(line))
    .filter((line) => {
      const key = summaryKey(line);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const specific = lines.filter((line, index, list) => {
    const key = summaryKey(line);
    return !list.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      const otherKey = summaryKey(other);
      return otherKey.length > key.length && otherKey.includes(key);
    });
  });

  return specific.length ? specific.join("\n") : null;
}

function cleanSubstrateSummary(value: string | null | undefined): string | null {
  return cleanSummaryLines(value, { exclude: /\b(laminate|lamination|lam-|gloss laminate|matt laminate|matte laminate|coating)\b/i });
}

function cleanFinishingSummary(value: string | null | undefined): string | null {
  return cleanSummaryLines(value);
}

function detailsList(page: ArtworkApprovalPageRecord): Array<{ label: string; value: string | null }> {
  const rows = [
    { label: "Qty", value: page.quantity },
    { label: "Size", value: page.sizeSummary },
    { label: "Colours", value: cleanSummaryLines(page.colourSummary) },
    { label: "Substrate / stock", value: cleanSubstrateSummary(page.substrateSummary) },
    { label: page.productionType === "small_format" ? "Small format" : "Install / finishing", value: page.productionType === "small_format" ? cleanSummaryLines(page.smallFormatSummary) : cleanFinishingSummary(page.installSummary) }
  ];
  return rows.filter((row) => String(row.value ?? "").trim().length > 0);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium" }).format(date);
}

const cardStyle = { background: "rgba(255,255,255,0.96)", border: "1px solid #e9d5ff", borderRadius: 26, padding: 22, boxShadow: "0 18px 48px rgba(88,28,135,0.08)" } as const;
const textareaStyle = { minHeight: 92, borderRadius: 14, border: "1px solid #ddd6fe", padding: "12px 14px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;
const inputStyle = { minHeight: 44, borderRadius: 14, border: "1px solid #ddd6fe", padding: "0 13px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;
const buttonStyle = { minHeight: 44, borderRadius: 14, border: "none", background: "#6d28d9", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 16px" } as const;

export default async function PublicArtworkApprovalPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const message = readParam(query, "message");
  const error = readParam(query, "error");
  const approval = await getArtworkApprovalByPublicToken(token);
  if (!approval) notFound();

  await markArtworkApprovalViewedByToken(token);

  const [pages, companySettings, sourceQuote] = await Promise.all([
    listArtworkApprovalPages(approval.id),
    getCompanySettingsByTenantId(approval.tenantId),
    getQuoteDraftById(approval.tenantId, approval.quoteId)
  ]);
  const linkedClient = sourceQuote?.linkedCustomerId ? await getCustomerById(approval.tenantId, sourceQuote.linkedCustomerId) : null;
  const clientLogoUrl = customerLogoUrl(linkedClient);
  const companyName = companySettings?.tradingName || companySettings?.companyLegalName || companySettings?.tenantName || "Production Manager";
  const companyLogoUrl = companySettings?.companyLogoUrl || "/brand/production-manager-logo.svg";
  const isApproved = approval.status === "approved";
  const hasChanges = approval.status === "changes_requested";

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg,#fbf8ff,#f3e8ff)", padding: 24 }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 18 }}>
        {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
        {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}

        <section style={{ ...cardStyle, display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "start" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
            <img src={companyLogoUrl} alt={`${companyName} logo`} style={{ width: 170, maxWidth: "100%", maxHeight: 92, height: "auto", objectFit: "contain", borderRadius: 16, background: "#fff" }} />
            <div style={{ display: "grid", gap: 8, minWidth: 260 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7c3aed" }}>Artwork approval from {companyName}</p>
              <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>{approval.projectName || approval.drawingTitle || approval.clientName}</h1>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <ClientLogoBadge logoUrl={clientLogoUrl} name={approval.clientName} size={44} radius={12} padding={4} />
                <p style={{ margin: 0, color: "#667085" }}>{approval.clientName}{approval.contactName ? ` · ${approval.contactName}` : ""}</p>
              </div>
              {approval.clientMessage ? <p style={{ margin: "4px 0 0", color: "#475467", lineHeight: 1.6 }}>{approval.clientMessage}</p> : <p style={{ margin: "4px 0 0", color: "#475467", lineHeight: 1.6 }}>Please review the proof pages below.</p>}
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
            <span style={{ borderRadius: 999, background: isApproved ? "#dcfae6" : hasChanges ? "#fff7ed" : "#f5f3ff", color: isApproved ? "#067647" : hasChanges ? "#c2410c" : "#6d28d9", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{approval.status.replace(/_/g, " ")}</span>
            {approval.revision ? <span style={{ color: "#667085", fontSize: 13 }}>Rev {approval.revision}{approval.drawingNumber ? ` · ${approval.drawingNumber}` : ""}</span> : null}
          </div>
        </section>

        <section style={{ display: "grid", gap: 18 }}>
          {pages.map((page, index) => (
            <article key={page.id} style={{ border: "1px solid #cbd5e1", borderRadius: 26, background: "#fff", overflow: "hidden", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", minHeight: 620, boxShadow: "0 18px 46px rgba(15,23,42,0.08)" }}>
              <div style={{ padding: 26, display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: "#64748b", fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>{page.signCode || `S${index + 1}`} · {String(page.productionType || "signage").replace(/_/g, " ")}</p>
                    <h2 style={{ margin: "4px 0 0", fontSize: 28 }}>{page.title}</h2>
                    {page.description ? <p style={{ margin: "4px 0 0", color: "#667085" }}>{page.description}</p> : null}
                  </div>
                  <a href={page.imageUrl} target="_blank" rel="noreferrer" style={{ color: "#6d28d9", fontWeight: 900 }}>Open full size</a>
                </div>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 20, background: "#fff", display: "grid", placeItems: "center", padding: 18, overflow: "hidden" }}>
                  {proofArtworkPreview(page, 480)}
                </div>
                {page.notes ? <p style={{ margin: 0, color: "#475467", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{page.notes}</p> : <span />}
              </div>
              <aside style={{ borderLeft: "1px solid #e2e8f0", background: "#f8fafc", padding: 20, display: "grid", alignContent: "space-between", gap: 14 }}>
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <ClientLogoBadge logoUrl={clientLogoUrl} name={approval.clientName} size={42} radius={12} padding={4} />
                    <span style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Client</p>
                      <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{approval.clientName}</strong>
                    </span>
                  </div>
                  {approval.siteAddress ? (
                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
                      <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 950 }}>Site / delivery</p>
                      <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: "#1e293b" }}>{approval.siteAddress}</p>
                    </div>
                  ) : null}
                  {detailsList(page).map((row) => (
                    <div key={row.label} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
                      <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 950 }}>{row.label}</p>
                      <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: "#1e293b" }}>{row.value}</p>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, fontSize: 12, color: "#64748b", display: "grid", gap: 4 }}>
                  <span>Page {index + 1} of {pages.length}</span>
                  {approval.revisionNote ? <span>{approval.revisionNote}</span> : null}
                  {approval.sentAt ? <span>Sent {formatDate(approval.sentAt)}</span> : null}
                </div>
              </aside>
            </article>
          ))}
          {pages.length === 0 ? <section style={cardStyle}><p style={{ margin: 0, color: "#667085" }}>No proof pages have been added yet.</p></section> : null}
        </section>

        {isApproved ? (
          <section style={{ ...cardStyle, borderColor: "#abefc6", display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0, color: "#067647" }}>Artwork approved</h2>
            {approval.clientSignatoryName ? <p style={{ margin: 0 }}>Approved by <strong>{approval.clientSignatoryName}</strong>{approval.approvedAt ? ` on ${formatDate(approval.approvedAt)}` : ""}</p> : null}
            {approval.clientResponseNotes ? <p style={{ margin: 0, color: "#475467", whiteSpace: "pre-wrap" }}>{approval.clientResponseNotes}</p> : null}
            {approval.clientSignatureDataUrl ? <img src={approval.clientSignatureDataUrl} alt="Signature" style={{ width: 280, maxWidth: "100%", border: "1px solid #dbe4f0", borderRadius: 16, background: "#fff" }} /> : null}
          </section>
        ) : (
          <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <div>
              <h2 style={{ margin: 0 }}>Respond to artwork</h2>
              <p style={{ margin: "6px 0 0", color: "#667085" }}>Approve the artwork or request changes. Your response goes straight back to Production Manager.</p>
            </div>
            <form action={approveArtworkAction} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="token" value={token} />
              <label style={{ display: "grid", gap: 7, fontSize: 13, fontWeight: 900, color: "#344054" }}>Your name<input name="signatoryName" placeholder="Name of person approving" style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 7, fontSize: 13, fontWeight: 900, color: "#344054" }}>Optional notes<textarea name="notes" placeholder="Optional approval notes" style={textareaStyle} /></label>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "#344054", fontWeight: 850 }}>
                <input name="confirmed" type="checkbox" style={{ width: 18, height: 18, marginTop: 3 }} />
                <span>I confirm that I have checked and approved all artwork, spelling, grammar, colour, size, quantity, substrate/stock and layout details for production.</span>
              </label>
              <div style={{ display: "grid", gap: 8 }}>
                <strong>Signature</strong>
                <SignaturePad />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="submit" style={{ ...buttonStyle, background: "#067647" }}>Approve artwork</button>
                <button formAction={requestArtworkChangesAction} type="submit" style={{ ...buttonStyle, background: "#c2410c" }}>Request changes</button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
