export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  listApprovedArtworkReadyForProduction,
  listProductionItemsForJob,
  listProductionJobStepSummariesForTenant,
  listProductionJobsForTenant,
  listProductionStepsForJob,
  type ProductionItemRecord,
  type ProductionJobRecord,
  type ProductionStepRecord
} from "@/server/production";
import {
  addProductionStepAction,
  attachPrintReadyFileAction,
  createProductionJobFromArtworkAction,
  deleteProductionJobAction,
  restoreProductionJobAction,
  setProductionJobStatusAction,
  syncProductionJobAction,
  updateProductionJobDetailsAction,
  pushProductionQuoteToMyobOrderAction
} from "./actions";
import { PrintReadyUploadInputs } from "./PrintReadyUploadInputs";
import { OpenFullscreenBoardButton } from "./OpenFullscreenBoardButton";
import { ProductionStepToggle } from "./ProductionStepToggle";
import { getQuoteDraftById, listQuoteDraftsForTenant } from "@/server/quotes";
import { customerLogoUrl, listCustomersForTenant } from "@/server/customers";
import { listEnquiriesForTenant } from "@/server/enquiries";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium" }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusLabel(value: string): string {
  return value.replace(/_/g, " ");
}


function myobOrderTone(status: string | null | undefined): { bg: string; fg: string; border: string; label: string } {
  if (status === "synced") return { bg: "#dcfae6", fg: "#067647", border: "#abefc6", label: "MYOB order synced" };
  if (status === "ready_to_sync") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa", label: "Ready for MYOB order" };
  if (status === "syncing") return { bg: "#eef4ff", fg: "#3538cd", border: "#c7d7fe", label: "Syncing to MYOB" };
  if (status === "error") return { bg: "#fff1f3", fg: "#c01048", border: "#fecdd3", label: "MYOB sync issue" };
  return { bg: "#f8fafc", fg: "#475467", border: "#e2e8f0", label: "Not in MYOB" };
}

function statusTone(status: string): { bg: string; fg: string; border: string } {
  if (status === "completed") return { bg: "#dcfae6", fg: "#067647", border: "#abefc6" };
  if (status === "ready_for_dispatch") return { bg: "#e0f2fe", fg: "#075985", border: "#bae6fd" };
  if (status === "in_production") return { bg: "#eef4ff", fg: "#3538cd", border: "#c7d7fe" };
  if (status === "waiting_on_files" || status === "waiting_on_material") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  if (status === "deleted") return { bg: "#fff5f4", fg: "#b42318", border: "#fecaca" };
  return { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe" };
}

function isPdfOrFile(url: string | null | undefined, fileName?: string | null): boolean {
  const text = `${url ?? ""} ${fileName ?? ""}`.toLowerCase().split("?")[0];
  return text.endsWith(".pdf") || text.endsWith(".ai") || text.endsWith(".eps") || text.endsWith(".zip") || text.endsWith(".rar") || text.endsWith(".7z") || text.includes(".pdf ");
}

function proofPreview(item: ProductionItemRecord) {
  const previewUrl = item.proofImageUrl || item.selectedImageUrl;
  const previewAlt = item.proofImageUrl ? item.title : item.selectedImageAlt || item.title;
  if (!previewUrl) return <div style={{ color: "#667085" }}>No approved proof or product reference attached.</div>;
  if (isPdfOrFile(previewUrl, item.proofFileName)) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: 180, gap: 10, background: "#fff", borderRadius: 16, border: "1px dashed #cbd5e1" }}>
        <strong>Approved proof file</strong>
        <a href={previewUrl} target="_blank" rel="noreferrer" style={{ color: "#6d28d9", fontWeight: 900, textDecoration: "none" }}>{item.proofFileName || "Open proof"}</a>
      </div>
    );
  }
  return <div style={{ display: "grid", gap: 6 }}>
    <img src={previewUrl} alt={previewAlt} style={{ width: "100%", height: 220, objectFit: "contain", objectPosition: "center", display: "block", background: "#fff", borderRadius: 16 }} />
    {!item.proofImageUrl && item.selectedImageUrl ? <span style={{ color: "#475467", fontSize: 12, fontWeight: 850 }}>Selected product option reference</span> : null}
  </div>;
}


function splitQuoteParts(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/\s+·\s+|\n+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function firstMatchingPart(parts: string[], pattern: RegExp): string | null {
  return parts.find((part) => pattern.test(part)) ?? null;
}

function extractDimension(value: string | null | undefined): string | null {
  const source = String(value ?? "");
  const match = source.match(/\b(\d+(?:\.\d+)?\s*(?:mm)?\s*[×x]\s*\d+(?:\.\d+)?\s*(?:mm)?)\b/i);
  if (!match?.[1]) return null;
  return match[1]
    .replace(/\s+/g, " ")
    .replace(/\s*[x×]\s*/i, " × ")
    .replace(/mm\s*$/i, "mm")
    .trim();
}

function usage(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
}

type DimensionInfo = {
  raw: string;
  width: number;
  height: number;
  area: number;
  part: string;
};

type ProductionRequirement = {
  label: string;
  item: string;
  quantity: string;
  note?: string;
};

function parseDimensionText(value: string | null | undefined, partOverride?: string): DimensionInfo | null {
  const source = String(value ?? "");
  const match = source.match(/\b(\d+(?:\.\d+)?)\s*(?:mm)?\s*[×x]\s*(\d+(?:\.\d+)?)\s*(?:mm)?\b/i);
  if (!match?.[1] || !match?.[2]) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    raw: `${usage(width)} × ${usage(height)}mm`,
    width,
    height,
    area: width * height,
    part: partOverride ?? source
  };
}

function dimensionCandidates(parts: string[], fallbackText: string | null | undefined): DimensionInfo[] {
  const fromParts = parts
    .map((part) => parseDimensionText(part, part))
    .filter((dimension): dimension is DimensionInfo => Boolean(dimension));
  const fallback = parseDimensionText(fallbackText ?? "");
  return fallback ? [...fromParts, fallback] : fromParts;
}

