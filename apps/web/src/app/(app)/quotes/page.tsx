import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById, listEnquiriesForTenant } from "@/server/enquiries";
import { getSurveyRequestById } from "@/server/surveys";
import { listMaterialsForTenant } from "@/server/materials";
import { listQuoteProductsForTenant } from "@/server/products";
import { customerLogoUrl, customerMyobPriceLevel, customerMyobPriceLevelName, listCustomersForTenant } from "@/server/customers";
import { getCompanySettingsByTenantId } from "@/server/company";
import { createArtworkApprovalAction, createQuoteClientInMyobAction, deleteQuoteDraftAction, deleteQuoteLineAction, linkQuoteClientToMyobAction, markQuoteSentAction, pushAcceptedQuoteToMyobOrderAction, restoreQuoteDraftAction } from "./actions";
import { QuoteMaterialFlowBuilder } from "./QuoteMaterialFlowBuilder";
import { QuoteLineEditor } from "./QuoteLineEditor";
import { getArtworkApprovalForQuote, getQuoteDraftById, listQuoteDraftsForTenant, listQuoteLines } from "@/server/quotes";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";
import { NewQuoteDraftForm } from "./NewQuoteDraftForm";
import { inferLegacyQuickQuoteSnapshot, readQuickQuoteSnapshot, type QuickQuoteStep } from "./quoteLineSnapshot";
import { MyobSubmitButton } from "./MyobSubmitButton";

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

