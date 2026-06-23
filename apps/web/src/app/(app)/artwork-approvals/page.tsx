import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  getArtworkApprovalById,
  getArtworkApprovalForQuote,
  getQuoteDraftById,
  listArtworkApprovalPages,
  listArtworkApprovalsForTenant,
  listQuoteDraftsForTenant,
  listQuoteLines,
  type ArtworkApprovalPageRecord
} from "@/server/quotes";
import {
  addArtworkApprovalPageFromPageAction,
  createArtworkApprovalFromQuoteAction,
  directApproveArtworkApprovalAction,
  removeArtworkApprovalPageFromPageAction,
  saveArtworkApprovalDetailsAction,
  sendArtworkApprovalFromPageAction
} from "./actions";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

function publicArtworkUrl(token: string | null | undefined): string {
  if (!token) return "";
  const base = appBaseUrl();
  return `${base}/public/artwork-approvals/${token}`;
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusTone(status: string): { bg: string; fg: string; border: string } {
  if (status === "approved") return { bg: "#dcfae6", fg: "#067647", border: "#abefc6" };
  if (status === "sent" || status === "viewed") return { bg: "#eef4ff", fg: "#3538cd", border: "#c7d7fe" };
  if (status === "changes_requested") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  return { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe" };
}

function detailsList(page: ArtworkApprovalPageRecord): Array<{ label: string; value: string | null }> {
  const rows = [
    { label: "Qty", value: page.quantity },
    { label: "Size", value: page.sizeSummary },
    { label: "Colours", value: page.colourSummary },
    { label: "Substrate / stock", value: page.substrateSummary },
    { label: page.productionType === "small_format" ? "Small format" : "Install / finishing", value: page.productionType === "small_format" ? page.smallFormatSummary : page.installSummary }
  ];

  return rows.filter((row) => String(row.value ?? "").trim().length > 0);
}

const cardStyle = {
  border: "1px solid #dbe4f0",
  borderRadius: 24,
  background: "rgba(255,255,255,0.94)",
  boxShadow: "0 18px 44px rgba(15,23,42,0.06)",
  padding: 18
} as const;

const inputStyle = {
  minHeight: 44,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "0 13px",
  width: "100%",
  boxSizing: "border-box",
  font: "inherit",
  background: "#fff"
} as const;

const textareaStyle = {
  minHeight: 94,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "12px 14px",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: "#fff"
} as const;

const labelStyle = {
  display: "grid",
  gap: 7,
  fontSize: 12,
  fontWeight: 900,
  color: "#344054"
} as const;

const buttonStyle = {
  minHeight: 44,
  borderRadius: 14,
  border: "none",
  background: "#6d28d9",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  padding: "0 16px"
} as const;

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "#fff",
  color: "#344054",
  border: "1px solid #cfd9e8"
} as const;

export default async function ArtworkApprovalsPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const selectedParam = readParam(params, "selected");
  const quoteParam = readParam(params, "quote");

  const [quoteDrafts, approvals] = await Promise.all([
    listQuoteDraftsForTenant(activeTenant.tenantId),
    listArtworkApprovalsForTenant(activeTenant.tenantId)
  ]);

  const quoteForCreate = quoteParam ? await getQuoteDraftById(activeTenant.tenantId, quoteParam) : null;
  const existingForQuote = quoteParam ? await getArtworkApprovalForQuote(activeTenant.tenantId, quoteParam) : null;
  const selectedApproval = selectedParam
    ? await getArtworkApprovalById(activeTenant.tenantId, selectedParam)
    : existingForQuote ?? approvals[0] ?? null;
  const selectedQuote = selectedApproval ? await getQuoteDraftById(activeTenant.tenantId, selectedApproval.quoteId) : quoteForCreate;
  const [quoteLines, proofPages] = await Promise.all([
    selectedQuote ? listQuoteLines(selectedQuote.id) : Promise.resolve([]),
    selectedApproval ? listArtworkApprovalPages(selectedApproval.id) : Promise.resolve([])
  ]);

  const quoteTotal = quoteLines.reduce((sum, line) => sum + parseMoney(line.lineTotal), 0);
  const publicUrl = selectedApproval ? publicArtworkUrl(selectedApproval.publicToken) : "";
  const quoteOptions = quoteDrafts.filter((quote) => quote.id !== quoteForCreate?.id && !approvals.some((approval) => approval.quoteId === quote.id));
  const selectedTone = selectedApproval ? statusTone(selectedApproval.status) : statusTone("draft");
  const pageCodes = new Set(proofPages.map((page) => page.signCode).filter(Boolean));
  const nextSignCode = `S${pageCodes.size + 1}`;

  return (
    <div style={{ maxWidth: 1540, margin: "0 auto", display: "grid", gap: 18 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 8, background: "linear-gradient(135deg, #ffffff 0%, #fbf7ff 58%, #f3e8ff 100%)" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7c3aed" }}>Artwork approvals</p>
        <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>Artwork approval portal</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>This is now the in-app version of the old approval portal: proof pages, client details, approval links, direct approve, signatures and production notes all live away from the quote builder.</p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "365px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 14 }}>
          <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <h2 style={{ margin: 0 }}>Create from quote</h2>
              <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Accepted quotes can create an artwork approval automatically, but you can also start one manually here.</p>
            </div>
            {quoteParam && quoteForCreate && existingForQuote ? (
              <Link href={`/artwork-approvals?selected=${existingForQuote.id}`} style={{ ...secondaryButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>Open existing approval for this quote</Link>
            ) : null}
            <form action={createArtworkApprovalFromQuoteAction} style={{ display: "grid", gap: 10 }}>
              <select name="quoteId" defaultValue={quoteForCreate?.id ?? quoteOptions[0]?.id ?? ""} style={inputStyle}>
                {quoteForCreate && !existingForQuote ? <option value={quoteForCreate.id}>{quoteForCreate.quoteNumber ?? "Draft quote"} · {quoteForCreate.clientName}</option> : null}
                {quoteOptions.map((quote) => (
                  <option key={quote.id} value={quote.id}>{quote.quoteNumber ?? "Draft quote"} · {quote.clientName} · {quote.status.replace(/_/g, " ")}</option>
                ))}
              </select>
              <button type="submit" disabled={!quoteForCreate && quoteOptions.length === 0} style={{ ...buttonStyle, background: !quoteForCreate && quoteOptions.length === 0 ? "#94a3b8" : "#6d28d9" }}>Create approval pack</button>
            </form>
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0 }}>Approval packs</h2>
              <span style={{ borderRadius: 999, background: "#f5f3ff", color: "#6d28d9", padding: "5px 9px", fontSize: 12, fontWeight: 950 }}>{approvals.length}</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {approvals.map((approval) => {
                const tone = statusTone(approval.status);
                const quote = quoteDrafts.find((item) => item.id === approval.quoteId);
                const isSelected = selectedApproval?.id === approval.id;

                return (
                  <Link key={approval.id} href={`/artwork-approvals?selected=${approval.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ border: isSelected ? "1px solid #a78bfa" : "1px solid #e4e7ec", borderRadius: 18, padding: 12, background: isSelected ? "#faf5ff" : "#fff", display: "grid", gap: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{approval.clientName}</strong>
                        <span style={{ borderRadius: 999, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, padding: "4px 8px", fontSize: 11, fontWeight: 950, whiteSpace: "nowrap" }}>{approval.status.replace(/_/g, " ")}</span>
                      </div>
                      <span style={{ color: "#667085", fontSize: 12 }}>{quote?.quoteNumber ?? "Quote"} · {approval.projectName ?? "Artwork proof"}</span>
                      <span style={{ color: "#98a2b3", fontSize: 11 }}>Updated {formatDate(approval.updatedAt)}</span>
                    </div>
                  </Link>
                );
              })}
              {approvals.length === 0 ? <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>No artwork approvals yet.</p> : null}
            </div>
          </section>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {selectedApproval && selectedQuote ? (
            <>
              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "start" }}>
                  <div style={{ display: "grid", gap: 5 }}>
                    <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>{selectedQuote.quoteNumber ?? "Quote"} · {formatMoney(quoteTotal)} ex GST</p>
                    <h2 style={{ margin: 0, fontSize: 30 }}>{selectedApproval.projectName || selectedApproval.clientName}</h2>
                    <p style={{ margin: 0, color: "#475467" }}>{selectedApproval.clientName}{selectedApproval.contactName ? ` · ${selectedApproval.contactName}` : ""}</p>
                  </div>
                  <span style={{ borderRadius: 999, background: selectedTone.bg, color: selectedTone.fg, border: `1px solid ${selectedTone.border}`, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{selectedApproval.status.replace(/_/g, " ")}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                  <div style={{ border: "1px solid #e4e7ec", borderRadius: 16, padding: 12, background: "#fbfdff" }}><strong>{proofPages.length}</strong><br /><span style={{ color: "#667085", fontSize: 12 }}>Proof pages</span></div>
                  <div style={{ border: "1px solid #e4e7ec", borderRadius: 16, padding: 12, background: "#fbfdff" }}><strong>{formatDate(selectedApproval.sentAt)}</strong><br /><span style={{ color: "#667085", fontSize: 12 }}>Sent</span></div>
                  <div style={{ border: "1px solid #e4e7ec", borderRadius: 16, padding: 12, background: "#fbfdff" }}><strong>{formatDate(selectedApproval.viewedAt)}</strong><br /><span style={{ color: "#667085", fontSize: 12 }}>Viewed</span></div>
                  <div style={{ border: "1px solid #e4e7ec", borderRadius: 16, padding: 12, background: "#fbfdff" }}><strong>{formatDate(selectedApproval.approvedAt)}</strong><br /><span style={{ color: "#667085", fontSize: 12 }}>Approved</span></div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <form action={sendArtworkApprovalFromPageAction}>
                    <input type="hidden" name="approvalId" value={selectedApproval.id} />
                    <button type="submit" style={buttonStyle}>Mark sent</button>
                  </form>
                  <form action={directApproveArtworkApprovalAction}>
                    <input type="hidden" name="approvalId" value={selectedApproval.id} />
                    <button type="submit" style={{ ...buttonStyle, background: "#067647" }}>Direct approve</button>
                  </form>
                  {publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" style={{ ...secondaryButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Open client approval</a> : null}
                  {publicUrl && selectedApproval.email ? (
                    <a href={`mailto:${selectedApproval.email}?subject=${encodeURIComponent(`Artwork proof approval - ${selectedApproval.projectName || selectedApproval.clientName}`)}&body=${encodeURIComponent(`Hi ${selectedApproval.contactName || selectedApproval.clientName},\n\nPlease review and approve the artwork proof using the link below:\n\n${publicUrl}\n\nThanks`)}`} style={{ ...secondaryButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Email approval link</a>
                  ) : null}
                  <Link href={`/quotes?selected=${selectedQuote.id}`} style={{ ...secondaryButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Back to quote</Link>
                </div>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h2 style={{ margin: 0 }}>Approval setup</h2>
                  <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>These fields follow the same basics as the old artwork app, but now tied to the quote/client.</p>
                </div>
                <form action={saveArtworkApprovalDetailsAction} style={{ display: "grid", gap: 12 }}>
                  <input type="hidden" name="approvalId" value={selectedApproval.id} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                    <label style={labelStyle}>Client name<input name="clientName" defaultValue={selectedApproval.clientName} style={inputStyle} /></label>
                    <label style={labelStyle}>Contact<input name="contactName" defaultValue={selectedApproval.contactName ?? ""} style={inputStyle} /></label>
                    <label style={labelStyle}>Client email<input name="email" type="email" defaultValue={selectedApproval.email ?? ""} style={inputStyle} /></label>
                    <label style={labelStyle}>Project name<input name="projectName" defaultValue={selectedApproval.projectName ?? ""} style={inputStyle} /></label>
                    <label style={labelStyle}>Drawing title<input name="drawingTitle" defaultValue={selectedApproval.drawingTitle ?? ""} style={inputStyle} /></label>
                    <label style={labelStyle}>Drawing number<input name="drawingNumber" defaultValue={selectedApproval.drawingNumber ?? "S1"} style={inputStyle} /></label>
                    <label style={labelStyle}>Revision<input name="revision" defaultValue={selectedApproval.revision ?? "A"} style={inputStyle} /></label>
                    <label style={labelStyle}>Revision note<input name="revisionNote" defaultValue={selectedApproval.revisionNote ?? "Issued for approval"} style={inputStyle} /></label>
                    <label style={labelStyle}>Designer / staff<input name="designerName" defaultValue={selectedApproval.designerName ?? user.email ?? ""} style={inputStyle} /></label>
                  </div>
                  <label style={labelStyle}>Site / delivery address<textarea name="siteAddress" defaultValue={selectedApproval.siteAddress ?? ""} style={{ ...textareaStyle, minHeight: 68 }} /></label>
                  <label style={labelStyle}>Client message<textarea name="clientMessage" defaultValue={selectedApproval.clientMessage ?? "Please review the proof pages below."} style={{ ...textareaStyle, minHeight: 68 }} /></label>
                  <label style={labelStyle}>Internal notes<textarea name="internalNotes" defaultValue={selectedApproval.internalNotes ?? ""} style={{ ...textareaStyle, minHeight: 68 }} /></label>
                  <button type="submit" style={buttonStyle}>Save approval setup</button>
                </form>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h2 style={{ margin: 0 }}>Add proof page</h2>
                  <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Upload an image or paste a proof URL. The client page keeps a large white artwork area and a right-side production details panel.</p>
                </div>
                <form action={addArtworkApprovalPageFromPageAction} encType="multipart/form-data" style={{ display: "grid", gap: 12 }}>
                  <input type="hidden" name="approvalId" value={selectedApproval.id} />
                  <div style={{ display: "grid", gridTemplateColumns: "110px 1.2fr 130px 160px", gap: 10 }}>
                    <label style={labelStyle}>Item<input name="signCode" defaultValue={nextSignCode} placeholder="S1" style={inputStyle} /></label>
                    <label style={labelStyle}>Proof title<input name="title" placeholder="Front elevation" style={inputStyle} /></label>
                    <label style={labelStyle}>Qty<input name="quantity" defaultValue="1" style={inputStyle} /></label>
                    <label style={labelStyle}>Type<select name="productionType" defaultValue="signage" style={inputStyle}><option value="signage">Signage</option><option value="small_format">Small format</option></select></label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <label style={labelStyle}>Upload proof image<input name="proofFile" type="file" accept="image/*,.pdf" style={{ ...inputStyle, paddingTop: 10 }} /></label>
                    <label style={labelStyle}>Or paste proof image URL<input name="imageUrl" placeholder="https://..." style={inputStyle} /></label>
                  </div>
                  <label style={labelStyle}>Page description<textarea name="description" placeholder="Brief description shown under the proof title" style={{ ...textareaStyle, minHeight: 68 }} /></label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                    <label style={labelStyle}>Colours used<textarea name="colourSummary" placeholder="CMYK, Pantone, vinyl colours, print colours" style={{ ...textareaStyle, minHeight: 72 }} /></label>
                    <label style={labelStyle}>Sizes<textarea name="sizeSummary" placeholder="S1 - 1200 x 600mm, S2 - 600 x 400mm" style={{ ...textareaStyle, minHeight: 72 }} /></label>
                    <label style={labelStyle}>Substrate / stock<textarea name="substrateSummary" placeholder="3mm ACM white, 250gsm satin, acrylic clear etc" style={{ ...textareaStyle, minHeight: 72 }} /></label>
                    <label style={labelStyle}>Install / finishing<textarea name="installSummary" placeholder="Wall mounted, holes, tape, laminate, trimming, folds" style={{ ...textareaStyle, minHeight: 72 }} /></label>
                  </div>
                  <label style={labelStyle}>Small format details<textarea name="smallFormatSummary" placeholder="Cards/brochures/books/NCR details: sides, cello, folds, pages, cover colour, tape colour, numbering" style={{ ...textareaStyle, minHeight: 72 }} /></label>
                  <label style={labelStyle}>Notes for client / production<textarea name="notes" placeholder="Any extra notes for this proof page" style={{ ...textareaStyle, minHeight: 72 }} /></label>
                  <button type="submit" style={buttonStyle}>Add proof page</button>
                </form>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 14 }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Proof preview</h2>
                    <p style={{ margin: "5px 0 0", color: "#667085", fontSize: 13 }}>The public client page uses this same structure: large artwork preview, white background, no cropping.</p>
                  </div>
                  <span style={{ borderRadius: 999, background: "#f5f3ff", color: "#6d28d9", padding: "6px 10px", fontSize: 12, fontWeight: 950 }}>{proofPages.length} pages</span>
                </div>
                <div style={{ display: "grid", gap: 16 }}>
                  {proofPages.map((page, index) => (
                    <article key={page.id} style={{ border: "1px solid #cbd5e1", borderRadius: 22, background: "#fff", overflow: "hidden", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 310px", minHeight: 520 }}>
                      <div style={{ padding: 22, display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", gap: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 12, color: "#64748b", fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>{page.signCode || `S${index + 1}`} · {page.productionType.replace(/_/g, " ")}</p>
                            <h3 style={{ margin: "4px 0 0", fontSize: 24 }}>{page.title}</h3>
                            {page.description ? <p style={{ margin: "4px 0 0", color: "#667085" }}>{page.description}</p> : null}
                          </div>
                          <form action={removeArtworkApprovalPageFromPageAction}>
                            <input type="hidden" name="approvalId" value={selectedApproval.id} />
                            <input type="hidden" name="pageId" value={page.id} />
                            <button type="submit" style={{ ...secondaryButtonStyle, minHeight: 36, color: "#b42318" }}>Remove</button>
                          </form>
                        </div>
                        <div style={{ border: "1px solid #e2e8f0", borderRadius: 18, background: "#fff", display: "grid", placeItems: "center", padding: 16, overflow: "hidden" }}>
                          <img src={page.imageUrl} alt={page.title} style={{ width: "100%", height: "100%", maxHeight: 395, objectFit: "contain", objectPosition: "center", display: "block" }} />
                        </div>
                        {page.notes ? <p style={{ margin: 0, color: "#475467", whiteSpace: "pre-wrap" }}>{page.notes}</p> : <span />}
                      </div>
                      <aside style={{ borderLeft: "1px solid #e2e8f0", background: "#f8fafc", padding: 18, display: "grid", alignContent: "space-between", gap: 14 }}>
                        <div style={{ display: "grid", gap: 12 }}>
                          <div>
                            <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 950, textTransform: "uppercase" }}>Client</p>
                            <strong>{selectedApproval.clientName}</strong>
                          </div>
                          {detailsList(page).map((row) => (
                            <div key={row.label} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
                              <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 950 }}>{row.label}</p>
                              <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: "#1e293b" }}>{row.value}</p>
                            </div>
                          ))}
                        </div>
                        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, fontSize: 12, color: "#64748b" }}>Page {index + 1} of {proofPages.length}</div>
                      </aside>
                    </article>
                  ))}
                  {proofPages.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No proof pages have been added yet.</p> : null}
                </div>
              </section>

              {selectedApproval.clientResponseNotes || selectedApproval.clientSignatoryName || selectedApproval.internallyApprovedAt ? (
                <section style={{ ...cardStyle, display: "grid", gap: 10 }}>
                  <h2 style={{ margin: 0 }}>Response / approval</h2>
                  {selectedApproval.clientSignatoryName ? <p style={{ margin: 0 }}><strong>Approved by:</strong> {selectedApproval.clientSignatoryName}</p> : null}
                  {selectedApproval.internallyApprovedAt ? <p style={{ margin: 0 }}><strong>Internally approved:</strong> {formatDate(selectedApproval.internallyApprovedAt)} by {selectedApproval.internallyApprovedBy ?? "staff"}</p> : null}
                  {selectedApproval.clientResponseNotes ? <p style={{ margin: 0, color: "#475467", whiteSpace: "pre-wrap" }}>{selectedApproval.clientResponseNotes}</p> : null}
                  {selectedApproval.clientSignatureDataUrl ? <img src={selectedApproval.clientSignatureDataUrl} alt="Client signature" style={{ width: 260, maxWidth: "100%", border: "1px solid #dbe4f0", borderRadius: 14, background: "#fff" }} /> : null}
                </section>
              ) : null}
            </>
          ) : (
            <section style={{ ...cardStyle, minHeight: 420, display: "grid", placeItems: "center", textAlign: "center" }}>
              <div style={{ maxWidth: 460 }}>
                <h2 style={{ margin: 0 }}>No artwork approval selected</h2>
                <p style={{ color: "#667085", lineHeight: 1.6 }}>Create an approval pack from a quote, then add proof pages and send the client approval link.</p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