function isStockLikePart(part: string): boolean {
  return /\b(stock|sheet|substrate|material|acm|aluminium|composite|acrylic|corflute|coreflute|pvc|foamboard|foam board|paper|gsm|banner|vinyl|sav|roll|laminate|lamination|lam-)\b/i.test(part);
}

function cleanQuotePart(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/^Laminate:\s*/i, "")
    .replace(/^Coating:\s*/i, "")
    .replace(/^Finishing:\s*/i, "")
    .trim();
}

function summaryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

function cleanProductionSummary(value: string | null | undefined, options?: { exclude?: RegExp }): string | null {
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

function chooseFinishedDimension(parts: string[], item: ProductionItemRecord): DimensionInfo | null {
  const candidates = dimensionCandidates(parts, item.sizeSummary);
  if (!candidates.length) return null;
  const nonStock = candidates.filter((candidate) => !isStockLikePart(candidate.part));
  if (nonStock.length) {
    return nonStock.sort((a, b) => b.area - a.area)[0] ?? null;
  }
  const itemDimension = parseDimensionText(item.sizeSummary ?? "");
  return itemDimension ?? candidates.sort((a, b) => b.area - a.area)[0] ?? null;
}

function stockDimensionFromPart(part: string): DimensionInfo | null {
  if (!isStockLikePart(part)) return null;
  return parseDimensionText(part, part);
}

function quantityNumber(value: string | null | undefined): number {
  const parsed = Number(String(value ?? "1").replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function calculateSheetRequirement(finished: DimensionInfo, stock: DimensionInfo, itemQty: number): { quantity: number; note: string } {
  const fw = finished.width;
  const fh = finished.height;
  const sw = stock.width;
  const sh = stock.height;

  const fitNormal = fw <= sw && fh <= sh;
  const fitRotated = fw <= sh && fh <= sw;
  if (fitNormal || fitRotated) {
    const piecesNormal = fitNormal ? Math.floor(sw / fw) * Math.floor(sh / fh) : 0;
    const piecesRotated = fitRotated ? Math.floor(sw / fh) * Math.floor(sh / fw) : 0;
    const piecesPerSheet = Math.max(1, piecesNormal, piecesRotated);
    return {
      quantity: Math.ceil(itemQty / piecesPerSheet),
      note: `${piecesPerSheet} piece${piecesPerSheet === 1 ? "" : "s"}/sheet from ${stock.raw}`
    };
  }

  const normalPanels = Math.ceil(fw / sw) * Math.ceil(fh / sh);
  const rotatedPanels = Math.ceil(fw / sh) * Math.ceil(fh / sw);
  const panelsPerItem = Math.max(1, Math.min(normalPanels, rotatedPanels));
  return {
    quantity: Math.ceil(panelsPerItem * itemQty),
    note: `${panelsPerItem} panel${panelsPerItem === 1 ? "" : "s"}/item required for ${finished.raw}`
  };
}

function calculateRollLm(finished: DimensionInfo, rollWidth: number, itemQty: number): { lm: number; note: string } {
  const panelsPerItem = Math.max(1, Math.ceil(finished.width / rollWidth));
  const metres = (finished.height / 1000) * panelsPerItem * itemQty;
  return {
    lm: Math.ceil(metres),
    note: `${panelsPerItem} panel${panelsPerItem === 1 ? "" : "s"}/item on ${usage(rollWidth)}mm roll width`
  };
}

function rollWidthFromPart(part: string): number | null {
  const dimension = parseDimensionText(part);
  if (dimension) return Math.max(dimension.width, dimension.height);
  const match = part.match(/\b(\d{3,4})\s*mm\b/i);
  if (!match?.[1]) return null;
  const width = Number(match[1]);
  return Number.isFinite(width) && width > 0 ? width : null;
}

function formatMaterialName(part: string): string {
  return cleanQuotePart(part).replace(/\s+/g, " ").trim();
}

function laminateDisplayName(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = cleanQuotePart(raw);
  if (/\bnone\b/i.test(cleaned)) return null;
  if (/\bgloss\b/i.test(cleaned)) return "gloss laminate";
  if (/\b(matt|matte)\b/i.test(cleaned)) return "matte laminate";
  if (/anti\s*graffiti/i.test(cleaned)) return "anti-graffiti laminate";
  if (/whiteboard/i.test(cleaned)) return "whiteboard laminate";
  return `${cleaned} laminate`;
}

function printDisplayName(parts: string[], ink: string | null): string | null {
  const printMethod = parts.find((part) => /\b(direct print|roll stock|cut vinyl|printed|print)\b/i.test(part));
  const method = printMethod ? cleanQuotePart(printMethod).toLowerCase() : null;
  if (!method && !ink) return null;
  return [method, ink].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function baseProductName(item: ProductionItemRecord, parts: string[]): string {
  const first = parts.find((part) => part && !/^Artwork\b/i.test(part) && !parseDimensionText(part));
  const fromProduct = String(item.quoteProductName || item.title || "Production item").split(" - ")[0]?.trim();
  const base = fromProduct || first || "Production item";
  if (item.productionType === "small_format" || item.productionType === "plan_printing" || item.productionType === "poster_printing") return base;
  if (/\bsign\b/i.test(base)) return base;
  if (/\b(service|delivery|install|pickup)\b/i.test(base)) return base;
  return `${base} sign`;
}

function websitePaymentLabel(item: ProductionItemRecord): string | null {
  const method = String(item.websitePaymentMethod ?? "").toLowerCase();
  const title = String(item.websitePaymentTitle ?? "").toLowerCase();
  const terms = String(item.websiteAccountTerms ?? "").toLowerCase();
  if (method === "te_charge_to_account" || title.includes("charge to account") || terms.startsWith("account_")) return "Charge to account";
  if (method === "te_cod" || title === "cod" || title.includes("cash on delivery")) return "COD";
  return null;
}

function productionTitleForItem(details: { baseName: string; quoteParts: string[]; inkLabel: string | null; laminateRaw: string | null; finishedSize: DimensionInfo | null }): string {
  const pieces = [details.baseName];
  const print = printDisplayName(details.quoteParts, details.inkLabel);
  const laminate = laminateDisplayName(details.laminateRaw);
  const process = [print, laminate].filter(Boolean).join(" and ");
  if (process) pieces.push(`with ${process}`);
  if (details.finishedSize) pieces.push(details.finishedSize.raw);
  return pieces.join(" ");
}

function buildRequirements(item: ProductionItemRecord, details: {
  quoteParts: string[];
  finishedSize: DimensionInfo | null;
  laminateRaw: string | null;
  inkLabel: string | null;
}): ProductionRequirement[] {
  const requirements: ProductionRequirement[] = [];
  const qty = quantityNumber(item.quantity);
  const finished = details.finishedSize;
  const stockParts = details.quoteParts.filter((part) => {
    if (!stockDimensionFromPart(part)) return false;
    if (/\b(laminate|lamination|lam-)\b/i.test(part)) return false;
    if (/\b(vinyl|sav|roll|banner|media)\b/i.test(part)) return false;
    return isStockLikePart(part);
  });

  for (const part of stockParts) {
    const stockDimension = stockDimensionFromPart(part);
    if (!stockDimension) continue;
    const sheet = finished ? calculateSheetRequirement(finished, stockDimension, qty) : null;
    requirements.push({
      label: "Stock / substrate",
      item: `${formatMaterialName(part)} (Stock)`,
      quantity: sheet ? `${sheet.quantity} sheet${sheet.quantity === 1 ? "" : "s"}` : `Qty ${usage(qty)}`,
      note: sheet?.note
    });
  }

  const mediaParts = details.quoteParts.filter((part) => {
    if (/\b(laminate|lamination|lam-)\b/i.test(part)) return false;
    if (/\broll stock\b/i.test(part)) return false;
    return /\b(vinyl|sav|media|banner|roll)\b/i.test(part);
  });
  for (const part of mediaParts) {
    const rollWidth = rollWidthFromPart(part);
    const lm = finished && rollWidth ? calculateRollLm(finished, rollWidth, qty) : null;
    requirements.push({
      label: "Print media",
      item: formatMaterialName(part),
      quantity: lm ? `${usage(lm.lm)} lm` : finished ? `Covers ${finished.raw}` : "Use quoted quantity",
      note: lm?.note ?? "Quoted roll/media stock"
    });
  }

  const directPrint = details.quoteParts.find((part) => /\bdirect print\b/i.test(part));
  if (directPrint || details.inkLabel) {
    requirements.push({
      label: "Print",
      item: [directPrint ? "Direct print" : "Print", details.inkLabel].filter(Boolean).join(" - "),
      quantity: `${usage(qty)} item${qty === 1 ? "" : "s"}`,
      note: finished ? `Finished print size ${finished.raw}` : undefined
    });
  }

  if (details.laminateRaw && !/\bnone\b/i.test(details.laminateRaw)) {
    const laminateName = formatMaterialName(details.laminateRaw);
    const rollWidth = rollWidthFromPart(details.laminateRaw);
    const lm = finished && rollWidth ? calculateRollLm(finished, rollWidth, qty) : null;
    requirements.push({
      label: "Laminate",
      item: laminateName,
      quantity: lm ? `${usage(lm.lm)} lm` : finished ? `Covers ${finished.raw}` : "Use quoted quantity",
      note: lm?.note ?? "Laminate coverage required for quoted size"
    });
  }

  const finishingParts = details.quoteParts.filter((part) => /\b(jingwei|router|cnc|cut|cutting|drill|holes|eyelet|eyelets|fold|score|staple|numbering|padding|tape)\b/i.test(part));
  for (const part of finishingParts) {
    requirements.push({ label: "Finishing", item: formatMaterialName(part), quantity: "As quoted" });
  }

  return requirements.filter((requirement, index, list) => {
    const key = `${requirement.label}|${requirement.item}`.toLowerCase();
    return list.findIndex((entry) => `${entry.label}|${entry.item}`.toLowerCase() === key) === index;
  });
}

function quotedDetailsForItem(item: ProductionItemRecord) {
  const quoteParts = splitQuoteParts(item.quoteOptionSummary);
  const combined = [item.quoteProductName, item.quoteOptionSummary, item.quoteLineNotes, item.title, item.sizeSummary, item.substrateSummary, item.colourSummary, item.finishingSummary]
    .filter(Boolean)
    .join(" · ");

  const finishedSize = chooseFinishedDimension(quoteParts, item);
  const stockPart = quoteParts.find((part) => stockDimensionFromPart(part) && !/\b(laminate|lamination|lam-|vinyl|sav|roll|banner|media)\b/i.test(part));
  const laminateRaw = firstMatchingPart(quoteParts, /\b(laminate|lamination|lam-|gloss|matt|matte|anti graffiti|whiteboard)\b/i) || item.finishingSummary;
  const inkLabel = item.colourSummary || firstMatchingPart(quoteParts, /\b(cmyk|mono|white ink|white only|black only)\b/i);
  const print = printDisplayName(quoteParts, inkLabel);
  const finishing = laminateDisplayName(laminateRaw) || quoteParts.filter((part) => /\b(jingwei|router|cnc|cut|drill|holes|eyelet|fold|score|staple|numbering|padding|tape|finishing|coating)\b/i.test(part)).join("\n") || null;
  const baseName = baseProductName(item, quoteParts);
  const material = cleanProductionSummary(item.substrateSummary, { exclude: /\b(laminate|lamination|lam-|gloss laminate|matt laminate|matte laminate|coating)\b/i }) || stockPart || firstMatchingPart(quoteParts, /\b(acm|aluminium composite|acrylic|corflute|coreflute|pvc|foamboard|banner|vinyl|roll|stock|paper|gsm|substrate|clear|opal|white|black|sheet)\b/i) || item.quoteProductName;

  const details = {
    baseName,
    product: item.quoteProductName || item.title,
    finishedSize,
    size: finishedSize?.raw ?? item.sizeSummary ?? extractDimension(combined),
    material,
    print,
    finishing,
    quoteParts,
    notes: item.quoteLineNotes,
    lineTotal: item.quoteLineTotal,
    laminateRaw,
    inkLabel
  };

  return {
    ...details,
    productionTitle: productionTitleForItem(details),
    requirements: buildRequirements(item, details)
  };
}

function QuotedDetailsCard({ item, purchaseOrderNumber }: { item: ProductionItemRecord; purchaseOrderNumber?: string | null }) {
  const details = quotedDetailsForItem(item);
  const paymentLabel = websitePaymentLabel(item);
  const fields = [
    ["Finished item", details.productionTitle],
    ["Quantity", item.quantity],
    ["Finished size", details.size],
    ["Primary stock", details.material],
    ["Print", details.print],
    ["Laminate / finish", details.finishing]
  ].filter((field): field is [string, string] => Boolean(field[1]));

  return (
    <section style={{ border: "2px solid #93c5fd", borderRadius: 22, padding: 16, background: "linear-gradient(180deg, #eff6ff 0%, #f8fbff 100%)", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 5 }}>
          <span style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.1em" }}>Priority production instruction</span>
          <h3 style={{ margin: 0, color: "#0f172a", fontSize: 24, lineHeight: 1.18 }}>{details.productionTitle}</h3>
          <p style={{ margin: 0, color: "#475467", fontSize: 13 }}>This is the final item production should make, separated from the stock sheets/media used to make it.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {paymentLabel ? <span style={{ borderRadius: 999, background: "#ecfdf3", border: "1px solid #86efac", color: "#067647", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{paymentLabel}</span> : null}
          {purchaseOrderNumber ? <span style={{ borderRadius: 999, background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>Client PO: {purchaseOrderNumber}</span> : null}
          {details.lineTotal ? <span style={{ borderRadius: 999, background: "#fff", border: "1px solid #bfdbfe", color: "#1d4ed8", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>Quoted total ${details.lineTotal}</span> : null}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        {fields.map(([label, value]) => (
          <div key={label} style={{ border: "1px solid #dbeafe", borderRadius: 16, background: "#fff", padding: 12, display: "grid", gap: 5 }}>
            <span style={{ color: "#667085", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
            <strong style={{ whiteSpace: "pre-wrap", color: "#0f172a", lineHeight: 1.25 }}>{value}</strong>
          </div>
        ))}
      </div>

      <div style={{ border: "1px solid #bfdbfe", borderRadius: 18, background: "#fff", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderBottom: "1px solid #dbeafe", background: "#f8fbff" }}>
          <strong style={{ color: "#0f172a" }}>Required stock / media / production requirements</strong>
          <span style={{ color: "#475467", fontSize: 12, fontWeight: 850 }}>{details.requirements.length} requirement{details.requirements.length === 1 ? "" : "s"}</span>
        </div>
        {details.requirements.length ? (
          <div style={{ display: "grid" }}>
            {details.requirements.map((requirement, index) => (
              <div key={`${requirement.label}-${requirement.item}-${index}`} style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr) 140px", gap: 12, padding: "12px 14px", borderTop: index === 0 ? "none" : "1px solid #eef2f7", alignItems: "start" }}>
                <span style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.04em" }}>{requirement.label}</span>
                <div style={{ display: "grid", gap: 3 }}>
                  <strong style={{ color: "#0f172a", lineHeight: 1.25 }}>{requirement.item}</strong>
                  {requirement.note ? <span style={{ color: "#667085", fontSize: 12 }}>{requirement.note}</span> : null}
                </div>
                <strong style={{ color: "#0f172a", textAlign: "right" }}>{requirement.quantity}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, padding: 14, color: "#667085" }}>No separate stock/media requirements could be calculated from the quote summary yet. The full quoted choices are shown below.</p>
        )}
      </div>

      {details.quoteParts.length ? (
        <details style={{ border: "1px solid #dbeafe", borderRadius: 16, background: "#fff", padding: 12 }}>
          <summary style={{ cursor: "pointer", color: "#475467", fontSize: 12, fontWeight: 950 }}>Show full quote-line choices</summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
            {details.quoteParts.map((part, index) => (
              <span key={`${part}-${index}`} style={{ borderRadius: 999, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", padding: "6px 9px", fontSize: 12, fontWeight: 850 }}>{part}</span>
            ))}
          </div>
        </details>
      ) : null}

      {details.notes ? <div style={{ color: "#475467", fontSize: 13, whiteSpace: "pre-wrap" }}><strong>Quote notes:</strong> {details.notes}</div> : null}
    </section>
  );
}

function completionForItem(item: ProductionItemRecord, steps: ProductionStepRecord[]): { done: number; total: number } {
  const itemSteps = steps.filter((step) => step.itemId === item.id);
  return { done: itemSteps.filter((step) => step.status === "done").length, total: itemSteps.length };
}

function pageCompletion(steps: ProductionStepRecord[]): { done: number; total: number } {
  return { done: steps.filter((step) => step.status === "done").length, total: steps.length };
}

function isDirectPrintItem(item: ProductionItemRecord): boolean {
  const source = summaryKey([
    item.title,
    item.quoteProductName,
    item.quoteOptionSummary,
    item.sizeSummary,
    item.substrateSummary,
    item.colourSummary,
    item.finishingSummary
  ].filter(Boolean).join(" "));
  return /\bdirect print\b/.test(source);
}

function isObsoleteStepForItem(item: ProductionItemRecord, step: ProductionStepRecord): boolean {
  const stepText = summaryKey(`${step.label} ${step.stepType}`);
  return isDirectPrintItem(item) && /\bapply\b/.test(stepText) && /\bmount\b/.test(stepText) && /\bsubstrate\b/.test(stepText);
}

function visibleStepsForItem(item: ProductionItemRecord, allSteps: ProductionStepRecord[]): ProductionStepRecord[] {
  return allSteps.filter((step) => step.itemId === item.id && !isObsoleteStepForItem(item, step));
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
  minHeight: 92,
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

function statusButton(job: ProductionJobRecord, status: string, label: string, tone?: string) {
  const active = job.status === status;
  return (
    <form action={setProductionJobStatusAction}>
      <input type="hidden" name="jobId" value={job.id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        style={{
          ...secondaryButtonStyle,
          minHeight: 40,
          background: active ? (tone || "#0f172a") : "#fff",
          color: active ? "#fff" : "#344054",
          borderColor: active ? (tone || "#0f172a") : "#cfd9e8"
        }}
      >
        {label}
      </button>
    </form>
  );
}

export async function ProductionPageContent({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    redirect("/bootstrap");
    throw new Error("Active tenant is required");
  }
  const tenantId = activeTenant.tenantId;

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const selectedParam = readParam(params, "selected");
  const filter = readParam(params, "filter");
  const detailOnly = readParam(params, "detail") === "1";

  if (selectedParam && !detailOnly) {
    const redirectParams = new URLSearchParams();
    if (message) redirectParams.set("message", message);
    if (error) redirectParams.set("error", error);
    const suffix = redirectParams.size ? `?${redirectParams.toString()}` : "";
    redirect(`/production/${encodeURIComponent(selectedParam)}${suffix}`);
  }

  const [allJobs, approvedArtwork, quoteDrafts, clients, allEnquiries, stepSummaries] = await Promise.all([
    listProductionJobsForTenant(tenantId, { includeDeleted: true }),
    listApprovedArtworkReadyForProduction(tenantId),
    listQuoteDraftsForTenant(tenantId, { includeDeleted: true }),
    listCustomersForTenant(tenantId),
    listEnquiriesForTenant(tenantId, { includeDeleted: true }),
    listProductionJobStepSummariesForTenant(tenantId)
  ]);
  const deletedJobCount = allJobs.filter((job) => job.status === "deleted").length;
  const completedJobCount = allJobs.filter((job) => job.status === "completed").length;
  const jobs = filter === "deleted"
    ? allJobs.filter((job) => job.status === "deleted")
    : filter === "completed"
      ? allJobs.filter((job) => job.status === "completed")
      : allJobs.filter((job) => job.status !== "deleted" && job.status !== "completed");
  const selectedJob = selectedParam ? allJobs.find((job) => job.id === selectedParam) ?? null : null;
  const selectedJobMissing = Boolean(selectedParam && !selectedJob);
  let items: ProductionItemRecord[] = [];
  let steps: ProductionStepRecord[] = [];
  let selectedQuote = null as Awaited<ReturnType<typeof getQuoteDraftById>>;
  if (selectedJob) {
    [items, steps, selectedQuote] = await Promise.all([listProductionItemsForJob(selectedJob.id), listProductionStepsForJob(selectedJob.id), getQuoteDraftById(tenantId, selectedJob.quoteId)]);
  }
  const customerById = new Map(clients.map((client) => [client.id, client]));
  const quoteById = new Map(quoteDrafts.map((quote) => [quote.id, quote]));
  const enquiryById = new Map(allEnquiries.map((item) => [item.id, item]));
  const logoForQuoteId = (quoteId: string | null | undefined) => {
    const quote = quoteId ? quoteById.get(quoteId) : null;
    const sourceEnquiry = quote?.enquiryId ? enquiryById.get(quote.enquiryId) : null;
    return sourceEnquiry?.clientLogoUrl || customerLogoUrl(quote?.linkedCustomerId ? customerById.get(quote.linkedCustomerId) : null);
  };
  const logoForJob = (job: ProductionJobRecord | null | undefined) =>
    logoForQuoteId(job?.quoteId) || customerLogoUrl(job?.linkedCustomerId ? customerById.get(job.linkedCustomerId) : null);
  const selectedJobLogoUrl = logoForJob(selectedJob);
  const stepSummaryByJobId = new Map(stepSummaries.map((summary) => [summary.jobId, summary]));
  const complete = pageCompletion(selectedJob ? items.flatMap((item) => visibleStepsForItem(item, steps)) : steps);
  const readyCount = allJobs.filter((job) => job.status === "ready_to_start").length;
  const inProductionCount = allJobs.filter((job) => job.status === "in_production").length;
  const waitingCount = allJobs.filter((job) => job.status === "waiting_on_files" || job.status === "waiting_on_material").length;
  const readyDispatchCount = allJobs.filter((job) => job.status === "ready_for_dispatch").length;

  return (
    <div style={{ maxWidth: 1540, margin: "0 auto", display: "grid", gap: 18 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}

      {!detailOnly ? <>
        <section style={{ ...cardStyle, display: "grid", gap: 12, background: "linear-gradient(135deg, #ffffff 0%, #f7fbff 55%, #eef4ff 100%)" }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2563eb" }}>Production</p>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "start" }}>
            <div style={{ display: "grid", gap: 8, minWidth: 280 }}>
              <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>Current jobs</h1>
              <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>See what every job is waiting on. Open a job for its artwork, production breakdown and step-by-step checkoff.</p>
            </div>
            <div style={{ display: "grid", gap: 10, minWidth: 460 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(110px, 1fr))", gap: 10 }}>
                {[["Ready", readyCount], ["Waiting", waitingCount], ["In production", inProductionCount], ["Ready out", readyDispatchCount]].map(([label, count]) => (
                  <div key={String(label)} style={{ border: "1px solid #dbe4f0", borderRadius: 18, padding: 12, background: "rgba(255,255,255,0.78)" }}>
                    <strong style={{ fontSize: 24 }}>{count}</strong>
                    <div style={{ color: "#667085", fontSize: 12, fontWeight: 800 }}>{label}</div>
                  </div>
                ))}
              </div>
              <OpenFullscreenBoardButton />
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>{filter === "deleted" ? "Deleted jobs" : filter === "completed" ? "Completed jobs" : "Active production jobs"}</h2>
              <p style={{ margin: "4px 0 0", color: "#667085", fontSize: 13 }}>Current step and due date at a glance. Click any row for the complete job.</p>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <a href="/production" style={{ color: !filter ? "#2563eb" : "#667085", fontWeight: 900, textDecoration: "none" }}>Active</a>
              <a href="/production?filter=completed" style={{ color: filter === "completed" ? "#2563eb" : "#667085", fontWeight: 900, textDecoration: "none" }}>Completed ({completedJobCount})</a>
              <a href="/production?filter=deleted" style={{ color: filter === "deleted" ? "#2563eb" : "#667085", fontWeight: 900, textDecoration: "none" }}>Deleted ({deletedJobCount})</a>
              <span style={{ borderRadius: 999, background: "#eef4ff", color: "#3538cd", padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>{jobs.length} job{jobs.length === 1 ? "" : "s"}</span>
            </div>
          </div>

          <div style={{ display: "grid", gap: 7 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.45fr) minmax(220px, 1fr) 160px 150px 28px", gap: 14, padding: "0 16px", color: "#667085", fontSize: 11, fontWeight: 950, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <span>Job</span><span>Current step</span><span>Status</span><span>Due date</span><span />
            </div>
            {jobs.map((job) => {
              const tone = statusTone(job.status);
              const jobLogoUrl = logoForJob(job);
              const summary = stepSummaryByJobId.get(job.id);
              return (
                <a key={job.id} href={`/production/${job.id}`} style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.45fr) minmax(220px, 1fr) 160px 150px 28px", gap: 14, alignItems: "center", border: "1px solid #dbe4f0", borderRadius: 16, padding: "13px 16px", background: "#fff", textDecoration: "none", color: "inherit", boxShadow: "0 6px 18px rgba(15,23,42,0.035)" }}>
                  <span style={{ display: "flex", gap: 11, alignItems: "center", minWidth: 0 }}>
                    <ClientLogoBadge logoUrl={jobLogoUrl} name={job.clientName} size={42} radius={11} padding={4} />
                    <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
                      <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.clientName}</strong>
                      <span style={{ color: "#667085", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.quoteNumber ?? "No quote number"}{job.projectName ? ` · ${job.projectName}` : ""}</span>
                    </span>
                  </span>
                  <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
                    <strong style={{ color: summary?.currentStep === "All steps complete" ? "#067647" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary?.currentStep ?? "No production steps"}</strong>
                    <span style={{ color: "#667085", fontSize: 12 }}>{summary?.stepsDone ?? 0}/{summary?.stepsTotal ?? 0} steps complete</span>
                  </span>
                  <span><span style={{ display: "inline-block", borderRadius: 999, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, padding: "5px 9px", fontSize: 11, fontWeight: 950 }}>{statusLabel(job.status)}</span></span>
                  <span style={{ color: job.dueDate ? "#344054" : "#98a2b3", fontWeight: job.dueDate ? 850 : 650 }}>{job.dueDate ? formatDate(job.dueDate) : "No due date"}</span>
                  <span style={{ color: "#2563eb", fontSize: 20, fontWeight: 950 }}>›</span>
                </a>
              );
            })}
            {jobs.length === 0 ? <div style={{ color: "#667085", padding: 16, border: "1px dashed #cfd9e8", borderRadius: 14 }}>No jobs in this view.</div> : null}
          </div>
        </section>

        {approvedArtwork.length > 0 ? (
        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div>
            <h2 style={{ margin: 0 }}>Approved artwork ready to start</h2>
            <p style={{ margin: "4px 0 0", color: "#667085" }}>Approved artwork packs that do not yet have a production job.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {approvedArtwork.map((approval) => {
              const approvalLogoUrl = logoForQuoteId(approval.quoteId);
              return (
                <form key={approval.approvalId} action={createProductionJobFromArtworkAction} style={{ border: "1px solid #dbe4f0", borderRadius: 18, padding: 14, background: "#fbfdff", display: "grid", gap: 8 }}>
                  <input type="hidden" name="approvalId" value={approval.approvalId} />
                  <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                    <ClientLogoBadge logoUrl={approvalLogoUrl} name={approval.clientName} size={44} radius={12} padding={4} />
                    <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{approval.clientName}</strong>
                  </div>
                  <span style={{ color: "#475467", fontSize: 13 }}>{approval.quoteNumber ?? "Quote"}{approval.projectName ? ` · ${approval.projectName}` : ""}</span>
                  <span style={{ color: "#667085", fontSize: 12 }}>{approval.pageCount} approved proof page{approval.pageCount === "1" ? "" : "s"} · Approved {formatDateTime(approval.approvedAt)}</span>
                  <button type="submit" style={buttonStyle}>Create production job</button>
                </form>
              );
            })}
          </div>
        </section>
        ) : null}
      </> : null}

      {detailOnly && selectedJobMissing ? (
        <section style={{ ...cardStyle, borderColor: "#fed7aa", background: "#fff7ed", color: "#9a3412", display: "grid", gap: 10 }}>
          <strong>That production job could not be found.</strong>
          <a href="/production" style={{ color: "#9a3412", fontWeight: 950 }}>Return to current jobs</a>
        </section>
      ) : null}

      {selectedJob ? (
        <section style={{ display: "grid", gap: 18 }}>
          {detailOnly ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <a href="/production" style={{ color: "#2563eb", fontWeight: 950, textDecoration: "none" }}>← All production jobs</a>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ borderRadius: 999, background: "#f8fafc", border: "1px solid #dbe4f0", padding: "7px 11px", color: "#344054", fontSize: 12, fontWeight: 900 }}>Current: {stepSummaryByJobId.get(selectedJob.id)?.currentStep ?? "No production steps"}</span>
                <span style={{ borderRadius: 999, background: selectedJob.dueDate ? "#fff7ed" : "#f8fafc", border: `1px solid ${selectedJob.dueDate ? "#fed7aa" : "#dbe4f0"}`, padding: "7px 11px", color: selectedJob.dueDate ? "#9a3412" : "#667085", fontSize: 12, fontWeight: 900 }}>{selectedJob.dueDate ? `Due ${formatDate(selectedJob.dueDate)}` : "No due date set"}</span>
              </div>
            </div>
          ) : null}
          <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "start" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
                <ClientLogoBadge logoUrl={selectedJobLogoUrl} name={selectedJob.clientName} size={62} radius={18} padding={5} />
                <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                  <p style={{ margin: 0, color: "#667085", fontWeight: 850 }}>{selectedJob.quoteNumber ?? "Production job"}</p>
                  <h2 style={{ margin: 0, fontSize: 32, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedJob.clientName}</h2>
                  <p style={{ margin: 0, color: "#475467" }}>{selectedJob.projectName ?? "Production from approved artwork"}{selectedJob.contactName ? ` · ${selectedJob.contactName}` : ""}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ borderRadius: 999, background: statusTone(selectedJob.status).bg, color: statusTone(selectedJob.status).fg, border: `1px solid ${statusTone(selectedJob.status).border}`, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{statusLabel(selectedJob.status)}</span>
                <span style={{ borderRadius: 999, background: "#f8fafc", border: "1px solid #dbe4f0", color: "#344054", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{complete.done}/{complete.total} steps done</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {statusButton(selectedJob, "ready_to_start", "Ready to start")}
              {statusButton(selectedJob, "waiting_on_files", "Waiting on files", "#c2410c")}
              {statusButton(selectedJob, "waiting_on_material", "Waiting on material", "#c2410c")}
              {statusButton(selectedJob, "in_production", "In production", "#3538cd")}
              {statusButton(selectedJob, "ready_for_dispatch", "Ready for install / pickup", "#075985")}
              {statusButton(selectedJob, "completed", "Complete", "#067647")}
              <form action={syncProductionJobAction}>
                <input type="hidden" name="jobId" value={selectedJob.id} />
                <button type="submit" style={secondaryButtonStyle}>Sync from artwork pages</button>
              </form>
              <a href={`/job-sheets/${selectedJob.id}`} target="_blank" rel="noreferrer" style={{ ...secondaryButtonStyle, display: "inline-flex", alignItems: "center", textDecoration: "none", color: "#0f172a" }}>Print job sheet</a>
              {selectedJob.status === "deleted" ? (
                <form action={restoreProductionJobAction}>
                  <input type="hidden" name="jobId" value={selectedJob.id} />
                  <button type="submit" style={{ ...secondaryButtonStyle, color: "#067647", borderColor: "#abefc6" }}>Restore</button>
                </form>
              ) : (
                <form action={deleteProductionJobAction}>
                  <input type="hidden" name="jobId" value={selectedJob.id} />
                  <button type="submit" style={{ ...secondaryButtonStyle, color: "#b42318", borderColor: "#fecaca" }}>Delete</button>
                </form>
              )}
            </div>
          </section>

          <details style={{ ...cardStyle, order: 4, borderColor: "#bfdbfe", background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)" }}>
            <summary style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", cursor: "pointer", listStyle: "none" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Job settings, due date and variations</h2>
                <p style={{ margin: "4px 0 0", color: "#667085", fontSize: 13 }}>Open only when the job assignment, delivery workflow or quoted work needs changing.</p>
              </div>
              <span style={{ borderRadius: 999, background: "#eef4ff", color: "#3538cd", border: "1px solid #c7d7fe", padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>Open settings ↓</span>
            </summary>
            <form action={updateProductionJobDetailsAction} style={{ display: "grid", gap: 14, marginTop: 18, paddingTop: 18, borderTop: "1px solid #dbe4f0" }}>
              <input type="hidden" name="jobId" value={selectedJob.id} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                <label style={labelStyle}>Dispatch type
                  <select name="dispatchType" defaultValue={selectedJob.dispatchType ?? ""} style={inputStyle}>
                    <option value="">Not set / keep from quote</option>
                    <option value="pickup">Pickup</option>
                    <option value="delivery">Delivery</option>
                    <option value="install">Install</option>
                  </select>
                </label>
                <label style={labelStyle}>Priority
                  <select name="priority" defaultValue={selectedJob.priority ?? "normal"} style={inputStyle}>
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                    <option value="hold">On hold</option>
                  </select>
                </label>
                <label style={labelStyle}>Due date<input name="dueDate" type="date" defaultValue={selectedJob.dueDate ?? ""} style={inputStyle} /></label>
                <label style={labelStyle}>Assigned to<input name="assignedTo" defaultValue={selectedJob.assignedTo ?? ""} placeholder="Staff member" style={inputStyle} /></label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
                <label style={labelStyle}>Dispatch / fixing notes<textarea name="dispatchNotes" placeholder="Example: install on-site, silicone + screws, front entry, client requested change from pickup" style={{ ...textareaStyle, minHeight: 84 }} /></label>
                <label style={labelStyle}>Internal production notes<textarea name="internalNotes" defaultValue={selectedJob.internalNotes ?? ""} placeholder="Notes for production staff" style={{ ...textareaStyle, minHeight: 84 }} /></label>
              </div>

              <section style={{ border: "1px solid #fed7aa", borderRadius: 18, padding: 14, background: "#fff7ed", display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "grid", gap: 3 }}>
                    <strong>Optional billable variation</strong>
                    <span style={{ color: "#9a3412", fontSize: 13 }}>Tick this only if the client change needs an extra charge added to the quote/order.</span>
                  </div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 950, color: "#9a3412" }}>
                    <input type="checkbox" name="addVariation" value="yes" /> Add variation line
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.7fr 0.9fr", gap: 10 }}>
                  <label style={labelStyle}>Line name<input name="variationProductName" placeholder="Sign Install" style={inputStyle} /></label>
                  <label style={labelStyle}>Summary<input name="variationOptionSummary" placeholder="Fixings, access, delivery/install notes" style={inputStyle} /></label>
                  <label style={labelStyle}>Qty<input name="variationQuantity" type="number" step="0.01" min="0" defaultValue="1" style={inputStyle} /></label>
                  <label style={labelStyle}>Sell price<input name="variationUnitPrice" type="number" step="0.01" min="0" placeholder="0.00" style={inputStyle} /></label>
                </div>
                <label style={labelStyle}>Variation notes<textarea name="variationNotes" placeholder="Example: Client changed pickup to install after quote acceptance. Add install charge and schedule installer." style={{ ...textareaStyle, minHeight: 74 }} /></label>
              </section>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="submit" style={buttonStyle}>Save workflow changes</button>
              </div>
            </form>
          </details>

          <section style={{ ...cardStyle, order: 2, display: "grid", gap: 16 }}>
            <div>
              <h2 style={{ margin: 0 }}>Production work</h2>
              <p style={{ margin: "4px 0 0", color: "#667085" }}>Follow the production instruction, complete the procedure in order, and use the attached print-ready artwork.</p>
            </div>
            {items.map((item) => {
              const itemSteps = visibleStepsForItem(item, steps);
              const itemComplete = { done: itemSteps.filter((step) => step.status === "done").length, total: itemSteps.length };
              const productionDetails = quotedDetailsForItem(item);
              return (
                <article key={item.id} style={{ border: "1px solid #dbe4f0", borderRadius: 22, padding: 16, background: "#fbfdff", display: "grid", gap: 14 }}>
                  <div style={{ order: -1 }}><QuotedDetailsCard item={item} purchaseOrderNumber={selectedQuote?.clientPurchaseOrderNumber} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 0.8fr) minmax(0, 1.2fr)", gap: 16, alignItems: "start" }}>
                    <div style={{ display: "grid", gap: 10 }}>
                      {proofPreview(item)}
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{item.itemCode ? `${item.itemCode} · ` : ""}{productionDetails.productionTitle}</strong>
                        <span style={{ color: "#667085", fontSize: 13 }}>Qty {item.quantity} · {item.productionType.replace(/_/g, " ")} · {itemComplete.done}/{itemComplete.total} steps</span>
                        <span style={{ color: "#475467", fontSize: 13 }}>Source artwork page: {item.title}</span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 14 }}>
                      <section style={{ border: "1px solid #e4e7ec", borderRadius: 18, padding: 14, background: "#fff", display: "grid", gap: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <strong>Print-ready artwork</strong>
                          {item.printReadyUrl ? <span style={{ color: "#067647", fontWeight: 950, fontSize: 12 }}>Attached {formatDateTime(item.printReadyUploadedAt)}</span> : <span style={{ color: "#c2410c", fontWeight: 950, fontSize: 12 }}>Waiting on file</span>}
                        </div>
                        {item.printReadyUrl ? (
                          <div style={{ display: "grid", gap: 4, color: "#475467", fontSize: 13 }}>
                            {item.artworkFiles?.length ? item.artworkFiles.map((file, fileIndex) => <a key={`${file.downloadUrl}-${fileIndex}`} href={file.downloadUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>{file.name || `Artwork file ${fileIndex + 1}`}</a>) : <a href={item.printReadyUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>{item.printReadyFileName || "Open print-ready file"}</a>}
                            <span>{item.printReadyFileType || "File"}{item.printReadyUploadedBy ? ` · uploaded by ${item.printReadyUploadedBy}` : ""}</span>
                            {item.printReadyNotes ? <span style={{ whiteSpace: "pre-wrap" }}>{item.printReadyNotes}</span> : null}
                          </div>
                        ) : null}
                        <form action={attachPrintReadyFileAction} style={{ display: "grid", gap: 8 }}>
                          <PrintReadyUploadInputs itemId={item.id} />
                          <textarea name="printReadyNotes" placeholder="Optional print-ready file notes / version / RIP notes" style={{ ...textareaStyle, minHeight: 68 }} />
                          <button type="submit" style={secondaryButtonStyle}>Save pasted file link manually</button>
                        </form>
                      </section>

                      <section style={{ display: "grid", gap: 8, order: -1 }}>
                        <strong>Procedure checkoff</strong>
                        <div style={{ display: "grid", gap: 8 }}>
                          {itemSteps.map((step) => (
                            <div key={step.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", border: "1px solid #e4e7ec", borderRadius: 14, padding: 10, background: step.status === "done" ? "#ecfdf3" : "#fff" }}>
                              <ProductionStepToggle stepId={step.id} label={step.label} initialStatus={step.status} initialCheckedAt={step.checkedAt} initialCheckedBy={step.checkedBy} />
                              <span style={{ color: "#667085", fontSize: 11, fontWeight: 850 }}>{step.stepType.replace(/_/g, " ")}</span>
                            </div>
                          ))}
                        </div>
                        <form action={addProductionStepAction} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                          <input type="hidden" name="jobId" value={selectedJob.id} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <input name="label" placeholder="Add manual step for this item" style={inputStyle} />
                          <button type="submit" style={secondaryButtonStyle}>Add step</button>
                        </form>
                      </section>
                    </div>
                  </div>
                </article>
              );
            })}
            {items.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No production items yet. Sync from artwork pages or create production from an approved artwork approval.</p> : null}
          </section>

          {selectedQuote ? (() => {
            const myobTone = myobOrderTone(selectedQuote.myobOrderStatus);
            const canPush = selectedQuote.status === "accepted" && selectedQuote.myobOrderStatus !== "synced";
            return (
              <section style={{ ...cardStyle, order: 5, borderColor: myobTone.border, background: myobTone.bg, color: myobTone.fg, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 5 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>MYOB open job / order</p>
                    <h3 style={{ margin: 0 }}>{myobTone.label}</h3>
                    <p style={{ margin: 0, fontSize: 13 }}>Production Manager runs the workflow. Accepted quotes are sent to MYOB as open Item Orders when you choose to sync.</p>
                    {selectedQuote.myobOrderNumber ? <p style={{ margin: 0, fontSize: 13 }}>MYOB Order: <strong>{selectedQuote.myobOrderNumber}</strong>{selectedQuote.myobOrderSyncedAt ? ` · ${formatDateTime(selectedQuote.myobOrderSyncedAt)}` : ""}</p> : null}
                    {selectedQuote.myobOrderSyncError ? <p style={{ margin: 0, fontSize: 13, color: "#b42318", whiteSpace: "pre-wrap" }}>{selectedQuote.myobOrderSyncError}</p> : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{ borderRadius: 999, border: `1px solid ${myobTone.border}`, background: "rgba(255,255,255,0.75)", color: myobTone.fg, padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>{myobTone.label}</span>
                    {canPush ? (
                      <form action={pushProductionQuoteToMyobOrderAction}>
                        <input type="hidden" name="jobId" value={selectedJob.id} />
                        <input type="hidden" name="quoteId" value={selectedJob.quoteId} />
                        <button type="submit" style={{ ...buttonStyle, background: "#0f766e" }}>Send to MYOB Item Order</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })() : null}


        </section>
      ) : null}
    </div>
  );
}

export default ProductionPageContent;
