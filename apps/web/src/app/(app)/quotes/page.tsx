import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById } from "@/server/enquiries";
import { getSurveyRequestById } from "@/server/surveys";
import { listMaterialsForTenant } from "@/server/materials";
import { customerDefaultDiscount, customerDiscountRules, customerLogoUrl, getCustomerById } from "@/server/customers";
import { getCompanySettingsByTenantId } from "@/server/company";
import { createArtworkApprovalAction, createQuoteDraftAction, deleteQuoteDraftAction, deleteQuoteLineAction, markQuoteSentAction, pushAcceptedQuoteToMyobOrderAction, restoreQuoteDraftAction } from "./actions";
import { QuoteMaterialFlowBuilder } from "./QuoteMaterialFlowBuilder";
import { getArtworkApprovalForQuote, getQuoteDraftById, listQuoteDraftsForTenant, listQuoteLines } from "@/server/quotes";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}


type UnknownRecord = Record<string, unknown>;
type SurveyPhoto = {
  url: string;
  fileName: string;
  signTitle: string;
  annotated: boolean;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getPhotoUrl(photo: unknown): string {
  if (!isRecord(photo)) return "";
  return textValue(photo.url) || textValue(photo.downloadUrl) || textValue(photo.photoUrl) || textValue(photo.photoURL);
}

function getPhotoName(photo: unknown, fallback: string): string {
  if (!isRecord(photo)) return fallback;
  return textValue(photo.fileName) || textValue(photo.originalFileName) || textValue(photo.name) || fallback;
}

function extractSurveyPhotos(payload: unknown): SurveyPhoto[] {
  if (!isRecord(payload)) return [];
  const directPhotos = Array.isArray(payload.surveyPhotos) ? payload.surveyPhotos : [];
  const signs = Array.isArray(payload.signs) ? payload.signs : [];
  const rawSurvey = isRecord(payload.rawSurvey) ? payload.rawSurvey : {};
  const rawSigns = Array.isArray(rawSurvey.signs) ? rawSurvey.signs : [];
  const photoRows: SurveyPhoto[] = [];
  const seen = new Set<string>();

  directPhotos.forEach((photo, index) => {
    const url = getPhotoUrl(photo);
    if (!url || seen.has(url)) return;
    seen.add(url);
    photoRows.push({
      url,
      fileName: getPhotoName(photo, `Photo ${index + 1}`),
      signTitle: isRecord(photo) ? textValue(photo.signTitle) || textValue(photo.location) || "Survey photo" : "Survey photo",
      annotated: isRecord(photo) ? Boolean(photo.annotated) : false,
    });
  });

  [...signs, ...rawSigns].forEach((sign, signIndex) => {
    if (!isRecord(sign)) return;
    const signTitle = textValue(sign.title) || textValue(sign.location) || `Sign / location ${signIndex + 1}`;
    const photos = Array.isArray(sign.photos) ? sign.photos : [];
    photos.forEach((photo, photoIndex) => {
      const url = getPhotoUrl(photo);
      if (!url || seen.has(url)) return;
      seen.add(url);
      photoRows.push({
        url,
        fileName: getPhotoName(photo, `Photo ${photoIndex + 1}`),
        signTitle,
        annotated: isRecord(photo) ? Boolean(photo.annotated) : false,
      });
    });
  });

  return photoRows;
}

function surveyStatusLabel(status: string | null | undefined, syncStatus: string | null | undefined): string {
  if (syncStatus === "completed" || status === "completed") return "Survey completed · ready to quote";
  if (syncStatus === "created") return "Sent to Install Scheduler · awaiting completion";
  if (syncStatus === "error") return "Install Scheduler sync issue";
  if (status === "booked") return "Survey booked";
  return "Survey requested";
}

function buildSurveyQuoteNotes(input: {
  enquirySummary?: string | null;
  surveyNotes?: string | null;
  surveyDetails?: string | null;
  photos: SurveyPhoto[];
}): string {
  const photoLines = input.photos.map((photo, index) => `${index + 1}. ${photo.signTitle}: ${photo.url}`);
  return [
    input.enquirySummary ? `Enquiry summary:\n${input.enquirySummary}` : null,
    input.surveyNotes ? `Survey brief:\n${input.surveyNotes}` : null,
    input.surveyDetails ? `Survey information collected:\n${input.surveyDetails}` : null,
    photoLines.length ? `Survey photos:\n${photoLines.join("\n")}` : null,
  ].filter(Boolean).join("\n\n");
}

function cardStyle() {
  return { background: "rgba(255,255,255,0.94)", border: "1px solid #dfe7f2", borderRadius: 26, padding: 22, boxShadow: "0 18px 48px rgba(15,23,42,0.06)" } as const;
}

const inputStyle = { minHeight: 44, borderRadius: 14, border: "1px solid #cfd9e8", padding: "0 14px", width: "100%", boxSizing: "border-box", background: "#fff" } as const;
const textareaStyle = { minHeight: 110, borderRadius: 14, border: "1px solid #cfd9e8", padding: "12px 14px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;
const buttonStyle = { minHeight: 44, borderRadius: 14, border: "none", background: "#0f172a", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 16px" } as const;

function parseMoney(value: string | null | undefined): number {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(date);
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

function publicQuoteUrl(token: string | null | undefined): string {
  if (!token) return "";
  const base = appBaseUrl();
  return `${base}/public/quotes/${token}`;
}


function myobOrderTone(status: string | null | undefined): { bg: string; fg: string; border: string; label: string } {
  if (status === "synced") return { bg: "#dcfae6", fg: "#067647", border: "#abefc6", label: "MYOB order synced" };
  if (status === "ready_to_sync") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa", label: "Ready for MYOB order" };
  if (status === "syncing") return { bg: "#eef4ff", fg: "#3538cd", border: "#c7d7fe", label: "Syncing to MYOB" };
  if (status === "error") return { bg: "#fff1f3", fg: "#c01048", border: "#fecdd3", label: "MYOB sync issue" };
  return { bg: "#f8fafc", fg: "#475467", border: "#e2e8f0", label: "Not in MYOB" };
}

function quoteStatusTone(status: string): { bg: string; fg: string; border: string } {
  if (status === "accepted") return { bg: "#dcfae6", fg: "#067647", border: "#abefc6" };
  if (status === "sent" || status === "viewed") return { bg: "#eef4ff", fg: "#3538cd", border: "#c7d7fe" };
  if (status === "changes_requested") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  if (status === "declined") return { bg: "#fff1f3", fg: "#c01048", border: "#fecdd3" };
  if (status === "deleted") return { bg: "#fff5f4", fg: "#b42318", border: "#fecaca" };
  return { bg: "#f8fafc", fg: "#475467", border: "#e2e8f0" };
}

export default async function QuotesPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const fromEnquiry = readParam(params, "fromEnquiry");
  const fromSurvey = readParam(params, "fromSurvey");
  const selected = readParam(params, "selected");
  const filter = readParam(params, "filter");

  const [allQuoteDrafts, materials, enquiry, survey, selectedQuote, companySettings] = await Promise.all([
    listQuoteDraftsForTenant(activeTenant.tenantId, { includeDeleted: true }),
    listMaterialsForTenant(activeTenant.tenantId),
    fromEnquiry ? getEnquiryById(activeTenant.tenantId, fromEnquiry) : Promise.resolve(null),
    fromSurvey ? getSurveyRequestById(activeTenant.tenantId, fromSurvey) : Promise.resolve(null),
    selected ? getQuoteDraftById(activeTenant.tenantId, selected) : Promise.resolve(null),
    getCompanySettingsByTenantId(activeTenant.tenantId)
  ]);

  const deletedQuoteCount = allQuoteDrafts.filter((quote) => quote.status === "deleted").length;
  const quoteDrafts = filter === "deleted"
    ? allQuoteDrafts.filter((quote) => quote.status === "deleted")
    : allQuoteDrafts.filter((quote) => quote.status !== "deleted");

  const sourceClientName = survey?.clientName ?? enquiry?.clientName ?? "";
  const sourceContactName = survey?.contactName ?? enquiry?.contactName ?? "";
  const sourcePhone = survey?.phone ?? enquiry?.phone ?? "";
  const sourceEmail = enquiry?.email ?? "";
  const activeMaterials = materials.filter((material) => material.active);
  const sourceLinkedCustomerId = survey?.linkedCustomerId ?? enquiry?.linkedCustomerId ?? selectedQuote?.linkedCustomerId ?? null;

  const [quoteLines, selectedArtworkApproval, linkedClient] = await Promise.all([
    selectedQuote ? listQuoteLines(selectedQuote.id) : Promise.resolve([]),
    selectedQuote ? getArtworkApprovalForQuote(activeTenant.tenantId, selectedQuote.id) : Promise.resolve(null),
    sourceLinkedCustomerId ? getCustomerById(activeTenant.tenantId, sourceLinkedCustomerId) : Promise.resolve(null)
  ]);

  const quoteSubtotal = quoteLines.reduce((sum, line) => sum + parseMoney(line.lineTotal), 0);
  const quotePublicUrl = selectedQuote ? publicQuoteUrl(selectedQuote.publicToken) : "";
  const artworkAdminUrl = selectedArtworkApproval ? `/artwork-approvals?selected=${selectedArtworkApproval.id}` : `/artwork-approvals?quote=${selectedQuote?.id ?? ""}`;
  const linkedClientLogoUrl = customerLogoUrl(linkedClient);
  const linkedClientDefaultDiscount = customerDefaultDiscount(linkedClient);
  const linkedClientDiscountRules = customerDiscountRules(linkedClient);
  const surveyPhotos = extractSurveyPhotos(survey?.installSchedulerPayload);
  const defaultQuoteNotes = buildSurveyQuoteNotes({
    enquirySummary: enquiry?.requestSummary ?? null,
    surveyNotes: survey?.notes ?? null,
    surveyDetails: survey?.surveyDetails ?? null,
    photos: surveyPhotos
  });

  return (
    <div style={{ maxWidth: 1680, margin: "0 auto", display: "grid", gap: 18 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}

      <section style={{ ...cardStyle(), display: "grid", gap: 8, background: "linear-gradient(135deg, #ffffff 0%, #f7fbff 54%, #eef6ff 100%)" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2563eb" }}>Quote entry</p>
        <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>Build quote lines from materials</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Start with a base material, then move through the card flow: thickness, colour, size, print, ink, laminate and finishing. Products/templates stay in the background as optional shortcuts.</p>
      </section>

      <section style={{ ...cardStyle(), display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 260 }}>
            <h2 style={{ margin: 0 }}>{filter === "deleted" ? "Deleted quotes" : "Quote workflow"}</h2>
            <p style={{ margin: "4px 0 0", color: "#667085", fontSize: 13 }}>Create or switch quotes here; the selected quote builder below now gets the full page width.</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <a href="/quotes" style={{ color: filter === "deleted" ? "#667085" : "#155eef", fontWeight: 900, textDecoration: "none" }}>Active</a>
            <a href="/quotes?filter=deleted" style={{ color: filter === "deleted" ? "#155eef" : "#667085", fontWeight: 900, textDecoration: "none" }}>Deleted ({deletedQuoteCount})</a>
            <span style={{ borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>{quoteDrafts.length} quote{quoteDrafts.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        {(survey || linkedClient) ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            {survey ? (
              <section style={{ border: `1px solid ${survey.installSchedulerSyncStatus === "completed" ? "#abefc6" : "#c7d7fe"}`, borderRadius: 18, padding: 12, display: "grid", gap: 8, background: survey.installSchedulerSyncStatus === "completed" ? "#f6fef9" : "#f8fbff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
                  <div style={{ display: "grid", gap: 3 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: survey.installSchedulerSyncStatus === "completed" ? "#067647" : "#155eef" }}>Survey source</p>
                    <strong>{survey.clientName}</strong>
                  </div>
                  <span style={{ borderRadius: 999, background: survey.installSchedulerSyncStatus === "completed" ? "#dcfae6" : "#eef2ff", color: survey.installSchedulerSyncStatus === "completed" ? "#067647" : "#4338ca", padding: "5px 9px", fontSize: 11, fontWeight: 950 }}>{surveyStatusLabel(survey.status, survey.installSchedulerSyncStatus)}</span>
                </div>
                <p style={{ margin: 0, color: "#475467", fontSize: 13 }}>{survey.siteAddress || "No site address recorded"}</p>
                {enquiry?.clientPurchaseOrderNumber ? <p style={{ margin: 0, color: "#475467", fontSize: 13 }}>PO: <strong>{enquiry.clientPurchaseOrderNumber}</strong></p> : null}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {surveyPhotos.length ? <span style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", padding: "4px 9px", fontSize: 12, fontWeight: 850 }}>{surveyPhotos.length} photo{surveyPhotos.length === 1 ? "" : "s"} copied to notes</span> : null}
                  <Link href={`/surveys?selected=${survey.id}`} style={{ textDecoration: "none", minHeight: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 10, border: "1px solid #cbd5e1", color: "#111827", fontSize: 13, fontWeight: 900, padding: "0 10px" }}>Open survey</Link>
                </div>
              </section>
            ) : null}
            {linkedClient ? (
              <section style={{ border: "1px solid #dfe7f2", borderRadius: 18, padding: 12, display: "grid", gridTemplateColumns: linkedClientLogoUrl ? "56px 1fr" : "1fr", gap: 12, alignItems: "center", background: "#fbfdff" }}>
                {linkedClientLogoUrl ? <img src={linkedClientLogoUrl} alt={`${linkedClient.displayName} logo`} style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 14, border: "1px solid #e5e7eb", background: "#fff" }} /> : null}
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>{linkedClient.displayName}</strong>
                  <span style={{ color: "#667085", fontSize: 13 }}>{linkedClientDefaultDiscount ? `${linkedClientDefaultDiscount}% default discount` : "No default discount"}{linkedClientDiscountRules.length ? ` · ${linkedClientDiscountRules.length} qty discount rule${linkedClientDiscountRules.length === 1 ? "" : "s"}` : ""}</span>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        <details open={!selectedQuote || Boolean(enquiry || survey)} style={{ border: "1px solid #dbeafe", borderRadius: 18, background: "#f8fbff", padding: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 950, color: "#155eef" }}>New draft quote</summary>
          <form action={createQuoteDraftAction} style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <input type="hidden" name="enquiryId" value={enquiry?.id ?? survey?.enquiryId ?? ""} />
            <input type="hidden" name="surveyRequestId" value={survey?.id ?? ""} />
            <input type="hidden" name="linkedCustomerId" value={sourceLinkedCustomerId ?? ""} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
              <input name="clientName" defaultValue={sourceClientName} placeholder="Client / business name" style={inputStyle} />
              <input name="contactName" defaultValue={sourceContactName} placeholder="Contact name" style={inputStyle} />
              <input name="phone" defaultValue={sourcePhone} placeholder="Phone" style={inputStyle} />
              <input name="email" defaultValue={sourceEmail} placeholder="Email" style={inputStyle} />
              <input name="discountPercent" defaultValue={String(linkedClientDefaultDiscount || 0)} placeholder="Client discount %" style={inputStyle} />
            </div>
            <textarea name="notes" defaultValue={defaultQuoteNotes} placeholder="Quote notes" style={{ ...textareaStyle, minHeight: 80 }} />
            <button type="submit" style={{ ...buttonStyle, width: "fit-content" }}>Create draft quote</button>
          </form>
        </details>

        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {quoteDrafts.map((quote) => {
            const active = selectedQuote?.id === quote.id;
            return (
              <a key={quote.id} href={`/quotes?selected=${quote.id}`} style={{ minWidth: 250, textDecoration: "none", color: "inherit", border: active ? "2px solid #155eef" : "1px solid #dfe7f2", borderRadius: 18, padding: 12, display: "grid", gap: 6, background: active ? "#eff6ff" : "#fbfdff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{quote.clientName}</strong>
                  <span style={{ borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 9px", fontSize: 11, fontWeight: 900 }}>{quote.status}</span>
                </div>
                <div style={{ color: "#667085", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[quote.contactName, quote.phone, quote.discountPercent !== "0" ? `Discount ${quote.discountPercent}%` : null].filter(Boolean).join(" · ")}</div>
              </a>
            );
          })}
          {quoteDrafts.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No draft quotes yet.</p> : null}
        </div>
      </section>

      <section style={{ ...cardStyle(), display: "grid", gap: 16 }}>
          {selectedQuote ? (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Selected quote: {selectedQuote.clientName}</h2>
                    <p style={{ margin: "6px 0 0", color: "#667085" }}>Add line items by building from your material library. Start with Acrylic, ACM, Corflute, PVC, Banner or another sheet material.</p>
                  </div>
                  {(() => { const tone = quoteStatusTone(selectedQuote.status); return <span style={{ border: `1px solid ${tone.border}`, background: tone.bg, color: tone.fg, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{selectedQuote.status.replace(/_/g, " ")}</span>; })()}
                </div>

                <section style={{ border: "1px solid #d9e2ef", borderRadius: 22, background: "linear-gradient(135deg,#ffffff,#f8fbff)", padding: 16, display: "grid", gap: 14 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}>Quote: <strong>{selectedQuote.quoteNumber ?? "Draft"}</strong></span>
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}><strong>{quoteLines.length}</strong> line item{quoteLines.length === 1 ? "" : "s"}</span>
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}>Total: <strong>{formatMoney(quoteSubtotal)}</strong></span>
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}>Client: <strong>{selectedQuote.acceptedAt ? "Accepted" : selectedQuote.changesRequestedAt ? "Changes requested" : selectedQuote.declinedAt ? "Declined" : selectedQuote.viewedAt ? "Viewed" : selectedQuote.sentAt ? "Sent" : "Not sent"}</strong></span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "end" }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong>Client-facing quote link</strong>
                      <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Mark the quote as sent, then copy/open this public link or use the email button.</p>
                      <input readOnly value={quotePublicUrl || "Mark quote as sent to generate/confirm the link"} style={{ ...inputStyle, fontSize: 13 }} />
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {selectedQuote.status !== "deleted" ? (
                        <form action={markQuoteSentAction}>
                          <input type="hidden" name="quoteId" value={selectedQuote.id} />
                          <button type="submit" style={buttonStyle}>{selectedQuote.sentAt ? "Mark sent again" : "Mark quote sent"}</button>
                        </form>
                      ) : null}
                      {selectedQuote.status === "deleted" ? (
                        <form action={restoreQuoteDraftAction}>
                          <input type="hidden" name="quoteId" value={selectedQuote.id} />
                          <button type="submit" style={{ ...buttonStyle, background: "#067647" }}>Restore quote</button>
                        </form>
                      ) : (
                        <form action={deleteQuoteDraftAction}>
                          <input type="hidden" name="quoteId" value={selectedQuote.id} />
                          <button type="submit" style={{ ...buttonStyle, background: "#b42318" }}>Delete quote</button>
                        </form>
                      )}
                      {quotePublicUrl ? <a href={quotePublicUrl} target="_blank" rel="noreferrer" style={{ minHeight: 44, borderRadius: 14, border: "1px solid #cbd5e1", background: "#fff", color: "#111827", fontWeight: 950, display: "inline-flex", alignItems: "center", padding: "0 14px", textDecoration: "none" }}>Open client quote</a> : null}
                      {quotePublicUrl && selectedQuote.email ? <a href={`mailto:${selectedQuote.email}?subject=${encodeURIComponent(`Quote ${selectedQuote.quoteNumber ?? "from Production Manager"}`)}&body=${encodeURIComponent(`Hi ${selectedQuote.contactName ?? selectedQuote.clientName},

Please view your quote here:
${quotePublicUrl}

Thanks`)}`} style={{ minHeight: 44, borderRadius: 14, border: "1px solid #cbd5e1", background: "#fff", color: "#111827", fontWeight: 950, display: "inline-flex", alignItems: "center", padding: "0 14px", textDecoration: "none" }}>Email quote</a> : null}
                    </div>
                  </div>
                  {(() => {
                    const myobTone = myobOrderTone(selectedQuote.myobOrderStatus);
                    const canPush = selectedQuote.status === "accepted" && selectedQuote.myobOrderStatus !== "synced";
                    return (
                      <section style={{ border: `1px solid ${myobTone.border}`, borderRadius: 18, background: myobTone.bg, color: myobTone.fg, padding: 14, display: "grid", gap: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                          <div style={{ display: "grid", gap: 4 }}>
                            <strong>MYOB open job / order</strong>
                            <span style={{ fontSize: 13 }}>Accepted quotes become open MYOB Orders. Drafts, enquiries and surveys stay in Production Manager only.</span>
                            {selectedQuote.myobOrderNumber ? <span style={{ fontSize: 13 }}>Order: <strong>{selectedQuote.myobOrderNumber}</strong>{selectedQuote.myobOrderSyncedAt ? ` · synced ${formatDateTime(selectedQuote.myobOrderSyncedAt)}` : ""}</span> : null}
                            {selectedQuote.myobOrderSyncError ? <span style={{ fontSize: 13, color: "#b42318", whiteSpace: "pre-wrap" }}>{selectedQuote.myobOrderSyncError}</span> : null}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <span style={{ borderRadius: 999, border: `1px solid ${myobTone.border}`, background: "rgba(255,255,255,0.75)", color: myobTone.fg, padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>{myobTone.label}</span>
                            {canPush ? (
                              <form action={pushAcceptedQuoteToMyobOrderAction}>
                                <input type="hidden" name="quoteId" value={selectedQuote.id} />
                                <button type="submit" style={{ ...buttonStyle, background: "#0f766e" }}>Send to MYOB Order</button>
                              </form>
                            ) : null}
                          </div>
                        </div>
                      </section>
                    );
                  })()}

                  {selectedQuote.clientResponseNotes ? <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412", borderRadius: 16, padding: 12 }}><strong>Client notes:</strong><br />{selectedQuote.clientResponseNotes}</div> : null}
                </section>
              </div>

              {selectedQuote.status !== "deleted" ? (
                <QuoteMaterialFlowBuilder
                  quoteId={selectedQuote.id}
                  materials={activeMaterials}
                  pricingSettings={{
                    markupMultiplier: companySettings?.globalMarkupMultiplier ?? "1.5",
                    profitMultiplier: companySettings?.globalProfitMultiplier ?? "1.2",
                    labourRate: companySettings?.quoteLabourRate ?? "66",
                    inkRatePerSqm: companySettings?.quoteInkRatePerSqm ?? "10",
                    monoRatePerSqm: companySettings?.quoteMonoRatePerSqm ?? "4",
                    signageSizePresets: companySettings?.quoteSignageSizePresets,
                    smallSizePresets: companySettings?.quoteSmallSizePresets,
                    clientDefaultDiscountPercent: linkedClientDefaultDiscount,
                    clientDiscountRules: linkedClientDiscountRules
                  }}
                />
              ) : (
                <section style={{ border: "1px solid #fecaca", borderRadius: 18, padding: 16, background: "#fff5f4", color: "#b42318", fontWeight: 800 }}>This quote is deleted. Restore it before editing or sending.</section>
              )}

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h4 style={{ margin: 0 }}>Saved quote lines</h4>
                  <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Saved lines are snapshots. Change the card flow above, then save a new line or remove an old one.</p>
                </div>
                {quoteLines.map((line) => (
                  <div key={line.id} style={{ border: "1px solid #dfe7f2", borderRadius: 18, padding: 14, display: "grid", gap: 10, background: "#fbfdff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{line.productName}</strong>
                        <div style={{ color: "#667085", fontSize: 13 }}>{[line.optionSummary, `Qty ${line.quantity}`, `Unit $${line.unitPrice}`, `Total $${line.lineTotal}`].filter(Boolean).join(" · ")}</div>
                      </div>
                      <form action={deleteQuoteLineAction}>
                        <input type="hidden" name="quoteId" value={selectedQuote.id} />
                        <input type="hidden" name="lineId" value={line.id} />
                        <button type="submit" style={{ border: "1px solid #fecaca", background: "#fff", color: "#b42318", borderRadius: 12, padding: "8px 10px", fontWeight: 900, cursor: "pointer" }}>Remove</button>
                      </form>
                    </div>
                  </div>
                ))}
                {quoteLines.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No saved quote lines yet. Build a line above, then save it to the quote.</p> : null}
              </div>

              <section style={{ border: "1px solid #e9d5ff", borderRadius: 22, padding: 16, background: "linear-gradient(135deg,#ffffff,#faf5ff)", display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7c3aed" }}>Artwork approval</p>
                    <h3 style={{ margin: 0 }}>Manage approvals on the Artwork Approvals page</h3>
                    <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Quotes stay focused on pricing. Proof pages, client approval links and approval status now live in their own workflow page.</p>
                  </div>
                  {selectedArtworkApproval ? <span style={{ borderRadius: 999, background: "#f5f3ff", color: "#6d28d9", padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>{selectedArtworkApproval.status.replace(/_/g, " ")}</span> : null}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {selectedArtworkApproval ? (
                    <Link href={artworkAdminUrl} style={{ ...buttonStyle, minHeight: 44, display: "inline-flex", alignItems: "center", textDecoration: "none", background: "#6d28d9" }}>Open artwork approval</Link>
                  ) : (
                    <form action={createArtworkApprovalAction}>
                      <input type="hidden" name="quoteId" value={selectedQuote.id} />
                      <button type="submit" style={{ ...buttonStyle, background: selectedQuote.status === "accepted" ? "#6d28d9" : "#334155" }}>{selectedQuote.status === "accepted" ? "Create artwork approval" : "Create artwork approval anyway"}</button>
                    </form>
                  )}
                  <Link href={`/artwork-approvals?quote=${selectedQuote.id}`} style={{ minHeight: 44, borderRadius: 14, border: "1px solid #ddd6fe", background: "#fff", color: "#5b21b6", fontWeight: 950, display: "inline-flex", alignItems: "center", padding: "0 14px", textDecoration: "none" }}>Go to Artwork Approvals</Link>
                </div>
              </section>
            </div>
          ) : (
            <div style={{ border: "1px dashed #cbd5e1", borderRadius: 22, padding: 30, display: "grid", placeItems: "center", textAlign: "center", gap: 8, minHeight: 320 }}>
              <h2 style={{ margin: 0 }}>Choose or create a quote first</h2>
              <p style={{ margin: 0, color: "#667085" }}>Once a draft is selected, the material card flow appears here.</p>
            </div>
          )}
        </section>
    </div>
  );
}
