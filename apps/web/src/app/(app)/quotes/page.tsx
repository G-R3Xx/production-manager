import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById, listEnquiriesForTenant, listEnquiryCorrespondenceForEnquiry } from "@/server/enquiries";
import { getSurveyRequestById } from "@/server/surveys";
import { listMaterialsForTenant } from "@/server/materials";
import { listQuoteProductsForTenant } from "@/server/products";
import { customerLogoUrl, customerMyobPriceLevel, customerMyobPriceLevelName, listCustomersForTenant } from "@/server/customers";
import { getCompanySettingsByTenantId } from "@/server/company";
import { createArtworkApprovalAction, createQuoteClientInMyobAction, deleteQuoteDraftAction, deleteQuoteLineAction, emailQuoteAction, linkQuoteClientToMyobAction, linkQuoteToProductionManagerClientAction, markQuoteAcceptedManuallyAction, markQuoteSentAction, pushAcceptedQuoteToMyobOrderAction, restoreQuoteDraftAction, saveMyobSalesDefaultsAction, updateQuoteJobNameAction } from "./actions";
import { QuoteMaterialFlowBuilder } from "./QuoteMaterialFlowBuilder";
import { QuoteLineEditor } from "./QuoteLineEditor";
import { getArtworkApprovalForQuote, getQuoteDraftById, listQuoteDraftsForTenant, listQuoteLines, quoteActivityFingerprint } from "@/server/quotes";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";
import { NewQuoteDraftForm } from "./NewQuoteDraftForm";
import { MyobSubmitButton } from "./MyobSubmitButton";
import { QuoteStatusAutoRefresh } from "./QuoteStatusAutoRefresh";
import { getMyobSalesDefaults } from "@/server/myob-sales-settings";
import { fetchMyobSalesReferenceDataForTenant } from "@/server/myob-sync";
import { getProductionJobForQuote } from "@/server/production";
import { EnquiryCorrespondencePreview } from "../enquiries/EnquiryCorrespondencePreview";
import { EmailRecipientModalForm } from "@/components/EmailRecipientModalForm";

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



type SurveyLineReference = {
  title: string;
  location: string;
  width: string;
  height: string;
  depth: string;
  quantity: string;
  description: string;
  condition: string;
  requiredWork: string;
  fixingMethod: string;
  accessNotes: string;
  powerRequired: string;
  notes: string;
  photos: Array<{ url: string; fileName: string; annotated: boolean }>;
};

function surveyLineReference(value: unknown): SurveyLineReference | null {
  if (!isRecord(value)) return null;
  const context = isRecord(value.surveyContext) ? value.surveyContext : null;
  if (!context) return null;
  const photos = Array.isArray(context.photos) ? context.photos.flatMap((raw): SurveyLineReference["photos"] => {
    if (!isRecord(raw)) return [];
    const url = textValue(raw.url);
    if (!url) return [];
    return [{ url, fileName: textValue(raw.fileName) || "Survey photo", annotated: Boolean(raw.annotated) }];
  }) : [];
  return {
    title: textValue(context.title),
    location: textValue(context.location),
    width: textValue(context.width),
    height: textValue(context.height),
    depth: textValue(context.depth),
    quantity: textValue(context.quantity),
    description: textValue(context.description),
    condition: textValue(context.condition),
    requiredWork: textValue(context.requiredWork),
    fixingMethod: textValue(context.fixingMethod),
    accessNotes: textValue(context.accessNotes),
    powerRequired: textValue(context.powerRequired),
    notes: textValue(context.notes),
    photos,
  };
}

function surveyLineNeedsConfiguration(value: unknown): boolean {
  return isRecord(value) && value.surveyNeedsConfiguration === true;
}

function displayedLineSummary(value: string | null, isSurveyLine: boolean): string | null {
  if (!value || !isSurveyLine) return value;
  const cleaned = value
    .replace(/^Survey item\s*[—-]\s*configure material\s*\/\s*print\s*(?:·\s*)?/i, "")
    .trim();
  return cleaned || null;
}

type StaffPricingBreakdownRow = {
  label: string;
  detail: string;
  amount: number;
  unit: string;
};