function cleanQuoteLineAmount(value: string | number | null | undefined): string {
  const parsed = parseMoney(String(value ?? "0"));
  if (!Number.isFinite(parsed)) return String(value ?? "");
  return parsed.toFixed(2);
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
  const editLineId = readParam(params, "editLine");
  const editStepParam = readParam(params, "editStep");

  const builderDataNeeded = Boolean(selected);
  const [allQuoteDrafts, materials, enquiry, survey, selectedQuote, companySettings, clients, allEnquiries, quoteProducts] = await Promise.all([
    listQuoteDraftsForTenant(activeTenant.tenantId, { includeDeleted: true }),
    builderDataNeeded ? listMaterialsForTenant(activeTenant.tenantId) : Promise.resolve([]),
    fromEnquiry ? getEnquiryById(activeTenant.tenantId, fromEnquiry) : Promise.resolve(null),
    fromSurvey ? getSurveyRequestById(activeTenant.tenantId, fromSurvey) : Promise.resolve(null),
    selected ? getQuoteDraftById(activeTenant.tenantId, selected) : Promise.resolve(null),
    builderDataNeeded ? getCompanySettingsByTenantId(activeTenant.tenantId) : Promise.resolve(null),
    listCustomersForTenant(activeTenant.tenantId),
    listEnquiriesForTenant(activeTenant.tenantId, { includeDeleted: true }),
    builderDataNeeded ? listQuoteProductsForTenant(activeTenant.tenantId) : Promise.resolve([])
  ]);

  const deletedQuoteCount = allQuoteDrafts.filter((quote) => quote.status === "deleted").length;
  const quoteDrafts = filter === "deleted"
    ? allQuoteDrafts.filter((quote) => quote.status === "deleted")
    : allQuoteDrafts.filter((quote) => quote.status !== "deleted");

  const activeMaterials = materials.filter((material) => material.active);
  const savedQuoteProducts = quoteProducts
    .map((product) => {
      const definition = product.definitionJson ?? {};
      const fields = Array.isArray(definition.fields) ? definition.fields : [];
      const components = Array.isArray(definition.components) ? definition.components : [];
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        department: product.department,
        productFamily: product.productFamily,
        myobUid: product.myobUid,
        myobPriceMatrix: product.payloadJson?.myobPriceMatrix && typeof product.payloadJson.myobPriceMatrix === "object" && !Array.isArray(product.payloadJson.myobPriceMatrix)
          ? product.payloadJson.myobPriceMatrix as Record<string, unknown>
          : null,
        fields,
        components
      };
    })
    .filter((product) => product.fields.length > 0 || product.components.length > 0);
  const customerById = new Map(clients.map((client) => [client.id, client]));
  const enquiryById = new Map(allEnquiries.map((item) => [item.id, item]));
  const surveySourceEnquiry = survey?.enquiryId ? enquiryById.get(survey.enquiryId) ?? null : null;
  const selectedQuoteSourceEnquiry = selectedQuote?.enquiryId ? enquiryById.get(selectedQuote.enquiryId) ?? null : null;
  const sourceEnquiry = enquiry ?? surveySourceEnquiry;
  const sourceClientName = survey?.clientName ?? sourceEnquiry?.clientName ?? "";
  const sourceContactName = survey?.contactName ?? sourceEnquiry?.contactName ?? "";
  const sourcePhone = survey?.phone ?? sourceEnquiry?.phone ?? "";
  const sourceEmail = sourceEnquiry?.email ?? "";
  const sourceLinkedCustomerId = survey?.linkedCustomerId ?? sourceEnquiry?.linkedCustomerId ?? selectedQuote?.linkedCustomerId ?? null;

  const [quoteLines, selectedArtworkApproval] = await Promise.all([
    selectedQuote ? listQuoteLines(selectedQuote.id) : Promise.resolve([]),
    selectedQuote ? getArtworkApprovalForQuote(activeTenant.tenantId, selectedQuote.id) : Promise.resolve(null)
  ]);
  const linkedClient = sourceLinkedCustomerId ? customerById.get(sourceLinkedCustomerId) ?? null : null;
  const importedMyobCustomers = clients.filter((client) => client.isActive && Boolean(client.myobUid) && !client.myobUid.startsWith("manual-"));
  const linkedClientMyobUid = linkedClient
    ? (!linkedClient.myobUid.startsWith("manual-")
        ? linkedClient.myobUid
        : typeof linkedClient.payloadJson?.myobUid === "string" ? linkedClient.payloadJson.myobUid.trim() : "")
    : "";
  const linkedMyobCustomer = linkedClientMyobUid
    ? importedMyobCustomers.find((candidate) => candidate.myobUid === linkedClientMyobUid) ?? null
    : null;
  const linkedEmail = String(linkedClient?.email ?? "").trim().toLowerCase();
  const linkedCompany = String(linkedClient?.companyName || linkedClient?.displayName || "").trim().toLowerCase();
  const suggestedMyobCustomers = !linkedMyobCustomer && linkedClient
    ? importedMyobCustomers.filter((candidate) => {
        const candidateEmail = String(candidate.email ?? "").trim().toLowerCase();
        const candidateCompany = String(candidate.companyName || candidate.displayName || "").trim().toLowerCase();
        return (linkedEmail && candidateEmail === linkedEmail) || (linkedCompany && candidateCompany === linkedCompany);
      })
    : [];
  const suggestedMyobCustomer = suggestedMyobCustomers.length === 1 ? suggestedMyobCustomers[0] : null;

  const editingQuoteLineRecord = editLineId ? quoteLines.find((line) => line.id === editLineId) ?? null : null;
  const editingSnapshot = editingQuoteLineRecord
    ? readQuickQuoteSnapshot(editingQuoteLineRecord.configurationSnapshot) ?? inferLegacyQuickQuoteSnapshot({
        productName: editingQuoteLineRecord.productName,
        optionSummary: editingQuoteLineRecord.optionSummary,
        quantity: editingQuoteLineRecord.quantity,
        unitPrice: editingQuoteLineRecord.unitPrice,
        notes: editingQuoteLineRecord.notes,
        materials
      })
    : null;
  const editingQuoteLine = editingQuoteLineRecord && editingSnapshot
    ? {
        id: editingQuoteLineRecord.id,
        productName: editingQuoteLineRecord.productName,
        optionSummary: editingQuoteLineRecord.optionSummary,
        quantity: editingQuoteLineRecord.quantity,
        unitPrice: editingQuoteLineRecord.unitPrice,
        notes: editingQuoteLineRecord.notes,
        configurationSnapshot: editingSnapshot,
        reconstructed: Boolean(editingSnapshot.reconstructed)
      }
    : null;
  const editingStep = editStepParam ? editStepParam as QuickQuoteStep : null;

  const quoteSubtotal = quoteLines.reduce((sum, line) => line.clientResponseStatus === "cancelled" ? sum : sum + parseMoney(line.lineTotal), 0);
  const quotePublicUrl = selectedQuote ? publicQuoteUrl(selectedQuote.publicToken) : "";
  const artworkAdminUrl = selectedArtworkApproval ? `/artwork-approvals?selected=${selectedArtworkApproval.id}` : `/artwork-approvals?quote=${selectedQuote?.id ?? ""}`;
  const linkedClientLogoUrl = customerLogoUrl(linkedClient);
  const sourceLogoUrl = sourceEnquiry?.clientLogoUrl || linkedClientLogoUrl;
  const selectedQuoteLogoUrl = selectedQuoteSourceEnquiry?.clientLogoUrl || linkedClientLogoUrl;
  const linkedClientPriceLevel = customerMyobPriceLevel(linkedClient) ?? "Level A";
  const linkedClientPriceLevelName = customerMyobPriceLevelName(linkedClient) || linkedClientPriceLevel;
  const linkedClientPriceFactor = companySettings?.myobPriceLevelFactors?.[linkedClientPriceLevel] ?? "1";
  const surveyPhotos = extractSurveyPhotos(survey?.installSchedulerPayload);
  const defaultQuoteNotes = buildSurveyQuoteNotes({
    enquirySummary: sourceEnquiry?.requestSummary ?? null,
    surveyNotes: survey?.notes ?? null,
    surveyDetails: survey?.surveyDetails ?? null,
    photos: surveyPhotos
  });
  const draftClientOptions = clients
    .filter((client) => client.isActive || client.id === sourceLinkedCustomerId)
    .map((client) => ({
      id: client.id,
      displayName: client.displayName,
      companyName: client.companyName,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      logoUrl: customerLogoUrl(client),
      isActive: client.isActive
    }));
  const linkedClientContactName = linkedClient ? [linkedClient.firstName, linkedClient.lastName].filter(Boolean).join(" ").trim() : "";
  const initialDraftClientName = sourceClientName || linkedClient?.companyName || linkedClient?.displayName || "";
  const initialDraftContactName = sourceContactName || linkedClientContactName || (!linkedClient?.companyName ? linkedClient?.displayName ?? "" : "");

  return (
    <div style={{ maxWidth: 1680, margin: "0 auto", display: "grid", gap: 18 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}

      <section style={{ ...cardStyle(), display: "grid", gap: 8, background: "linear-gradient(135deg, #ffffff 0%, #f7fbff 54%, #eef6ff 100%)" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2563eb" }}>Quote entry</p>
        <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>Quick, clear quote entry</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Build quote items in one clean layout: choose the product, material, size, artwork, finishing and pickup / delivery / install without stepping through a manual.</p>
      </section>

      <section style={{ ...cardStyle(), display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 260 }}>
            <h2 style={{ margin: 0 }}>{filter === "deleted" ? "Deleted quotes" : "Quote workflow"}</h2>
            <p style={{ margin: "4px 0 0", color: "#667085", fontSize: 13 }}>Create or switch quotes here; use the quick builder below to add lines fast.</p>
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
                  <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                    <ClientLogoBadge logoUrl={sourceLogoUrl} name={survey.clientName} size={46} radius={12} padding={4} />
                    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: survey.installSchedulerSyncStatus === "completed" ? "#067647" : "#155eef" }}>Survey source</p>
                      <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{survey.clientName}</strong>
                    </div>
                  </div>
                  <span style={{ borderRadius: 999, background: survey.installSchedulerSyncStatus === "completed" ? "#dcfae6" : "#eef2ff", color: survey.installSchedulerSyncStatus === "completed" ? "#067647" : "#4338ca", padding: "5px 9px", fontSize: 11, fontWeight: 950 }}>{surveyStatusLabel(survey.status, survey.installSchedulerSyncStatus)}</span>
                </div>
                <p style={{ margin: 0, color: "#475467", fontSize: 13 }}>{survey.siteAddress || "No site address recorded"}</p>
                {sourceEnquiry?.clientPurchaseOrderNumber ? <p style={{ margin: 0, color: "#475467", fontSize: 13 }}>PO: <strong>{sourceEnquiry.clientPurchaseOrderNumber}</strong></p> : null}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {surveyPhotos.length ? <span style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", padding: "4px 9px", fontSize: 12, fontWeight: 850 }}>{surveyPhotos.length} photo{surveyPhotos.length === 1 ? "" : "s"} copied to notes</span> : null}
                  <Link href={`/surveys?selected=${survey.id}`} style={{ textDecoration: "none", minHeight: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 10, border: "1px solid #cbd5e1", color: "#111827", fontSize: 13, fontWeight: 900, padding: "0 10px" }}>Open survey</Link>
                </div>
              </section>
            ) : null}
            {linkedClient ? (
              <section style={{ border: "1px solid #dfe7f2", borderRadius: 18, padding: 12, display: "grid", gridTemplateColumns: "56px 1fr", gap: 12, alignItems: "center", background: "#fbfdff" }}>
                <ClientLogoBadge logoUrl={linkedClientLogoUrl} name={linkedClient.displayName} size={56} radius={14} padding={5} />
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>{linkedClient.displayName}</strong>
                  <span style={{ color: "#667085", fontSize: 13 }}>MYOB price level: <strong>{linkedClientPriceLevelName}</strong> ({linkedClientPriceLevel}) · PM calculated work ×{Number(linkedClientPriceFactor || 1).toFixed(2)}</span>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        <details open={!selectedQuote || Boolean(enquiry || survey)} style={{ border: "1px solid #dbeafe", borderRadius: 18, background: "#f8fbff", padding: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 950, color: "#155eef" }}>New draft quote</summary>
          <NewQuoteDraftForm
            clients={draftClientOptions}
            enquiryId={sourceEnquiry?.id ?? survey?.enquiryId ?? ""}
            surveyRequestId={survey?.id ?? ""}
            initialValues={{
              linkedCustomerId: sourceLinkedCustomerId ?? "",
              clientName: initialDraftClientName,
              contactName: initialDraftContactName,
              phone: sourcePhone || linkedClient?.phone || "",
              email: sourceEmail || linkedClient?.email || "",
              discountPercent: "0",
              notes: defaultQuoteNotes
            }}
          />
        </details>

        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {quoteDrafts.map((quote) => {
            const active = selectedQuote?.id === quote.id;
            const quoteSourceEnquiry = quote.enquiryId ? enquiryById.get(quote.enquiryId) : null;
            const quoteLogoUrl = quoteSourceEnquiry?.clientLogoUrl || customerLogoUrl(quote.linkedCustomerId ? customerById.get(quote.linkedCustomerId) : null);
            return (
              <a key={quote.id} href={`/quotes?selected=${quote.id}`} style={{ flex: "0 0 300px", width: 300, minWidth: 0, maxWidth: 300, textDecoration: "none", color: "inherit", border: active ? "2px solid #155eef" : "1px solid #dfe7f2", borderRadius: 18, padding: 12, display: "grid", gap: 8, background: active ? "#eff6ff" : "#fbfdff", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, minWidth: 0, flex: "1 1 auto", alignItems: "center", overflow: "hidden" }}>
                    <ClientLogoBadge logoUrl={quoteLogoUrl} name={quote.clientName} size={42} radius={12} padding={4} />
                    <strong title={quote.clientName} style={{ display: "block", minWidth: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{quote.clientName}</strong>
                  </div>
                  <span style={{ flex: "0 0 auto", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 9px", fontSize: 11, fontWeight: 900 }}>{quote.status}</span>
                </div>
                <div style={{ color: "#667085", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[quote.contactName, quote.phone, quote.discountPercent !== "0" ? `Manual discount ${quote.discountPercent}%` : null].filter(Boolean).join(" · ")}</div>
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
                  <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
                    <ClientLogoBadge logoUrl={selectedQuoteLogoUrl} name={selectedQuote.clientName} size={58} radius={16} padding={5} />
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Selected quote: {selectedQuote.clientName}</h2>
                      <p style={{ margin: "6px 0 0", color: "#667085" }}>Add line items by building from your material library. Start with Acrylic, ACM, Corflute, PVC, Banner or another sheet material.</p>
                    </div>
                  </div>
                  {(() => { const tone = quoteStatusTone(selectedQuote.status); return <span style={{ border: `1px solid ${tone.border}`, background: tone.bg, color: tone.fg, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{selectedQuote.status.replace(/_/g, " ")}</span>; })()}
                </div>

                <section style={{ border: "1px solid #d9e2ef", borderRadius: 22, background: "linear-gradient(135deg,#ffffff,#f8fbff)", padding: 16, display: "grid", gap: 14 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}>Quote: <strong>{selectedQuote.quoteNumber ?? "Draft"}</strong></span>
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}><strong>{quoteLines.length}</strong> line item{quoteLines.length === 1 ? "" : "s"}</span>
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}>Total: <strong>{formatMoney(quoteSubtotal)}</strong></span>
                    <span style={{ border: "1px solid #bfdbfe", borderRadius: 999, padding: "7px 11px", background: "#eff6ff", color: "#1d4ed8", fontSize: 12 }}>Price level: <strong>{linkedClientPriceLevelName}</strong>{linkedClientPriceLevelName !== linkedClientPriceLevel ? ` (${linkedClientPriceLevel})` : ""}</span>
                    {Number(selectedQuote.discountPercent || 0) > 0 ? <span style={{ border: "1px solid #fed7aa", borderRadius: 999, padding: "7px 11px", background: "#fff7ed", color: "#c2410c", fontSize: 12 }}>Manual quote discount: <strong>{selectedQuote.discountPercent}%</strong></span> : null}
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
                    const needsMyobLink = Boolean(linkedClient && !linkedMyobCustomer);
                    return (
                      <section style={{ border: `1px solid ${needsMyobLink ? "#fdba74" : myobTone.border}`, borderRadius: 18, background: needsMyobLink ? "#fff7ed" : myobTone.bg, color: needsMyobLink ? "#9a3412" : myobTone.fg, padding: 14, display: "grid", gap: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                          <div style={{ display: "grid", gap: 4 }}>
                            <strong>MYOB open job / order</strong>
                            <span style={{ fontSize: 13 }}>Accepted quotes become open MYOB Orders. Drafts, enquiries and surveys stay in Production Manager only.</span>
                            {linkedClient ? <span style={{ fontSize: 13 }}>Client: <strong>{linkedClient.displayName}</strong> · MYOB: <strong>{linkedMyobCustomer ? linkedMyobCustomer.displayName : "Not linked"}</strong>{customerMyobPriceLevel(linkedClient) ? <> · Price level: <strong>{customerMyobPriceLevelName(linkedClient)} ({customerMyobPriceLevel(linkedClient)})</strong></> : null}</span> : null}
                            {selectedQuote.myobOrderNumber ? <span style={{ fontSize: 13 }}>Order: <strong>{selectedQuote.myobOrderNumber}</strong>{selectedQuote.myobOrderSyncedAt ? ` · synced ${formatDateTime(selectedQuote.myobOrderSyncedAt)}` : ""}</span> : null}
                            {selectedQuote.myobOrderSyncError && !needsMyobLink ? <span style={{ fontSize: 13, color: "#b42318", whiteSpace: "pre-wrap" }}>{selectedQuote.myobOrderSyncError}</span> : null}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <span style={{ borderRadius: 999, border: `1px solid ${needsMyobLink ? "#fdba74" : myobTone.border}`, background: "rgba(255,255,255,0.75)", color: needsMyobLink ? "#9a3412" : myobTone.fg, padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>{needsMyobLink ? "MYOB customer link needed" : myobTone.label}</span>
                            {canPush && !needsMyobLink ? (
                              <form action={pushAcceptedQuoteToMyobOrderAction}>
                                <input type="hidden" name="quoteId" value={selectedQuote.id} />
                                <button type="submit" style={{ ...buttonStyle, background: "#0f766e" }}>Send to MYOB Order</button>
                              </form>
                            ) : null}
                          </div>
                        </div>

                        {needsMyobLink ? (
                          <div style={{ borderTop: "1px solid #fed7aa", paddingTop: 12, display: "grid", gap: 12 }}>
                            <form action={linkQuoteClientToMyobAction} style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) auto auto", gap: 8, alignItems: "end" }}>
                              <input type="hidden" name="quoteId" value={selectedQuote.id} />
                              <label style={{ display: "grid", gap: 6 }}>
                                <b style={{ fontSize: 13 }}>Link {linkedClient?.displayName} to existing MYOB customer</b>
                                {importedMyobCustomers.length ? (
                                  <select name="myobCustomerId" defaultValue={suggestedMyobCustomer?.id ?? ""} required style={{ ...inputStyle, minWidth: 0 }}>
                                    <option value="">Choose MYOB customer…</option>
                                    {importedMyobCustomers.map((candidate) => (
                                      <option key={candidate.id} value={candidate.id}>{candidate.displayName}{candidate.companyName && candidate.companyName !== candidate.displayName ? ` — ${candidate.companyName}` : ""}{candidate.email ? ` · ${candidate.email}` : ""}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span style={{ fontSize: 13 }}>No imported MYOB customers are available yet.</span>
                                )}
                                {suggestedMyobCustomer ? <span style={{ fontSize: 12, color: "#9a3412" }}>Suggested match: <strong>{suggestedMyobCustomer.displayName}</strong></span> : null}
                              </label>
                              {importedMyobCustomers.length ? <MyobSubmitButton label="Link customer" pendingLabel="Linking…" background="#475467" /> : <Link href="/integrations" style={{ ...buttonStyle, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Import MYOB customers</Link>}
                              {importedMyobCustomers.length && selectedQuote.status === "accepted" ? <MyobSubmitButton label="Link & send to MYOB" pendingLabel="Linking & sending…" background="#0f766e" name="sendNow" value="1" /> : null}
                            </form>

                            <form action={createQuoteClientInMyobAction} style={{ border: "1px solid #fed7aa", borderRadius: 14, background: "rgba(255,255,255,0.72)", padding: 12, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                              <input type="hidden" name="quoteId" value={selectedQuote.id} />
                              <div style={{ display: "grid", gap: 3, minWidth: 240, flex: "1 1 360px" }}>
                                <b style={{ fontSize: 13 }}>Client is not in MYOB?</b>
                                <span style={{ fontSize: 12, color: "#9a3412" }}>Production Manager checks MYOB for an exact company/email match first. If one exists it links it; otherwise it creates a new MYOB customer and stores the MYOB link permanently.</span>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <MyobSubmitButton label="Create in MYOB" pendingLabel="Checking MYOB…" background="#7c3aed" />
                                {selectedQuote.status === "accepted" ? <MyobSubmitButton label="Create & send to MYOB" pendingLabel="Creating & sending…" background="#0f766e" name="sendNow" value="1" /> : null}
                              </div>
                            </form>
                          </div>
                        ) : null}
                      </section>
                    );
                  })()}

                  {selectedQuote.clientResponseNotes ? <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412", borderRadius: 16, padding: 12 }}><strong>Client notes:</strong><br />{selectedQuote.clientResponseNotes}</div> : null}
                </section>
              </div>

              {selectedQuote.status !== "deleted" ? (
                <QuoteMaterialFlowBuilder
                  key={editingQuoteLine?.id ?? "new-quote-line"}
                  quoteId={selectedQuote.id}
                  materials={activeMaterials}
                  savedProducts={savedQuoteProducts}
                  editingLine={editingQuoteLine}
                  editingStep={editingStep}
                  pricingSettings={{
                    markupMultiplier: companySettings?.globalMarkupMultiplier ?? "1.5",
                    profitMultiplier: companySettings?.globalProfitMultiplier ?? "1.2",
                    labourRate: companySettings?.quoteLabourRate ?? "66",
                    inkRatePerSqm: companySettings?.quoteInkRatePerSqm ?? "10",
                    inkBillingIncrementSqm: companySettings?.quoteInkBillingIncrementSqm ?? "0.5",
                    monoRatePerSqm: companySettings?.quoteMonoRatePerSqm ?? "4",
                    signageSizePresets: companySettings?.quoteSignageSizePresets,
                    smallSizePresets: companySettings?.quoteSmallSizePresets,
                    priceLevelFactor: linkedClientPriceFactor,
                    priceLevelName: linkedClientPriceLevelName,
                    priceLevelCode: linkedClientPriceLevel,
                    manualQuoteDiscountPercent: selectedQuote.discountPercent
                  }}
                />
              ) : (
                <section style={{ border: "1px solid #fecaca", borderRadius: 18, padding: 16, background: "#fff5f4", color: "#b42318", fontWeight: 800 }}>This quote is deleted. Restore it before editing or sending.</section>
              )}

              <div id="saved-lines" style={{ display: "grid", gap: 10, scrollMarginTop: 18 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h4 style={{ margin: 0 }}>Saved quote lines</h4>
                  <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Saved-product options edit in the breakdown. Quick-builder lines reopen their original controls; older lines can be rebuilt once.</p>
                </div>
                {quoteLines.map((line) => {
                  const editableProduct = line.productId ? savedQuoteProducts.find((product) => product.id === line.productId) ?? null : null;
                  return (
                    <details key={line.id} style={{ border: "1px solid #dfe7f2", borderRadius: 18, padding: 0, background: "#fbfdff", overflow: "hidden" }}>
                      <summary style={{ listStyle: "none", cursor: "pointer", padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                          <div style={{ display: "grid", gap: 4, minWidth: 260 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <strong style={{ textDecoration: line.clientResponseStatus === "cancelled" ? "line-through" : "none" }}>{line.productName}</strong>
                              {line.clientResponseStatus !== "pending" ? (
                                <span style={{
                                  borderRadius: 999,
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  fontWeight: 950,
                                  background: line.clientResponseStatus === "approved" ? "#dcfae6" : line.clientResponseStatus === "cancelled" ? "#fee4e2" : "#ffedd5",
                                  color: line.clientResponseStatus === "approved" ? "#067647" : line.clientResponseStatus === "cancelled" ? "#b42318" : "#c2410c"
                                }}>
                                  {line.clientResponseStatus === "approved" ? "Client approved" : line.clientResponseStatus === "cancelled" ? "Client cancelled" : "Changes requested"}
                                </span>
                              ) : null}
                            </div>
                            <div style={{ color: "#667085", fontSize: 13 }}>{[line.optionSummary, `Qty ${line.quantity}`, `Unit $${cleanQuoteLineAmount(line.unitPrice)}`, `Total $${cleanQuoteLineAmount(line.lineTotal)}`].filter(Boolean).join(" · ")}</div>
                            {line.clientResponseNotes ? <div style={{ color: line.clientResponseStatus === "changes_requested" ? "#9a3412" : "#667085", fontSize: 12 }}><strong>Client line note:</strong> {line.clientResponseNotes}</div> : null}
                          </div>
                          <span style={{ borderRadius: 999, background: "#eef4ff", color: "#155eef", padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>View / edit</span>
                        </div>
                      </summary>

                      <div style={{ borderTop: "1px solid #e5edf7", padding: 14, display: "grid", gap: 14, background: "#ffffff" }}>
                        <QuoteLineEditor
                          quoteId={selectedQuote.id}
                          line={{
                            id: line.id,
                            productName: line.productName,
                            optionSummary: line.optionSummary,
                            quantity: line.quantity,
                            unitPrice: line.unitPrice,
                            notes: line.notes,
                            configurationSnapshot: line.configurationSnapshot,
                            createdAt: line.createdAt
                          }}
                          product={editableProduct}
                          materials={activeMaterials}
                          pricingSettings={{
                            markupMultiplier: companySettings?.globalMarkupMultiplier ?? "1.5",
                            profitMultiplier: companySettings?.globalProfitMultiplier ?? "1.2",
                            priceLevelFactor: linkedClientPriceFactor,
                            priceLevelName: linkedClientPriceLevelName,
                            priceLevelCode: linkedClientPriceLevel,
                            manualQuoteDiscountPercent: selectedQuote.discountPercent
                          }}
                        />

                        <form action={deleteQuoteLineAction} style={{ display: "flex", justifyContent: "flex-end" }}>
                          <input type="hidden" name="quoteId" value={selectedQuote.id} />
                          <input type="hidden" name="lineId" value={line.id} />
                          <button type="submit" style={{ border: "1px solid #fecaca", background: "#fff", color: "#b42318", borderRadius: 12, padding: "8px 10px", fontWeight: 900, cursor: "pointer" }}>Remove line</button>
                        </form>
                      </div>
                    </details>
                  );
                })}
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
