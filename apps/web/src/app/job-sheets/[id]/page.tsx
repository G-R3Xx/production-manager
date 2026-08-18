export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getCompanySettingsByTenantId } from "@/server/company";
import { getCustomerById } from "@/server/customers";
import { formatStructuredAddress, structuredAddressFromPayload } from "@/lib/contact-address";
import {
  getProductionJobById,
  listProductionItemsForJob,
  listProductionStepsForJob,
  type ProductionItemRecord,
  type ProductionStepRecord
} from "@/server/production";
import {
  getArtworkApprovalById,
  getQuoteDraftById,
  listArtworkApprovalPages,
  listQuoteLines,
  type ArtworkApprovalPageRecord,
  type QuoteLineRecord
} from "@/server/quotes";
import { PrintJobSheetButton } from "./PrintJobSheetButton";
import { JobSheetArtworkPreview } from "./JobSheetArtworkPreview";

type JobSheetPageProps = { params: Promise<{ id: string }> };
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function numericText(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return text(value);
  return number.toLocaleString("en-AU", { maximumFractionDigits: 3 });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" });
}

function human(value: unknown): string {
  return text(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function internalMaterialDisplayName(snapshot: UnknownRecord, ...keys: string[]): string {
  const materialSnapshots = isRecord(snapshot.materialSnapshots) ? snapshot.materialSnapshots : {};
  for (const key of keys) {
    const material = isRecord(materialSnapshots[key]) ? materialSnapshots[key] as UnknownRecord : null;
    if (!material) continue;
    const name = text(material.name) || text(material.customerFacingName);
    if (name) return name;
  }
  return "";
}



type JobSheetSurveyReference = {
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

function surveyReferenceFromSnapshot(snapshot: UnknownRecord): JobSheetSurveyReference | null {
  const context = isRecord(snapshot.surveyContext) ? snapshot.surveyContext : null;
  if (!context) return null;
  const photos = Array.isArray(context.photos) ? context.photos.flatMap((raw): JobSheetSurveyReference["photos"] => {
    if (!isRecord(raw)) return [];
    const url = text(raw.url);
    if (!url) return [];
    return [{ url, fileName: text(raw.fileName) || "Survey photo", annotated: Boolean(raw.annotated) }];
  }) : [];
  return {
    title: text(context.title), location: text(context.location), width: text(context.width), height: text(context.height), depth: text(context.depth), quantity: text(context.quantity),
    description: text(context.description), condition: text(context.condition), requiredWork: text(context.requiredWork), fixingMethod: text(context.fixingMethod),
    accessNotes: text(context.accessNotes), powerRequired: text(context.powerRequired), notes: text(context.notes), photos
  };
}

type StockRequiredRow = { role: string; material: string; required: string };

function formatRequiredAmount(amount: number, unit: string): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (unit === "lm") return `${numericText(safe)}m`;
  if (unit === "sheet") return `${numericText(safe)} sheet${Math.abs(safe - 1) < 0.0001 ? "" : "s"}`;
  if (unit === "sqm") return `${numericText(safe)}m²`;
  if (unit === "each") return `${numericText(safe)} each`;
  return `${numericText(safe)}${unit ? ` ${unit}` : ""}`;
}

function stockUsageFromPricing(row: UnknownRecord, quantity: number): string {
  const note = text(row.note);
  const unit = text(row.unit).toLowerCase();
  const physicalSheets = note.match(/([0-9]+(?:\.[0-9]+)?)\s+physical parent sheet(?:s)?(?:\s+(?:opened|required))?/i);
  if (physicalSheets) return formatRequiredAmount(Number(physicalSheets[1]), "sheet");
  const totalSheets = note.match(/([0-9]+(?:\.[0-9]+)?)\s+sheet(?:s)?\s+total(?:\s+for\s+qty)?/i);
  if (totalSheets) return formatRequiredAmount(Number(totalSheets[1]), "sheet");
  const totalLm = note.match(/([0-9]+(?:\.[0-9]+)?)\s*lm\s+total/i);
  if (totalLm) return formatRequiredAmount(Number(totalLm[1]), "lm");
  const amount = Number(row.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return formatRequiredAmount(amount * Math.max(1, quantity), unit);
}

function stockRequiredRows(snapshot: UnknownRecord, quantity: number): StockRequiredRow[] {
  const pricingSnapshot = isRecord(snapshot.pricingSnapshot) ? snapshot.pricingSnapshot : {};
  const rows = Array.isArray(pricingSnapshot.pricingBreakdown) ? pricingSnapshot.pricingBreakdown : [];
  const mainIsRoll = (() => {
    const materialSnapshots = isRecord(snapshot.materialSnapshots) ? snapshot.materialSnapshots : {};
    const main = isRecord(materialSnapshots.main) ? materialSnapshots.main as UnknownRecord : null;
    if (!main) return false;
    return Number(main.rollWidthMm ?? 0) > 0 || /^(?:lm|linear\s*m(?:etre)?s?)$/i.test(text(main.stockUom)) || /\b(roll|vinyl|banner|sav|media)\b/i.test(text(main.materialType));
  })();

  const result: StockRequiredRow[] = [];
  for (const value of rows) {
    if (!isRecord(value)) continue;
    const label = text(value.label);
    const unit = text(value.unit).toLowerCase();
    if (!label || !["sheet", "lm", "sqm", "each"].includes(unit)) continue;

    let role = "";
    let material = "";
    if (label === "Base material") {
      role = mainIsRoll || unit === "lm" ? "Print media" : "Stock";
      material = internalMaterialDisplayName(snapshot, "main", "smallStock") || text(value.detail);
    } else if (["Roll print media", "Cut vinyl", "Plan media", "Poster media"].includes(label)) {
      role = "Print media";
      material = internalMaterialDisplayName(snapshot, "media", "smallStock", "main") || text(value.detail);
    } else if (["Plan stock", "Poster stock", "Paper / card stock", "Carbon/NCR stock"].includes(label)) {
      role = "Stock";
      material = internalMaterialDisplayName(snapshot, "smallStock", "main") || text(value.detail);
    } else if (label === "Laminate" || /^(?:Cello \/ coating|Coating \/ laminate)$/i.test(label)) {
      role = "Laminate";
      material = internalMaterialDisplayName(snapshot, "laminate", "smallCoating") || text(value.detail);
    } else if (label === "Backing film") {
      role = "Backing";
      material = internalMaterialDisplayName(snapshot, "backing") || text(value.detail);
    } else {
      continue;
    }

    const required = stockUsageFromPricing(value, quantity);
    if (!material || required === "—") continue;
    const key = `${role.toLowerCase()}::${material.toLowerCase()}::${required.toLowerCase()}`;
    if (!result.some((row) => `${row.role.toLowerCase()}::${row.material.toLowerCase()}::${row.required.toLowerCase()}` === key)) result.push({ role, material, required });
  }
  return result;
}

type ProcessRow = { label: string; step: ProductionStepRecord | null };

function processLabel(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("artwork checked")) return "Artwork received";
  if (normalized.includes("print-ready file attached")) return "Print-ready files";
  if (normalized.includes("material") && normalized.includes("stock")) return "Stock allocated";
  if (normalized === "quality checked") return "Quality check";
  if (normalized.includes("ready for install")) return "Ready for install / pickup / delivery";
  return label;
}

function processRows(itemSteps: ProductionStepRecord[], snapshot: UnknownRecord): ProcessRow[] {
  const rows: ProcessRow[] = [];
  const artworkStep = itemSteps.find((step) => /artwork checked/i.test(step.label)) ?? null;
  const printReadyStep = itemSteps.find((step) => /print-ready file attached/i.test(step.label)) ?? null;
  rows.push({ label: "Artwork received", step: artworkStep });
  rows.push({ label: "Print-ready files", step: printReadyStep });

  const printMethod = text(snapshot.printMethod).toLowerCase();
  const hasPrint = Boolean(printMethod && !/^(?:none|no print)$/.test(printMethod)) || itemSteps.some((step) => /^print$/i.test(step.label));
  if (hasPrint) rows.push({ label: "RIP setup", step: null });

  for (const step of itemSteps) {
    if (step === artworkStep || step === printReadyStep) continue;
    rows.push({ label: processLabel(step.label), step });
  }
  rows.push({ label: "LINE COMPLETE", step: null });
  return rows;
}

function artworkPageForItem(item: ProductionItemRecord, pages: ArtworkApprovalPageRecord[]): ArtworkApprovalPageRecord | null {
  if (item.artworkPageId) {
    const direct = pages.find((page) => page.id === item.artworkPageId);
    if (direct) return direct;
  }
  if (item.sourceQuoteLineId) {
    const byLine = pages.find((page) => page.sourceQuoteLineId === item.sourceQuoteLineId);
    if (byLine) return byLine;
  }
  return null;
}

function quoteLineForItem(item: ProductionItemRecord, lines: QuoteLineRecord[]): QuoteLineRecord | null {
  return item.sourceQuoteLineId ? lines.find((line) => line.id === item.sourceQuoteLineId) ?? null : null;
}

function proofIsPdf(page: ArtworkApprovalPageRecord): boolean {
  return /\.pdf(?:$|\?)/i.test(page.fileName || "") || /\.pdf(?:$|\?)/i.test(page.imageUrl || "");
}

function proofIsPlaceholder(page: ArtworkApprovalPageRecord): boolean {
  return page.imageUrl.startsWith("data:image/svg+xml") || (!page.fileName && !page.imageStoragePath && /auto-created from quote line/i.test(page.notes ?? ""));
}

export default async function JobSheetPage({ params }: JobSheetPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const { id } = await params;
  const tenantId = activeTenant!.tenantId;

  const job = await getProductionJobById(tenantId, id);
  if (!job) redirect("/production?error=Production%20job%20not%20found");

  const [quote, items, steps, company, approval] = await Promise.all([
    getQuoteDraftById(tenantId, job.quoteId),
    listProductionItemsForJob(job.id),
    listProductionStepsForJob(job.id),
    getCompanySettingsByTenantId(tenantId),
    job.artworkApprovalId ? getArtworkApprovalById(tenantId, job.artworkApprovalId) : Promise.resolve(null)
  ]);
  const [quoteLines, artworkPages, customer] = await Promise.all([
    quote ? listQuoteLines(quote.id) : Promise.resolve([]),
    approval ? listArtworkApprovalPages(approval.id) : Promise.resolve([]),
    quote?.linkedCustomerId ? getCustomerById(tenantId, quote.linkedCustomerId) : Promise.resolve(null)
  ]);

  const billing = customer
    ? structuredAddressFromPayload(customer.payloadJson?.billingAddressStructured, customer.payloadJson?.billingAddress)
    : null;
  const clientAddress = billing ? formatStructuredAddress(billing, true) : "";
  const companyName = company?.tradingName || company?.companyLegalName || company?.tenantName || "Production Manager";
  const companyLogo = company?.companyLogoUrl || "/brand/tender-edge-horizontal-logo-2025.png";
  const activeQuoteLines = quoteLines.filter((line) => line.clientResponseStatus !== "cancelled" && !line.clientRevisionExcluded);
  const jobSheetName = job.projectName || quote?.jobName || job.clientName || "Production Job";
  const jobSheetNumber = job.quoteNumber || quote?.quoteNumber || `JOB-${job.id.slice(0, 8).toUpperCase()}`;
  const printTitle = `${jobSheetNumber} - ${jobSheetName}`;

  return (
    <main className="job-sheet-page" style={{ maxWidth: 1120, margin: "0 auto", padding: "24px", color: "#111827" }}>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          body { background: #fff !important; }
          .job-sheet-page { max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .job-sheet-screen-only { display: none !important; }
          .job-sheet-item { break-inside: auto; page-break-inside: auto; }
          .job-sheet-item + .job-sheet-item { break-before: page; page-break-before: always; }
          .job-sheet-header { padding: 9px 11px !important; gap: 6px !important; border-radius: 12px !important; }
          .job-sheet-header-top { gap: 12px !important; align-items: center !important; }
          .job-sheet-header-logo { max-width: 220px !important; max-height: 42px !important; }
          .job-sheet-header-kicker { font-size: 8px !important; letter-spacing: 0.08em !important; }
          .job-sheet-header-title { font-size: 18px !important; line-height: 1.1 !important; }
          .job-sheet-header-number { font-size: 10px !important; }
          .job-sheet-header-details { padding-top: 8px !important; gap: 15px !important; font-size: 11.25px !important; line-height: 1.38 !important; }
          .job-sheet-header-details > div > strong { display: inline-block; margin-bottom: 2px !important; font-size: 12px !important; }
          .job-sheet-artwork { break-inside: avoid; page-break-inside: avoid; }
          .job-sheet-artwork img, .job-sheet-artwork canvas { max-height: 250px !important; width: auto !important; max-width: 100% !important; margin-left: auto !important; margin-right: auto !important; }
          .job-sheet-signoff { break-inside: auto; page-break-inside: auto; padding: 9px !important; }
          .job-sheet-process-intro { break-after: avoid; page-break-after: avoid; }
          .job-sheet-process-list { gap: 4px !important; }
          .job-sheet-stock-row, .job-sheet-process-row { break-inside: avoid; page-break-inside: avoid; }
          .job-sheet-stock-row { min-height: 14mm !important; }
          .job-sheet-process-row { min-height: 12mm !important; padding-top: 6px !important; padding-bottom: 6px !important; }
          .job-sheet-final-notes { gap: 12px !important; }
          .job-sheet-survey-reference { break-inside: avoid; page-break-inside: avoid; }
          .job-sheet-survey-photo img { height: 135px !important; }
          .job-sheet-note-line { min-height: 23px !important; }
          .job-sheet-footer { margin-top: 8px !important; padding-top: 6px !important; font-size: 8px !important; break-inside: avoid; page-break-inside: avoid; }
          a { color: inherit !important; text-decoration: none !important; }
        }
      `}</style>

      <div className="job-sheet-screen-only" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 18 }}>
        <a href={`/production/${job.id}`} style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>← Back to production job</a>
        <PrintJobSheetButton printTitle={printTitle} />
      </div>

      <header className="job-sheet-header" style={{ border: "1px solid #d9e2ef", borderRadius: 18, padding: 18, background: "#fff", display: "grid", gap: 14 }}>
        <div className="job-sheet-header-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 20 }}>
          <img className="job-sheet-header-logo" src={companyLogo} alt={companyName} style={{ maxWidth: 300, maxHeight: 72, objectFit: "contain", objectPosition: "left center" }} />
          <div style={{ textAlign: "right" }}>
            <div className="job-sheet-header-kicker" style={{ fontSize: 11, fontWeight: 950, letterSpacing: "0.1em", color: "#2563eb" }}>PRODUCTION JOB SHEET</div>
            <div className="job-sheet-header-title" style={{ fontSize: 25, fontWeight: 950 }}>{job.projectName || quote?.jobName || job.clientName}</div>
            <div className="job-sheet-header-number" style={{ color: "#667085", fontWeight: 800 }}>{job.quoteNumber || quote?.quoteNumber || "Production job"}</div>
          </div>
        </div>

        <div className="job-sheet-header-details" style={{ borderTop: "1px solid #d9e2ef", paddingTop: 14, display: "grid", gridTemplateColumns: "1.15fr 1fr 1fr", gap: 20, fontSize: 14, lineHeight: 1.45 }}>
          <div><strong style={{ fontSize: 15 }}>Client</strong><br />{job.clientName}{job.contactName ? <><br />{job.contactName}</> : null}{clientAddress ? <><br /><span style={{ whiteSpace: "pre-line" }}>{clientAddress}</span></> : null}</div>
          <div><strong style={{ fontSize: 15 }}>Job details</strong><br />Client PO: {quote?.clientPurchaseOrderNumber || "—"}<br />Due: {formatDate(job.dueDate)}<br />Dispatch: {human(job.dispatchType) || "—"}<br />Priority: {human(job.priority) || "Normal"}</div>
          <div><strong style={{ fontSize: 15 }}>Artwork approval</strong><br />Status: {approval?.status ? human(approval.status) : "Not linked"}<br />Revision: {approval?.revision || "—"}<br />Approved: {formatDateTime(approval?.approvedAt)}<br />Designer: {approval?.designerName || "—"}</div>
        </div>
      </header>

      <section style={{ marginTop: 18, display: "grid", gap: 16 }}>
        {items.map((item, itemIndex) => {
          const line = quoteLineForItem(item, activeQuoteLines);
          const snapshot = line && isRecord(line.configurationSnapshot) ? line.configurationSnapshot : {};
          const artwork = artworkPageForItem(item, artworkPages);
          const surveyReference = surveyReferenceFromSnapshot(snapshot);
          const itemSteps = steps.filter((step) => step.itemId === item.id);
          const finishedSize = [text(snapshot.widthMm), text(snapshot.heightMm)].every(Boolean)
            ? `${numericText(snapshot.widthMm)} x ${numericText(snapshot.heightMm)} mm`
            : item.sizeSummary || "—";
          const bleedSpacing = text(snapshot.bleedSpacingMm) ? `${numericText(snapshot.bleedSpacingMm)} mm per side` : "—";
          const dropCount = Number(snapshot.dropCount);
          const dropDirection = text(snapshot.dropDirection).toLowerCase();
          const dropPanelWidthMm = Number(snapshot.dropPanelWidthMm);
          const dropLengthMm = Number(snapshot.dropLengthMm);
          const dropOverlap = Number(snapshot.dropOverlapMm);
          const dropInstruction = Number.isFinite(dropCount) && dropCount > 0 && (dropDirection === "vertical" || dropDirection === "horizontal")
            ? `${dropCount} ${dropDirection === "vertical" ? "VERTICAL DROPS" : "HORIZONTAL STRIPS"}${Number.isFinite(dropPanelWidthMm) && Number.isFinite(dropLengthMm) ? ` · approx ${numericText(dropPanelWidthMm)} × ${numericText(dropLengthMm)} mm each` : ""}${Number.isFinite(dropOverlap) && dropOverlap > 0 ? ` · ${numericText(dropOverlap)} mm overlap` : ""}`
            : "";
          const itemQuantity = Math.max(1, Number(item.quantity) || 1);
          const requiredStock = stockRequiredRows(snapshot, itemQuantity);
          const staffProcesses = processRows(itemSteps, snapshot);

          return (
            <article key={item.id} className="job-sheet-item" style={{ border: "1px solid #cfd9e8", borderRadius: 18, background: "#fff", overflow: "hidden" }}>
              <div style={{ padding: "17px 18px", background: "#f4f8ff", borderBottom: "1px solid #cfd9e8", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#2563eb", fontSize: 11, fontWeight: 950 }}>ITEM {itemIndex + 1}{item.itemCode ? ` · ${item.itemCode}` : ""}</div>
                  <h2 style={{ margin: "3px 0 0", fontSize: 23 }}>{line?.productName || item.quoteProductName || item.title}</h2>
                </div>
                <div style={{ minWidth: 86, textAlign: "center", border: "1px solid #bfdbfe", borderRadius: 12, background: "#fff", padding: "8px 12px" }}>
                  <div style={{ color: "#667085", fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>Quantity</div>
                  <div style={{ fontWeight: 950, fontSize: 22 }}>{item.quantity}</div>
                </div>
              </div>

              <div style={{ padding: 18, display: "grid", gap: 18 }}>
                <section style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
                    {[
                      ["Finished size", finishedSize],
                      ["Print", [human(snapshot.printMethod), human(snapshot.ink), human(snapshot.sides), human(snapshot.printDirection)].filter(Boolean).join(" · ") || item.colourSummary || "—"],
                      ["Bleed / spacing", bleedSpacing],
                      ["Drop layout", dropInstruction || "—"]
                    ].map(([label, value]) => <div key={String(label)} style={{ border: "1px solid #e4e7ec", borderRadius: 10, padding: 9, background: "#fff" }}><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>{label}</div><strong style={{ display: "block", marginTop: 4, fontSize: 12, whiteSpace: "pre-wrap" }}>{String(value)}</strong></div>)}
                  </div>
                  {dropInstruction ? <div style={{ border: "2px solid #fb923c", background: "#fff7ed", color: "#9a3412", borderRadius: 10, padding: 10, fontSize: 12 }}><strong>INSTALL LAYOUT:</strong> {dropInstruction}</div> : null}
                  {line?.notes || item.quoteLineNotes ? <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 10, padding: 9, fontSize: 11, whiteSpace: "pre-wrap" }}><strong>Production notes:</strong> {line?.notes || item.quoteLineNotes}</div> : null}
                </section>

                {surveyReference ? (
                  <section className="job-sheet-survey-reference" style={{ border: "1px solid #fdba74", borderRadius: 14, padding: 12, background: "#fffaf5", display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <strong style={{ color: "#9a3412", fontSize: 13 }}>SITE SURVEY REFERENCE</strong>
                      <span style={{ color: "#9a3412", fontSize: 11, fontWeight: 900 }}>{surveyReference.title || `Survey item ${itemIndex + 1}`}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 7 }}>
                      {[ ["Location", surveyReference.location], ["Measured size", [surveyReference.width, surveyReference.height, surveyReference.depth].filter(Boolean).join(" × ")], ["Survey qty", surveyReference.quantity], ["Required work", surveyReference.requiredWork], ["Fixing / substrate", surveyReference.fixingMethod], ["Condition", surveyReference.condition], ["Access", surveyReference.accessNotes], ["Power", surveyReference.powerRequired] ].filter((row) => row[1]).map(([label, value]) => <div key={String(label)} style={{ border: "1px solid #fed7aa", borderRadius: 9, background: "#fff", padding: 8 }}><div style={{ fontSize: 8, fontWeight: 950, color: "#9a3412", textTransform: "uppercase" }}>{label}</div><div style={{ marginTop: 3, fontSize: 10, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>{value}</div></div>)}
                    </div>
                    {surveyReference.photos.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>{surveyReference.photos.slice(0, 4).map((photo, photoIndex) => <div key={`${photo.url}-${photoIndex}`} className="job-sheet-survey-photo" style={{ border: "1px solid #fed7aa", borderRadius: 9, background: "#fff", overflow: "hidden" }}><img src={photo.url} alt={photo.fileName} style={{ width: "100%", height: 180, objectFit: "contain", display: "block", background: "#f8fafc" }} /><div style={{ padding: "5px 7px", fontSize: 9, color: "#7c2d12" }}>{photo.annotated ? "Annotated · " : ""}{photo.fileName}</div></div>)}</div> : null}
                    {surveyReference.photos.length > 4 ? <div style={{ fontSize: 9, color: "#9a3412" }}>+ {surveyReference.photos.length - 4} more survey photo{surveyReference.photos.length - 4 === 1 ? "" : "s"} retained in Production Manager.</div> : null}
                    {[surveyReference.description ? `Description: ${surveyReference.description}` : null, surveyReference.notes ? `Notes: ${surveyReference.notes}` : null].filter(Boolean).length ? <div style={{ fontSize: 10, color: "#475467", whiteSpace: "pre-wrap" }}>{[surveyReference.description ? `Description: ${surveyReference.description}` : null, surveyReference.notes ? `Notes: ${surveyReference.notes}` : null].filter(Boolean).join("\n")}</div> : null}
                  </section>
                ) : null}

                {artwork ? (
                  <section className="job-sheet-artwork" style={{ border: "2px solid #86efac", borderRadius: 14, padding: 12, background: "#f0fdf4" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 9 }}>
                      <strong style={{ color: "#067647", fontSize: 13 }}>APPROVED ARTWORK</strong>
                      <span style={{ fontSize: 11, fontWeight: 900 }}>Revision {artwork.proofRevision || approval?.revision || "Approved"}</span>
                    </div>
                    {!proofIsPlaceholder(artwork) ? (
                      <JobSheetArtworkPreview url={artwork.imageUrl} title={artwork.title} isPdf={proofIsPdf(artwork)} />
                    ) : (
                      <div style={{ border: "1px dashed #f59e0b", borderRadius: 10, background: "#fff7ed", padding: 18, color: "#9a3412" }}>Artwork placeholder only — approved proof image is not available.</div>
                    )}
                    <div style={{ fontSize: 10, color: "#475467", marginTop: 7, textAlign: "center" }}><strong>{artwork.title}</strong>{artwork.fileName ? ` · ${artwork.fileName}` : ""}{!proofIsPlaceholder(artwork) ? <><br /><a className="job-sheet-screen-only" href={artwork.imageUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 800 }}>Open approved artwork ↗</a></> : null}</div>
                  </section>
                ) : null}

                <section style={{ border: "1px solid #cfd9e8", borderRadius: 16, padding: 14, background: "#f8fafc" }}>
                  <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 950 }}>STOCK REQUIRED</div>
                  {requiredStock.length ? (
                    <div style={{ display: "grid", gap: 9 }}>
                      {requiredStock.map((row, index) => <div className="job-sheet-stock-row" key={`${row.role}-${row.material}-${index}`} style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr) 120px", gap: 16, alignItems: "center", minHeight: 56, border: "1px solid #d9e2ef", borderRadius: 13, padding: "11px 14px", background: "#fff" }}>
                        <div style={{ fontSize: 11, fontWeight: 950, color: "#475467", textTransform: "uppercase", letterSpacing: "0.04em" }}>{row.role}</div>
                        <div style={{ fontSize: 14, fontWeight: 900, lineHeight: 1.35 }}>{row.material}</div>
                        <div style={{ textAlign: "right", fontSize: 15, fontWeight: 950 }}>{row.required}</div>
                      </div>)}
                    </div>
                  ) : <div style={{ padding: 12, color: "#667085", fontSize: 12 }}>No separately allocated stock is required for this line.</div>}
                </section>

                <section className="job-sheet-signoff" style={{ border: "1px solid #cfd9e8", borderRadius: 16, padding: 14, background: "#f8fafc" }}>
                  <div className="job-sheet-process-intro">
                    <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 950 }}>PROCESSES</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1.45fr 50px 1fr 1.05fr 0.95fr", gap: 10, padding: "0 12px 6px", color: "#667085", fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      <span>Process</span><span style={{ textAlign: "center" }}>Done</span><span>By</span><span>When</span><span>Sign</span>
                    </div>
                  </div>
                  <div className="job-sheet-process-list" style={{ display: "grid", gap: 9 }}>{staffProcesses.map((process, index) => {
                    const checked = Boolean(process.step?.checkedAt);
                    const isComplete = process.label === "LINE COMPLETE";
                    return <div className="job-sheet-process-row" key={`${process.label}-${index}`} style={{ display: "grid", gridTemplateColumns: "1.45fr 50px 1fr 1.05fr 0.95fr", gap: 10, alignItems: "center", minHeight: 58, border: isComplete ? "2px solid #94a3b8" : "1px solid #d9e2ef", borderRadius: 13, padding: "10px 12px", background: isComplete ? "#f1f5f9" : "#fff" }}>
                      <div style={{ fontSize: 13, fontWeight: isComplete ? 950 : 900 }}>{process.label}</div>
                      <div style={{ textAlign: "center", fontSize: 20 }}>{checked ? "☑" : "☐"}</div>
                      <div>{process.step?.checkedBy ? <span style={{ fontSize: 10, lineHeight: 1.3 }}>{process.step.checkedBy}</span> : <span style={{ display: "block", borderBottom: "1px solid #667085", minHeight: 24 }} />}</div>
                      <div>{process.step?.checkedAt ? <span style={{ fontSize: 10, lineHeight: 1.3 }}>{formatDateTime(process.step.checkedAt)}</span> : <span style={{ display: "block", borderBottom: "1px solid #667085", minHeight: 24 }} />}</div>
                      <div><span style={{ display: "block", borderBottom: "1px solid #111827", minHeight: 24 }} /></div>
                    </div>;
                  })}</div>
                </section>

                <section className="job-sheet-final-notes" style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 20 }}>
                  <div><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>Production notes / issues</div><div className="job-sheet-note-line" style={{ borderBottom: "1px solid #98a2b3", minHeight: 34 }} /><div className="job-sheet-note-line" style={{ borderBottom: "1px solid #98a2b3", minHeight: 34 }} /></div>
                  <div><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>Final QC / date</div><div className="job-sheet-note-line" style={{ borderBottom: "1px solid #98a2b3", minHeight: 34 }} /></div>
                </section>
              </div>
            </article>
          );
        })}
        {!items.length ? <div style={{ border: "1px dashed #cfd9e8", borderRadius: 14, padding: 24, background: "#fff" }}>No production items have been generated yet. Sync the production job from its approved artwork pages first.</div> : null}
      </section>

      <footer className="job-sheet-footer" style={{ marginTop: 18, paddingTop: 10, borderTop: "1px solid #d9e2ef", color: "#667085", fontSize: 10, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>{companyName} · Production Manager</span>
        <span>Generated {new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</span>
      </footer>
    </main>
  );
}