function recordValue(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function numberFromUnknown(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function staffUsage(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function staffPricingBreakdown(configurationSnapshot: unknown): StaffPricingBreakdownRow[] {
  const snapshot = recordValue(configurationSnapshot);
  const pricing = recordValue(snapshot?.pricingSnapshot);
  const rows = Array.isArray(pricing?.pricingBreakdown) ? pricing.pricingBreakdown : [];
  return rows.flatMap((raw): StaffPricingBreakdownRow[] => {
    const row = recordValue(raw);
    if (!row) return [];
    return [{
      label: textValue(row.label),
      detail: textValue(row.detail),
      amount: numberFromUnknown(row.amount),
      unit: textValue(row.unit),
    }];
  });
}

function staffFixingAllowance(configurationSnapshot: unknown): string {
  const snapshot = recordValue(configurationSnapshot);
  if (!snapshot) return "";
  const selected = Array.isArray(snapshot.serviceFixings)
    ? snapshot.serviceFixings.filter((value): value is string => typeof value === "string")
    : [];
  const qtyMap = recordValue(snapshot.serviceFixingQty) ?? {};
  const meta: Record<string, { label: string; unit: string }> = {
    silicone: { label: "Silicone", unit: "tube" },
    tape: { label: "VHB / double-sided tape", unit: "lm" },
    screws: { label: "Screws / anchors", unit: "each" },
    screws_custom: { label: "Screws / special fixings", unit: "each" },
    other: { label: "Other consumables", unit: "allowance" },
  };
  return selected.map((key) => {
    const item = meta[key];
    if (!item) return "";
    const qty = numberFromUnknown(qtyMap[key]);
    if (qty <= 0) return item.label;
    const pluralUnit = item.unit === "tube" && Math.abs(qty - 1) > 0.0001
      ? "tubes"
      : item.unit === "allowance" && Math.abs(qty - 1) > 0.0001
        ? "allowances"
        : item.unit;
    const amount = pluralUnit === "lm" ? `${staffUsage(qty)}lm` : `${staffUsage(qty)} ${pluralUnit}`;
    return `${item.label} — ${amount}`;
  }).filter(Boolean).join(", ");
}

function staffLineSummary(optionSummary: string | null, configurationSnapshot: unknown, quantity: string): string | null {
  const snapshot = recordValue(configurationSnapshot);
  const flowType = textValue(snapshot?.flowType);
  const serviceType = textValue(snapshot?.serviceType);
  let parts = String(optionSummary ?? "").split(" · ").map((part) => part.trim()).filter(Boolean);

  // Install detail belongs on the dedicated install line, never on the substrate/product line.
  parts = parts.filter((part) => !(part.toLowerCase().startsWith("dispatch:") && part.toLowerCase().includes("install")));

  if (flowType === "service" && serviceType === "install") {
    parts = parts.filter((part) => !part.toLowerCase().startsWith("fixings:") && !part.toLowerCase().startsWith("fixings allowance:"));
    const allowance = staffFixingAllowance(configurationSnapshot);
    if (allowance) parts.push(`Fixings allowance: ${allowance}`);
    return parts.join(" · ") || null;
  }

  if (flowType !== "signage") return parts.join(" · ") || null;

  // New lines already save the calculated production usage in their summary. Keep those as-is.
  if (parts.some((part) => /^(stock|print media|cut vinyl|ink|backing|laminate):.+—.+calculated/i.test(part))) {
    return parts.join(" · ") || null;
  }

  const rows = staffPricingBreakdown(configurationSnapshot);
  if (!rows.length) return parts.join(" · ") || null;
  const qty = Math.max(0, numberFromUnknown(quantity));
  const totalFor = (row: StaffPricingBreakdownRow) => row.amount * qty;
  const usageParts: string[] = [];
  const replacedDetails = new Set<string>();

  const base = rows.find((row) => row.label === "Base material" && (row.unit === "sheet" || row.unit === "lm"));
  if (base && totalFor(base) > 0) {
    replacedDetails.add(base.detail.toLowerCase());
    const total = totalFor(base);
    usageParts.push(base.unit === "sheet"
      ? `Stock: ${base.detail} — ${staffUsage(total)} sheet${Math.abs(total - 1) < 0.0001 ? "" : "s"} calculated`
      : `Stock: ${base.detail} — ${staffUsage(total)}lm calculated`);
  }

  const media = rows.find((row) => (row.label === "Roll print media" || row.label === "Cut vinyl") && row.unit === "lm");
  if (media && totalFor(media) > 0) {
    replacedDetails.add(media.detail.toLowerCase());
    usageParts.push(`${media.label === "Cut vinyl" ? "Cut vinyl" : "Print media"}: ${media.detail} — ${staffUsage(totalFor(media))}lm calculated`);
  }

  rows.filter((row) => (row.label === "CMYK ink" || row.label === "White ink") && row.unit === "sqm" && totalFor(row) > 0).forEach((row) => {
    usageParts.push(`Ink: ${row.label.replace(/ ink$/i, "")} — ${staffUsage(totalFor(row))}sqm calculated`);
  });

  const backing = rows.find((row) => row.label === "Backing film" && row.unit === "lm");
  if (backing && totalFor(backing) > 0) {
    replacedDetails.add(backing.detail.toLowerCase());
    usageParts.push(`Backing: ${backing.detail} — ${staffUsage(totalFor(backing))}lm calculated`);
  }

  const laminate = rows.find((row) => row.label === "Laminate" && row.unit === "lm");
  if (laminate && totalFor(laminate) > 0) {
    replacedDetails.add(laminate.detail.toLowerCase());
    usageParts.push(`Laminate: ${laminate.detail} — ${staffUsage(totalFor(laminate))}lm calculated`);
  }

  parts = parts.filter((part) => {
    const lower = part.toLowerCase();
    if (lower.startsWith("substrate:") || lower.startsWith("backing:") || lower.startsWith("laminate:")) return false;
    if (["cmyk", "white ink", "cmyk + white", "cmyk white"].includes(lower)) return false;
    if (replacedDetails.has(lower)) return false;
    return true;
  });

  return [...parts, ...usageParts].join(" · ") || null;
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

type QuoteLifecycleStep = {
  label: string;
  detail: string;
  complete: boolean;
  current: boolean;
  tone?: "green" | "orange" | "red";
};

function QuoteLifecycleStrip({ steps }: { steps: QuoteLifecycleStep[] }) {
  return (
    <section style={{ border: "1px solid #dbe5f1", borderRadius: 16, background: "linear-gradient(135deg,#f8fbff,#ffffff)", padding: 12, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, minmax(130px, 1fr))`, minWidth: steps.length * 130, alignItems: "start" }}>
        {steps.map((step, index) => {
          const colour = step.tone === "red" ? "#b42318" : step.tone === "orange" ? "#c2410c" : step.complete ? "#067647" : step.current ? "#155eef" : "#98a2b3";
          const background = step.tone === "red" ? "#fee4e2" : step.tone === "orange" ? "#ffedd5" : step.complete ? "#dcfae6" : step.current ? "#dbeafe" : "#f2f4f7";
          return (
            <div key={step.label} style={{ position: "relative", display: "grid", justifyItems: "center", gap: 5, textAlign: "center", padding: "0 6px" }}>
              {index > 0 ? <span aria-hidden="true" style={{ position: "absolute", top: 15, right: "50%", width: "100%", height: 3, background: steps[index - 1]?.complete ? "#86efac" : "#d0d5dd", zIndex: 0 }} /> : null}
              <span style={{ width: 32, height: 32, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background, color: colour, border: `2px solid ${colour}`, fontWeight: 950, position: "relative", zIndex: 1 }}>{step.complete ? "✓" : index + 1}</span>
              <strong style={{ color: step.current || step.complete ? "#101828" : "#667085", fontSize: 12 }}>{step.label}</strong>
              <span style={{ color: colour, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>{step.detail}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
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
  const focusLine = readParam(params, "focusLine");
  const filter = readParam(params, "filter");

  const builderDataNeeded = Boolean(selected);
  const [allQuoteDrafts, materials, enquiry, survey, selectedQuote, companySettings, clients, allEnquiries, quoteProducts, salesDefaults] = await Promise.all([
    listQuoteDraftsForTenant(activeTenant.tenantId, { includeDeleted: true }),
    builderDataNeeded ? listMaterialsForTenant(activeTenant.tenantId) : Promise.resolve([]),
    fromEnquiry ? getEnquiryById(activeTenant.tenantId, fromEnquiry) : Promise.resolve(null),
    fromSurvey ? getSurveyRequestById(activeTenant.tenantId, fromSurvey) : Promise.resolve(null),
    selected ? getQuoteDraftById(activeTenant.tenantId, selected) : Promise.resolve(null),
    builderDataNeeded ? getCompanySettingsByTenantId(activeTenant.tenantId) : Promise.resolve(null),
    listCustomersForTenant(activeTenant.tenantId),
    listEnquiriesForTenant(activeTenant.tenantId, { includeDeleted: true }),
    builderDataNeeded ? listQuoteProductsForTenant(activeTenant.tenantId) : Promise.resolve([]),
    selected ? getMyobSalesDefaults(activeTenant.tenantId) : Promise.resolve({ incomeAccountUid: null, incomeAccountName: null, incomeAccountDisplayId: null })
  ]);
  const salesReferences = selectedQuote?.status === "accepted"
    ? await fetchMyobSalesReferenceDataForTenant(activeTenant.tenantId).catch(() => ({ accounts: [] }))
    : { accounts: [] };

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
  const myobMatrixItems = quoteProducts
    .map((product) => {
      const matrix = product.payloadJson?.myobPriceMatrix;
      const syncedAt = typeof product.payloadJson?.myobPriceMatrixSyncedAt === "string" ? product.payloadJson.myobPriceMatrixSyncedAt : null;
      return product.myobUid && matrix && typeof matrix === "object" && !Array.isArray(matrix)
        ? {
            id: product.id,
            name: product.name,
            sku: product.sku,
            department: product.department,
            myobUid: product.myobUid,
            myobPriceMatrix: matrix as Record<string, unknown>,
            myobPriceMatrixSyncedAt: syncedAt
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => {
      const text = `${item.sku ?? ""} ${item.name}`.toLowerCase();
      return item.department === "plan_printing" || /\b(plan|plans|plot|plotting|drawing|drawings|cad|blueprint|a0|a1|a2|a3|a4|mono|monochrome|colour|color|cmyk|b\s*&?\s*w)\b/.test(text);
    });
  const customerById = new Map(clients.map((client) => [client.id, client]));
  const enquiryById = new Map(allEnquiries.map((item) => [item.id, item]));
  const surveySourceEnquiry = survey?.enquiryId ? enquiryById.get(survey.enquiryId) ?? null : null;
  const selectedQuoteSourceEnquiry = selectedQuote?.enquiryId ? enquiryById.get(selectedQuote.enquiryId) ?? null : null;
  const sourceEnquiry = enquiry ?? surveySourceEnquiry ?? selectedQuoteSourceEnquiry;
  const sourceClientName = survey?.clientName ?? sourceEnquiry?.clientName ?? "";
  const sourceContactName = survey?.contactName ?? sourceEnquiry?.contactName ?? "";
  const sourcePhone = survey?.phone ?? sourceEnquiry?.phone ?? "";
  const sourceEmail = sourceEnquiry?.email ?? "";
  const sourceLinkedCustomerId = survey?.linkedCustomerId ?? sourceEnquiry?.linkedCustomerId ?? selectedQuote?.linkedCustomerId ?? null;

  const [quoteLines, selectedArtworkApproval, selectedProductionJob] = await Promise.all([
    selectedQuote ? listQuoteLines(selectedQuote.id) : Promise.resolve([]),
    selectedQuote ? getArtworkApprovalForQuote(activeTenant.tenantId, selectedQuote.id) : Promise.resolve(null),
    selectedQuote ? getProductionJobForQuote(activeTenant.tenantId, selectedQuote.id) : Promise.resolve(null)
  ]);
  const selectedQuoteEnquiryCorrespondence = selectedQuoteSourceEnquiry
    ? await listEnquiryCorrespondenceForEnquiry(activeTenant.tenantId, selectedQuoteSourceEnquiry.id, 12)
    : [];
  const selectedQuoteFingerprint = selectedQuote ? quoteActivityFingerprint(selectedQuote, quoteLines) : "";
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
  const quoteClientEmail = String(selectedQuote?.email ?? "").trim().toLowerCase();
  const quoteClientName = String(selectedQuote?.clientName ?? "").trim().toLowerCase();
  const suggestedPmClients = !linkedClient ? clients.filter((candidate) => {
    const candidateEmail = String(candidate.email ?? "").trim().toLowerCase();
    const candidateName = String(candidate.companyName || candidate.displayName || "").trim().toLowerCase();
    return (quoteClientEmail && candidateEmail === quoteClientEmail) || (quoteClientName && candidateName === quoteClientName);
  }) : [];
  const suggestedPmClient = suggestedPmClients.length === 1 ? suggestedPmClients[0] : null;

  const quoteSubtotal = quoteLines.reduce((sum, line) => line.clientResponseStatus === "cancelled" ? sum : sum + parseMoney(line.lineTotal), 0);
  const activeQuoteLines = quoteLines.filter((line) => line.clientResponseStatus !== "cancelled");
  const quoteIsPriced = activeQuoteLines.length > 0 && activeQuoteLines.every((line) => parseMoney(line.unitPrice) > 0 && !surveyLineNeedsConfiguration(line.configurationSnapshot));
  const quoteResponseLabel = selectedQuote?.acceptedAt
    ? "Accepted"
    : selectedQuote?.changesRequestedAt
      ? "Changes requested"
      : selectedQuote?.declinedAt
        ? "Declined"
        : selectedQuote?.viewedAt
          ? "Awaiting response"
          : "Pending";
  const quoteLifecycleSteps: QuoteLifecycleStep[] = selectedQuote ? [
    { label: "Created", detail: formatDateTime(selectedQuote.createdAt), complete: true, current: false },
    { label: "Priced", detail: quoteIsPriced ? `${activeQuoteLines.length} line${activeQuoteLines.length === 1 ? "" : "s"}` : "Complete pricing", complete: quoteIsPriced, current: !quoteIsPriced },
    { label: "Sent", detail: selectedQuote.sentAt ? formatDateTime(selectedQuote.sentAt) : "Not sent", complete: Boolean(selectedQuote.sentAt), current: Boolean(quoteIsPriced && !selectedQuote.sentAt) },
    { label: "Viewed", detail: selectedQuote.viewedAt ? formatDateTime(selectedQuote.viewedAt) : "Not viewed", complete: Boolean(selectedQuote.viewedAt), current: Boolean(selectedQuote.sentAt && !selectedQuote.viewedAt) },
    {
      label: "Client response",
      detail: quoteResponseLabel,
      complete: Boolean(selectedQuote.acceptedAt || selectedQuote.changesRequestedAt || selectedQuote.declinedAt),
      current: Boolean(selectedQuote.viewedAt && !selectedQuote.acceptedAt && !selectedQuote.changesRequestedAt && !selectedQuote.declinedAt),
      tone: selectedQuote.acceptedAt ? "green" : selectedQuote.changesRequestedAt ? "orange" : selectedQuote.declinedAt ? "red" : undefined,
    },
  ] : [];
  const requestedChangeLines = quoteLines.filter((line) => line.clientResponseStatus === "changes_requested");
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

        <details open={!selectedQuote} style={{ border: "1px solid #dbeafe", borderRadius: 18, background: "#f8fbff", padding: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 950, color: "#155eef" }}>New draft quote</summary>
          <NewQuoteDraftForm
            clients={draftClientOptions}
            enquiryId={sourceEnquiry?.id ?? survey?.enquiryId ?? ""}
            surveyRequestId={survey?.id ?? ""}
            initialValues={{
              jobName: "",
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
                <div style={{ color: "#667085", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[quote.jobName, quote.contactName, quote.phone, quote.discountPercent !== "0" ? `Manual discount ${quote.discountPercent}%` : null].filter(Boolean).join(" · ")}</div>
              </a>
            );
          })}
          {quoteDrafts.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No draft quotes yet.</p> : null}
        </div>
      </section>

      <section style={{ ...cardStyle(), display: "grid", gap: 16 }}>
          {selectedQuote ? (
            <div style={{ display: "grid", gap: 16 }}>
              <QuoteStatusAutoRefresh quoteId={selectedQuote.id} fingerprint={selectedQuoteFingerprint} />
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
                    <ClientLogoBadge logoUrl={selectedQuoteLogoUrl} name={selectedQuote.clientName} size={58} radius={16} padding={5} />
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Selected quote: {selectedQuote.jobName || selectedQuote.clientName}</h2>
                      <p style={{ margin: "6px 0 0", color: "#667085" }}>Client: <strong>{selectedQuote.clientName}</strong> · Add line items by building from your material library.</p>
                    </div>
                  </div>
                  {requestedChangeLines.length ? (
                    <div style={{ flex: "1 1 520px", maxWidth: 780, border: "1px solid #fdba74", borderRadius: 16, background: "#fff7ed", color: "#9a3412", padding: "10px 12px", display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 13 }}>Client requested changes</strong>
                        <span style={{ fontSize: 11, fontWeight: 900, color: "#c2410c" }}>{requestedChangeLines.length} line{requestedChangeLines.length === 1 ? "" : "s"}</span>
                      </div>
                      <div style={{ display: "grid", gap: 4 }}>
                        {requestedChangeLines.slice(0, 3).map((line) => (
                          <a key={line.id} href={`#quote-line-${line.id}`} style={{ color: "#9a3412", textDecoration: "none", fontSize: 12, lineHeight: 1.4 }}>
                            <strong>{line.productName}</strong>{line.clientResponseNotes ? ` — ${line.clientResponseNotes}` : " — Review requested changes"}
                          </a>
                        ))}
                        {requestedChangeLines.length > 3 ? <span style={{ fontSize: 11, color: "#c2410c" }}>+ {requestedChangeLines.length - 3} more requested-change line{requestedChangeLines.length - 3 === 1 ? "" : "s"}</span> : null}
                      </div>
                    </div>
                  ) : null}
                  {(() => { const tone = quoteStatusTone(selectedQuote.status); return <span style={{ border: `1px solid ${tone.border}`, background: tone.bg, color: tone.fg, borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{selectedQuote.status.replace(/_/g, " ")}</span>; })()}
                </div>

                <section style={{ border: "1px solid #d9e2ef", borderRadius: 22, background: "linear-gradient(135deg,#ffffff,#f8fbff)", padding: 16, display: "grid", gap: 14 }}>
                  <form action={updateQuoteJobNameAction} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "end" }}>
                    <input type="hidden" name="quoteId" value={selectedQuote.id} />
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 950, color: "#344054", textTransform: "uppercase", letterSpacing: "0.06em" }}>Job name / quote title</span>
                      <input
                        name="jobName"
                        defaultValue={selectedQuote.jobName ?? ""}
                        placeholder="e.g. Fyshwick reception signs"
                        required
                        maxLength={255}
                        style={{ minHeight: 44, borderRadius: 14, border: "1px solid #cfd9e8", padding: "0 14px", width: "100%", boxSizing: "border-box", background: "#fff" }}
                      />
                    </label>
                    <button type="submit" style={{ ...buttonStyle, minWidth: 132 }}>Save job name</button>
                    <small style={{ gridColumn: "1 / -1", color: "#667085" }}>This is the customer-facing heading used on the quote and carried into the Artwork / Production workflow.</small>
                  </form>
                  <QuoteLifecycleStrip steps={quoteLifecycleSteps} />
                  {selectedQuoteSourceEnquiry ? (
                    <section
                      style={{ border: "1px solid #bfdbfe", borderRadius: 16, background: "#f8fbff", overflow: "hidden", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
                    >
                      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
                        <div style={{ display: "grid", gap: 3, minWidth: 0, flex: "1 1 420px" }}>
                          <strong style={{ color: "#1d4ed8" }}>Enquiry details & correspondence</strong>
                          <span style={{ color: "#475467", fontSize: 12, overflowWrap: "anywhere" }}>{selectedQuoteSourceEnquiry.requestSummary}</span>
                        </div>
                        <span style={{ border: "1px solid #bfdbfe", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", padding: "5px 9px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>
                          {selectedQuoteEnquiryCorrespondence[0]?.totalCount ?? selectedQuoteEnquiryCorrespondence.length} attachment{(selectedQuoteEnquiryCorrespondence[0]?.totalCount ?? selectedQuoteEnquiryCorrespondence.length) === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div style={{ borderTop: "1px solid #dbeafe", padding: 14, display: "grid", gap: 12, minWidth: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))", gap: 8, minWidth: 0 }}>
                          <div style={{ border: "1px solid #e4e7ec", borderRadius: 12, background: "#fff", padding: 10, display: "grid", gap: 4, minWidth: 0 }}>
                            <span style={{ color: "#667085", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>Client / contact</span>
                            <strong style={{ overflowWrap: "anywhere" }}>{selectedQuoteSourceEnquiry.clientName}</strong>
                            <span style={{ color: "#475467", fontSize: 12, overflowWrap: "anywhere" }}>{[selectedQuoteSourceEnquiry.contactName, selectedQuoteSourceEnquiry.phone, selectedQuoteSourceEnquiry.email].filter(Boolean).join(" · ") || "No contact details recorded"}</span>
                          </div>
                          <div style={{ border: "1px solid #e4e7ec", borderRadius: 12, background: "#fff", padding: 10, display: "grid", gap: 4, minWidth: 0 }}>
                            <span style={{ color: "#667085", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>Site / reference</span>
                            <strong style={{ overflowWrap: "anywhere" }}>{selectedQuoteSourceEnquiry.siteAddress || "No site address recorded"}</strong>
                            <span style={{ color: "#475467", fontSize: 12, overflowWrap: "anywhere" }}>{[selectedQuoteSourceEnquiry.clientPurchaseOrderNumber ? `PO ${selectedQuoteSourceEnquiry.clientPurchaseOrderNumber}` : null, selectedQuoteSourceEnquiry.urgency ? `${selectedQuoteSourceEnquiry.urgency} priority` : null, selectedQuoteSourceEnquiry.source].filter(Boolean).join(" · ")}</span>
                          </div>
                        </div>
                        <div style={{ border: "1px solid #e4e7ec", borderRadius: 12, background: "#fff", padding: 10, display: "grid", gap: 4, minWidth: 0 }}>
                          <span style={{ color: "#667085", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>Original enquiry request</span>
                          <div style={{ color: "#101828", whiteSpace: "pre-wrap", lineHeight: 1.45, overflowWrap: "anywhere" }}>{selectedQuoteSourceEnquiry.requestSummary}</div>
                          {selectedQuoteSourceEnquiry.notes ? <div style={{ color: "#475467", fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><strong>Internal notes:</strong> {selectedQuoteSourceEnquiry.notes}</div> : null}
                        </div>
                        <details style={{ border: "1px solid #dbeafe", borderRadius: 12, background: "#fff", overflow: "hidden", minWidth: 0, maxWidth: "100%" }}>
                          <summary style={{ cursor: "pointer", listStyle: "none", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                              <strong style={{ fontSize: 13 }}>Photos, emails & attachments</strong>
                              <span style={{ border: "1px solid #dbeafe", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", padding: "3px 7px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" }}>
                                {selectedQuoteEnquiryCorrespondence[0]?.totalCount ?? selectedQuoteEnquiryCorrespondence.length}
                              </span>
                            </div>
                            <span style={{ color: "#155eef", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>View attachments ▾</span>
                          </summary>
                          <div style={{ borderTop: "1px solid #dbeafe", padding: 10, display: "grid", gap: 8, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
                            <div style={{ display: "flex", justifyContent: "flex-end", minWidth: 0 }}>
                              <a href={`/enquiries${selectedQuoteSourceEnquiry.status === "converted" ? "?filter=completed&" : selectedQuoteSourceEnquiry.status === "deleted" ? "?filter=deleted&" : "?"}selectedEnquiry=${selectedQuoteSourceEnquiry.id}#enquiry-${selectedQuoteSourceEnquiry.id}`} style={{ color: "#155eef", fontSize: 12, fontWeight: 800, textDecoration: "none", overflowWrap: "anywhere" }}>Open Enquiries page ↗</a>
                            </div>
                            {selectedQuoteEnquiryCorrespondence.length ? (
                              <div style={{ display: "grid", gap: 8, minWidth: 0, maxWidth: "100%" }}>
                                {selectedQuoteEnquiryCorrespondence.map((item) => <EnquiryCorrespondencePreview key={item.id} item={item} />)}
                              </div>
                            ) : (
                              <span style={{ color: "#98a2b3", fontSize: 12 }}>No enquiry correspondence or photos attached.</span>
                            )}
                          </div>
                        </details>
                      </div>
                    </section>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}>Quote: <strong>{selectedQuote.quoteNumber ?? "Draft"}</strong></span>
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}><strong>{quoteLines.length}</strong> line item{quoteLines.length === 1 ? "" : "s"}</span>
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}>Total: <strong>{formatMoney(quoteSubtotal)}</strong></span>
                    <span style={{ border: "1px solid #bfdbfe", borderRadius: 999, padding: "7px 11px", background: "#eff6ff", color: "#1d4ed8", fontSize: 12 }}>Price level: <strong>{linkedClientPriceLevelName}</strong>{linkedClientPriceLevelName !== linkedClientPriceLevel ? ` (${linkedClientPriceLevel})` : ""}</span>
                    {Number(selectedQuote.discountPercent || 0) > 0 ? <span style={{ border: "1px solid #fed7aa", borderRadius: 999, padding: "7px 11px", background: "#fff7ed", color: "#c2410c", fontSize: 12 }}>Manual quote discount: <strong>{selectedQuote.discountPercent}%</strong></span> : null}
                    <span style={{ border: "1px solid #e4e7ec", borderRadius: 999, padding: "7px 11px", background: "#fff", fontSize: 12 }}>Client: <strong>{selectedQuote.acceptedAt ? "Accepted" : selectedQuote.changesRequestedAt ? "Changes requested" : selectedQuote.declinedAt ? "Declined" : selectedQuote.viewedAt ? "Viewed" : selectedQuote.sentAt ? "Sent" : "Not sent"}</strong></span>
                    <span style={{ border: `1px solid ${selectedQuote.emailStatus === "sent" ? "#86efac" : selectedQuote.emailStatus === "failed" ? "#fecaca" : "#e4e7ec"}`, borderRadius: 999, padding: "7px 11px", background: selectedQuote.emailStatus === "sent" ? "#f0fdf4" : selectedQuote.emailStatus === "failed" ? "#fef2f2" : "#fff", color: selectedQuote.emailStatus === "sent" ? "#067647" : selectedQuote.emailStatus === "failed" ? "#b42318" : "#344054", fontSize: 12 }}>Email: <strong>{selectedQuote.emailStatus === "sent" ? `Sent${selectedQuote.emailSentAt ? ` ${formatDateTime(selectedQuote.emailSentAt)}` : ""}` : selectedQuote.emailStatus === "pending" ? "Sending" : selectedQuote.emailStatus === "failed" ? "Failed" : "Not sent"}</strong></span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "end" }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong>Client-facing quote link</strong>
                      <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Send client link + PDF emails both the online approval link and a downloadable PDF copy, then marks the quote as sent automatically.</p>
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
                      {selectedQuote.status !== "deleted" ? (
                        <EmailRecipientModalForm
                          action={emailQuoteAction}
                          hiddenFields={{ quoteId: selectedQuote.id }}
                          defaultEmail={selectedQuote.email}
                          variant="quote"
                          alreadySent={selectedQuote.emailStatus === "sent"}
                          modalTitle={selectedQuote.emailStatus === "sent" ? "Resend quote" : "Email quote"}
                          modalDescription="Confirm or change the email address before Production Manager sends the online quote link and downloadable PDF copy."
                          submitLabel={selectedQuote.emailStatus === "sent" ? "Resend link + PDF" : "Send link + PDF"}
                        />
                      ) : null}
                      {selectedQuote.status !== "accepted" && selectedQuote.status !== "deleted" ? (
                        <form action={markQuoteAcceptedManuallyAction}>
                          <input type="hidden" name="quoteId" value={selectedQuote.id} />
                          <button type="submit" title="Use when the client approved the attached PDF by email or another offline method." style={{ minHeight: 44, borderRadius: 14, border: "1px solid #86efac", background: "#f0fdf4", color: "#067647", fontWeight: 950, padding: "0 14px" }}>Mark accepted (email/manual)</button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                  {selectedQuote.emailStatus === "failed" && selectedQuote.emailLastError ? <div style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b42318", borderRadius: 14, padding: "10px 12px", fontSize: 13 }}><strong>Quote email:</strong> {selectedQuote.emailLastError}</div> : null}
                  {(() => {
                    const myobTone = myobOrderTone(selectedQuote.myobOrderStatus);
                    const canPush = selectedQuote.status === "accepted" && selectedQuote.myobOrderStatus !== "synced";
                    const needsPmClientLink = !linkedClient;
                    const needsMyobLink = Boolean(linkedClient && !linkedMyobCustomer);
                    const needsAnyClientLink = needsPmClientLink || needsMyobLink;
                    return (
                      <section style={{ border: `1px solid ${needsAnyClientLink ? "#fdba74" : myobTone.border}`, borderRadius: 18, background: needsAnyClientLink ? "#fff7ed" : myobTone.bg, color: needsAnyClientLink ? "#9a3412" : myobTone.fg, padding: 14, display: "grid", gap: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                          <div style={{ display: "grid", gap: 4 }}>
                            <strong>MYOB open job / order</strong>
                            <span style={{ fontSize: 13 }}>Accepted quotes become open MYOB Item Orders. Drafts, enquiries and surveys stay in Production Manager only.</span>
                            {linkedClient ? <span style={{ fontSize: 13 }}>Client: <strong>{linkedClient.displayName}</strong> · MYOB: <strong>{linkedMyobCustomer ? linkedMyobCustomer.displayName : "Not linked"}</strong>{customerMyobPriceLevel(linkedClient) ? <> · Price level: <strong>{customerMyobPriceLevelName(linkedClient)} ({customerMyobPriceLevel(linkedClient)})</strong></> : null}</span> : null}
                            {selectedQuote.myobOrderNumber ? <span style={{ fontSize: 13 }}>Order: <strong>{selectedQuote.myobOrderNumber}</strong>{selectedQuote.myobOrderSyncedAt ? ` · synced ${formatDateTime(selectedQuote.myobOrderSyncedAt)}` : ""}</span> : null}
                            {selectedQuote.myobOrderStatus === "synced" && JSON.stringify(selectedQuote.myobOrderPayloadJson ?? {}).includes("/Sale/Order/Service") ? (
                              <span style={{ fontSize: 12, color: "#9a3412", fontWeight: 800 }}>This order was created by an older Production Manager build using MYOB Service layout. New accepted quotes are sent using MYOB Item layout.</span>
                            ) : null}
                            {selectedQuote.myobOrderSyncError && !needsAnyClientLink ? <span style={{ fontSize: 13, color: "#b42318", whiteSpace: "pre-wrap" }}>{selectedQuote.myobOrderSyncError}</span> : null}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <span style={{ borderRadius: 999, border: `1px solid ${needsAnyClientLink ? "#fdba74" : myobTone.border}`, background: "rgba(255,255,255,0.75)", color: needsAnyClientLink ? "#9a3412" : myobTone.fg, padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>{needsPmClientLink ? "PM client link needed" : needsMyobLink ? "MYOB customer link needed" : myobTone.label}</span>
                            {canPush && !needsAnyClientLink ? (
                              <form action={pushAcceptedQuoteToMyobOrderAction}>
                                <input type="hidden" name="quoteId" value={selectedQuote.id} />
                                <MyobSubmitButton label="Send to MYOB Item Order" pendingLabel="Creating MYOB order…" background="#0f766e" />
                              </form>
                            ) : null}
                          </div>
                        </div>

                        {needsPmClientLink ? (
                          <form action={linkQuoteToProductionManagerClientAction} style={{ borderTop: "1px solid #fed7aa", paddingTop: 12, display: "grid", gridTemplateColumns: "minmax(280px,1fr) auto", gap: 8, alignItems: "end" }}>
                            <input type="hidden" name="quoteId" value={selectedQuote.id} />
                            <label style={{ display: "grid", gap: 6 }}>
                              <b style={{ fontSize: 13 }}>1. Link this quote to a Production Manager client</b>
                              <select name="customerId" defaultValue={suggestedPmClient?.id ?? ""} required style={{ ...inputStyle, minWidth: 0 }}>
                                <option value="">Choose Production Manager client…</option>
                                {clients.filter((candidate) => candidate.isActive).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName}{candidate.companyName && candidate.companyName !== candidate.displayName ? ` — ${candidate.companyName}` : ""}{candidate.email ? ` · ${candidate.email}` : ""}</option>)}
                              </select>
                              {suggestedPmClient ? <span style={{ fontSize: 12 }}>Suggested match: <strong>{suggestedPmClient.displayName}</strong></span> : null}
                            </label>
                            <MyobSubmitButton label="Link PM client" pendingLabel="Linking…" background="#475467" />
                          </form>
                        ) : null}

                        {selectedQuote.status === "accepted" && salesReferences.accounts.length ? (
                          <div style={{ borderTop: `1px solid ${needsAnyClientLink ? "#fed7aa" : myobTone.border}`, paddingTop: 12, display: "grid", gap: 8 }}>
                            <form action={saveMyobSalesDefaultsAction} style={{ display: "grid", gridTemplateColumns: "minmax(280px,1fr) auto", gap: 8, alignItems: "end" }}>
                              <input type="hidden" name="quoteId" value={selectedQuote.id} />
                              <label style={{ display: "grid", gap: 6 }}>
                                <b style={{ fontSize: 13 }}>Default sales income account</b>
                                <select name="incomeAccountUid" defaultValue={salesDefaults.incomeAccountUid ?? ""} required style={{ ...inputStyle, minWidth: 0 }}>
                                  <option value="">Choose MYOB income account…</option>
                                  {salesReferences.accounts.map((account) => (
                                    <option key={account.uid} value={account.uid}>{account.displayId} · {account.name} ({account.classification})</option>
                                  ))}
                                </select>
                              </label>
                              <button type="submit" style={{ ...buttonStyle, background: "#334155" }}>Save sales account</button>
                            </form>
                            <span style={{ fontSize: 12, color: needsAnyClientLink ? "#9a3412" : myobTone.fg }}>MYOB Item Orders use the linked MYOB sales item on saved products. Custom/quick quote lines use the PM-CUSTOM sales item; this Income account is used when Production Manager creates that fallback item.</span>
                          </div>
                        ) : null}

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
                <section id="quote-builder" style={{ display: "grid", gap: 10, scrollMarginTop: 18, order: 2 }}>
                  <details data-production-manager-auto-refresh-protected="true" style={{ border: "1px solid #b9cdfc", borderRadius: 18, background: "#fff", overflow: "hidden" }}>
                    <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 16px", background: "linear-gradient(135deg,#eff6ff,#f8fbff)", color: "#155eef", fontWeight: 950, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><span>＋ Add quote line</span><span style={{ fontSize: 12, color: "#475467" }}>Open line editor</span></summary>
                    <div style={{ padding: 14, display: "grid", gap: 12, borderTop: "1px solid #dbeafe" }}>
                      {selectedQuote.surveyRequestId ? <div style={{ border: "1px solid #bfdbfe", borderRadius: 14, background: "#eff6ff", color: "#1e3a8a", padding: "10px 12px" }}><strong>Add another line to this survey quote</strong><div style={{ marginTop: 3, fontSize: 12 }}>Survey-created lines remain above with their measurements, photos and notes. Use the same field layout here for any additional work.</div></div> : null}
                      <QuoteMaterialFlowBuilder
                        key="new-quote-line"
                        quoteId={selectedQuote.id}
                        materials={activeMaterials}
                        myobMatrixItems={myobMatrixItems}
                        pricingSettings={{
                          markupMultiplier: companySettings?.globalMarkupMultiplier ?? "1.5",
                          accessEquipmentMarkupMultiplier: companySettings?.accessEquipmentMarkupMultiplier ?? companySettings?.globalMarkupMultiplier ?? "1.5",
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
                    </div>
                  </details>
                </section>
              ) : (
                <section style={{ border: "1px solid #fecaca", borderRadius: 18, padding: 16, background: "#fff5f4", color: "#b42318", fontWeight: 800 }}>This quote is deleted. Restore it before editing or sending.</section>
              )}

              <div id="saved-lines" style={{ display: "grid", gap: 10, scrollMarginTop: 18, order: 1 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h4 style={{ margin: 0 }}>Current quote lines <span style={{ color: "#667085", fontWeight: 750 }}>({quoteLines.length})</span></h4>
                  <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Lines stay collapsed until you open one. Survey-created and manually added lines use the same one-page field layout.</p>
                </div>
                {quoteLines.map((line) => {
                  const editableProduct = line.productId ? savedQuoteProducts.find((product) => product.id === line.productId) ?? null : null;
                  const surveyReference = surveyLineReference(line.configurationSnapshot);
                  const surveyNeedsConfig = surveyLineNeedsConfiguration(line.configurationSnapshot);
                  return (
                    <details
                      key={line.id}
                      id={`quote-line-${line.id}`}
                      data-production-manager-auto-refresh-protected="true"
                      open={focusLine === line.id ? true : undefined}
                      style={{
                        border: focusLine === line.id ? "2px solid #fb923c" : "1px solid #dfe7f2",
                        borderRadius: 18,
                        padding: 0,
                        background: focusLine === line.id ? "#fffaf5" : "#fbfdff",
                        overflow: "hidden",
                        scrollMarginTop: 18,
                        boxShadow: focusLine === line.id ? "0 0 0 4px rgba(251,146,60,0.10)" : "none"
                      }}
                    >
                      <summary style={{ listStyle: "none", cursor: "pointer", padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                          <div style={{ display: "grid", gap: 4, minWidth: 260 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <strong style={{ textDecoration: line.clientResponseStatus === "cancelled" ? "line-through" : "none" }}>{line.productName}</strong>
                              {surveyReference ? <span style={{ borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 950, background: surveyNeedsConfig ? "#fff7ed" : "#eef4ff", color: surveyNeedsConfig ? "#c2410c" : "#3538cd" }}>{surveyNeedsConfig ? "Survey line · needs pricing" : "Survey linked"}</span> : null}
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
                            <div style={{ color: "#667085", fontSize: 13 }}>{[staffLineSummary(displayedLineSummary(line.optionSummary, Boolean(surveyReference)), line.configurationSnapshot, line.quantity), `Qty ${line.quantity}`, `Unit $${cleanQuoteLineAmount(line.unitPrice)}`, `Total $${cleanQuoteLineAmount(line.lineTotal)}`].filter(Boolean).join(" · ")}</div>
                            {line.clientResponseNotes ? <div style={{ color: line.clientResponseStatus === "changes_requested" ? "#9a3412" : "#667085", fontSize: 12 }}><strong>Client line note:</strong> {line.clientResponseNotes}</div> : null}
                          </div>
                          <span style={{ borderRadius: 999, background: "#eef4ff", color: "#155eef", padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>View / edit</span>
                        </div>
                      </summary>

                      <div style={{ borderTop: "1px solid #e5edf7", padding: 14, display: "grid", gap: 14, background: "#ffffff" }}>
                        {surveyReference ? (
                          <section style={{ border: "1px solid #fdba74", borderRadius: 16, padding: 12, background: "#fffaf5", display: "grid", gap: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", flexWrap: "wrap" }}>
                              <div><strong style={{ color: "#9a3412" }}>Internal survey reference · {surveyReference.title || line.productName}</strong><div style={{ color: "#667085", fontSize: 12, marginTop: 3 }}>This information stays internal and is carried with this line into Production / Job Sheet.</div></div>
                              {surveyNeedsConfig ? <span style={{ borderRadius: 999, background: "#ffedd5", color: "#c2410c", padding: "5px 9px", fontSize: 11, fontWeight: 950 }}>Configure + price this line</span> : null}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
                              {[ ["Location", surveyReference.location], ["Survey size", [surveyReference.width, surveyReference.height, surveyReference.depth].filter(Boolean).join(" × ")], ["Survey qty", surveyReference.quantity], ["Required work", surveyReference.requiredWork], ["Fixing / substrate", surveyReference.fixingMethod], ["Access", surveyReference.accessNotes] ].filter((row) => row[1]).map(([label, value]) => <div key={String(label)} style={{ border: "1px solid #fed7aa", borderRadius: 10, background: "#fff", padding: 8 }}><div style={{ fontSize: 9, fontWeight: 950, color: "#9a3412", textTransform: "uppercase" }}>{label}</div><div style={{ marginTop: 3, fontSize: 12, whiteSpace: "pre-wrap" }}>{value}</div></div>)}
                            </div>
                            {surveyReference.photos.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>{surveyReference.photos.map((photo, photoIndex) => <a key={`${photo.url}-${photoIndex}`} href={photo.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit", border: "1px solid #fed7aa", borderRadius: 10, overflow: "hidden", background: "#fff" }}><img src={photo.url} alt={photo.fileName} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} /><div style={{ padding: "6px 8px", fontSize: 10, color: "#7c2d12" }}>{photo.annotated ? "Annotated · " : ""}{photo.fileName}</div></a>)}</div> : null}
                            {[surveyReference.description, surveyReference.condition, surveyReference.powerRequired, surveyReference.notes].filter(Boolean).length ? <div style={{ color: "#475467", fontSize: 12, whiteSpace: "pre-wrap" }}>{[surveyReference.description ? `Description: ${surveyReference.description}` : null, surveyReference.condition ? `Condition: ${surveyReference.condition}` : null, surveyReference.powerRequired ? `Power: ${surveyReference.powerRequired}` : null, surveyReference.notes ? `Notes: ${surveyReference.notes}` : null].filter(Boolean).join("\n")}</div> : null}
                          </section>
                        ) : null}
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
                          myobMatrixItems={myobMatrixItems}
                          pricingSettings={{
                            markupMultiplier: companySettings?.globalMarkupMultiplier ?? "1.5",
                            accessEquipmentMarkupMultiplier: companySettings?.accessEquipmentMarkupMultiplier ?? companySettings?.globalMarkupMultiplier ?? "1.5",
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

              <section style={{ border: "1px solid #e9d5ff", borderRadius: 22, padding: 16, background: "linear-gradient(135deg,#ffffff,#faf5ff)", display: "grid", gap: 12, order: 3 }}>
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
                  {selectedProductionJob ? <a href={`/job-sheets/${selectedProductionJob.id}`} target="_blank" rel="noreferrer" style={{ minHeight: 44, borderRadius: 14, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontWeight: 950, display: "inline-flex", alignItems: "center", padding: "0 14px", textDecoration: "none" }}>Print job sheet</a> : selectedQuote.status === "accepted" ? <span style={{ minHeight: 44, borderRadius: 14, border: "1px solid #e4e7ec", background: "#f8fafc", color: "#667085", fontWeight: 850, display: "inline-flex", alignItems: "center", padding: "0 14px", fontSize: 12 }}>Job sheet available after approved artwork creates Production</span> : null}
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
