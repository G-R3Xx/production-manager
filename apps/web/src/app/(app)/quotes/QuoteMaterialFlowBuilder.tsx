"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { addQuoteLineAction } from "./actions";
import { materialsFromSnapshot, readQuickQuoteSnapshot, type QuickQuoteFlowType, type QuickQuoteSnapshot, type QuickQuoteStep, type SnapshotMaterial } from "./quoteLineSnapshot";

export type QuoteMaterial = {
  id: string;
  name: string;
  customerFacingName?: string | null;
  materialType?: string | null;
  materialGroup?: string | null;
  minimumBillableSheetFraction?: string | null;
  rollBillingIncrementMetres?: string | null;
  reversePrintable?: boolean;
  usedForBacking?: boolean;
  supplierName?: string | null;
  sku?: string | null;
  stockUom?: string | null;
  purchaseUom?: string | null;
  stockQuantity?: string | null;
  purchaseCost?: string | null;
  widthMm?: string | null;
  lengthMm?: string | null;
  rollWidthMm?: string | null;
  gsm?: string | null;
  notes?: string | null;
};

type QuoteSizePreset = {
  label: string;
  width: string;
  height: string;
};

export type PricingSettings = {
  markupMultiplier?: string | number | null;
  profitMultiplier?: string | number | null;
  labourRate?: string | number | null;
  inkRatePerSqm?: string | number | null;
  inkBillingIncrementSqm?: string | number | null;
  monoRatePerSqm?: string | number | null;
  signageSizePresets?: QuoteSizePreset[] | null;
  smallSizePresets?: QuoteSizePreset[] | null;
  priceLevelFactor?: string | number | null;
  priceLevelName?: string | null;
  priceLevelCode?: string | null;
  manualQuoteDiscountPercent?: string | number | null;
};

type EditableQuoteLine = {
  id: string;
  productName: string;
  optionSummary: string | null;
  quantity: string;
  unitPrice: string;
  notes: string | null;
  configurationSnapshot: unknown;
  reconstructed?: boolean;
};

type QuoteMaterialFlowBuilderProps = {
  quoteId: string;
  materials: QuoteMaterial[];
  pricingSettings?: PricingSettings;
  editingLine?: EditableQuoteLine | null;
};

type FlowType = QuickQuoteFlowType;
type BaseType = "acrylic" | "acm" | "corflute" | "pvc" | "banner" | "other_sheet";
type SmallFormatType = "business_cards" | "flyers" | "brochures" | "booklets" | "duplicate_books" | "stickers";
type ServiceType = "" | "pickup" | "delivery" | "install" | "access_equipment";
type PrintMethod = "" | "no_print" | "direct_print" | "roll_stock" | "cut_vinyl";
type InkChoice = "" | "none" | "cmyk" | "white" | "both";
type SidesChoice = "" | "single" | "double";
type PrintDirection = "" | "positive" | "reverse";
type DropDirection = "auto" | "vertical" | "horizontal";
type ArtworkChoice = "" | "required" | "client_supplied";
type LabourBasis = "per_item" | "line_total";
type SmallPrintColour = "" | "mono" | "cmyk" | "special";

type CostRow = {
  label: string;
  detail: string;
  amount: number;
  unit: string;
  rate: number;
  cost: number;
  note?: string;
};

type CustomComponentPart = {
  id: string;
  materialId: string;
  name: string;
  qty: string;
  unit: string;
  unitCost: string;
  note: string;
};

const defaultLabourRate = 66;
const defaultInkRatePerSqm = 10;
const defaultMonoRatePerSqm = 4;

const baseTypes: Array<{ key: BaseType; label: string; icon: string; description: string; accent: string }> = [
  { key: "acrylic", label: "Acrylic", icon: "▣", description: "Clear, opal, white, black or coloured acrylic signs.", accent: "#7c3aed" },
  { key: "acm", label: "ACM", icon: "◫", description: "Aluminium composite panel signs.", accent: "#2563eb" },
  { key: "corflute", label: "Corflute", icon: "▤", description: "Corrugated plastic signs.", accent: "#0891b2" },
  { key: "pvc", label: "PVC / Foam", icon: "◰", description: "PVC, foamboard or similar sheet materials.", accent: "#16a34a" },
  { key: "banner", label: "Vinyl/Roll Stock", icon: "▰", description: "SAV, printable vinyl, banner media and other roll-stock products.", accent: "#ea580c" },
  { key: "other_sheet", label: "Other sheet", icon: "◧", description: "Any other sheet material in the material library.", accent: "#475569" }
];

const smallFormatTypes: Array<{ key: SmallFormatType; label: string; icon: string; description: string }> = [
  { key: "business_cards", label: "Business cards", icon: "▣", description: "Card stock, sides, cello and quantity." },
  { key: "flyers", label: "Flyers", icon: "▤", description: "Loose sheets, single/double sided and trimming." },
  { key: "brochures", label: "Brochures", icon: "▰", description: "Folded print with paper stock and finishing." },
  { key: "booklets", label: "Booklets", icon: "▥", description: "Covers, inside pages and bindery labour." },
  { key: "duplicate_books", label: "Duplicate / triplicate books", icon: "▱", description: "NCR books, copy colours, tape and numbering." },
  { key: "stickers", label: "Stickers", icon: "◉", description: "Small-format sticker stock, laminate and cutting." }
];

const printDepartments: Array<{ key: Exclude<FlowType, "" | "service" | "component">; label: string; description: string }> = [
  { key: "signage", label: "Large format / signage", description: "ACM, acrylic, corflute, banners, SAV, vinyl and signs." },
  { key: "plan_printing", label: "Plan printing", description: "Architectural plans, drawings, CAD sheets and document sets." },
  { key: "poster_printing", label: "Poster printing", description: "Posters, presentation prints, photo prints and display prints." },
  { key: "small_format", label: "Small format / print", description: "Cards, flyers, brochures, booklets, NCR and stickers." }
];

const defaultSignageSizePresets: QuoteSizePreset[] = [
  { label: "450 × 600 mm", width: "450", height: "600" },
  { label: "600 × 900 mm", width: "600", height: "900" },
  { label: "900 × 1200 mm", width: "900", height: "1200" },
  { label: "1200 × 2400 mm", width: "1200", height: "2400" }
];

const defaultSmallSizePresets: QuoteSizePreset[] = [
  { label: "Business card 90 × 55", width: "90", height: "55" },
  { label: "DL 99 × 210", width: "99", height: "210" },
  { label: "A6 105 × 148", width: "105", height: "148" },
  { label: "A5 148 × 210", width: "148", height: "210" },
  { label: "A4 210 × 297", width: "210", height: "297" },
  { label: "A3 297 × 420", width: "297", height: "420" }
];

const defaultPlanSizePresets: QuoteSizePreset[] = [
  { label: "A4 210 × 297", width: "210", height: "297" },
  { label: "A3 297 × 420", width: "297", height: "420" },
  { label: "A2 420 × 594", width: "420", height: "594" },
  { label: "A1 594 × 841", width: "594", height: "841" },
  { label: "A0 841 × 1189", width: "841", height: "1189" }
];

const defaultPosterSizePresets: QuoteSizePreset[] = [
  { label: "A3 297 × 420", width: "297", height: "420" },
  { label: "A2 420 × 594", width: "420", height: "594" },
  { label: "A1 594 × 841", width: "594", height: "841" },
  { label: "A0 841 × 1189", width: "841", height: "1189" },
  { label: "600 × 900 mm", width: "600", height: "900" },
  { label: "900 × 1200 mm", width: "900", height: "1200" }
];

const printMethods: Array<{ key: Exclude<PrintMethod, "">; label: string; icon: string; description: string }> = [
  { key: "no_print", label: "No print", icon: "—", description: "Material only. Skip ink and print media." },
  { key: "direct_print", label: "Direct print", icon: "◉", description: "Print directly to the base material." },
  { key: "roll_stock", label: "Roll stock", icon: "↻", description: "Pick SAV, print vinyl, banner media or similar roll stock." },
  { key: "cut_vinyl", label: "Cut vinyl", icon: "✂", description: "Pick a roll vinyl material but no ink charge is added." }
];


const finishingOptions = [
  { key: "jingwei", label: "Jingwei cutting", icon: "✦", description: "Cutting/plotting on the Jingwei table." },
  { key: "eyelets", label: "Eyelets", icon: "◎", description: "Ask placement/quantity and charge per eyelet." },
  { key: "vinyl_cutting", label: "Vinyl cutting", icon: "✂", description: "Cut vinyl / lettering / decals." },
  { key: "print_vinyl_application", label: "Print/vinyl application", icon: "▰", description: "Apply printed vinyl, cut vinyl or transfer to substrate." },
  { key: "tape_hem_banner", label: "Tape/Hem Banner", icon: "═", description: "Banner hem tape, hemming and edge finishing." }
];

const smallFinishingOptions = [
  { key: "trim", label: "Extra cutting / trimming", icon: "✂", description: "Add trim/cut labour beyond the normal setup." },
  { key: "fold", label: "Folding", icon: "▰", description: "Add folding setup or machine time." },
  { key: "score", label: "Scoring / creasing", icon: "▱", description: "Add crease/score labour." },
  { key: "staple", label: "Staple / saddle stitch", icon: "⌁", description: "Add booklet finishing labour." },
  { key: "numbering", label: "Sequential numbering", icon: "#", description: "Add numbering setup/labour." },
  { key: "padding", label: "Padding / tape", icon: "▥", description: "Add book padding, tape or binding labour." }
];

const serviceTypes: Array<{ key: Exclude<ServiceType, "">; label: string; icon: string; description: string }> = [
  { key: "pickup", label: "Pickup", icon: "↗", description: "Client collects the job. Usually no charge unless you add notes or a manual price." },
  { key: "delivery", label: "Delivery", icon: "▣", description: "Add a delivery charge as its own quote line." },
  { key: "install", label: "Install", icon: "⚒", description: "Charge install time by crew size, minutes and fixing consumables." },
  { key: "access_equipment", label: "Access equipment", icon: "▦", description: "Hire equipment charged by day, with quote pricing applied automatically." }
];

const dispatchServiceTypes = serviceTypes.filter((item) => item.key !== "access_equipment");

const fixingOptions = [
  { key: "silicone", label: "Silicone", icon: "◍", unit: "tube", placeholderQty: "eg 1", placeholderRate: "eg 12" },
  { key: "tape", label: "VHB / double-sided tape", icon: "═", unit: "lm", placeholderQty: "eg 3", placeholderRate: "eg 2.5" },
  { key: "screws", label: "Screws / anchors", icon: "•", unit: "each", placeholderQty: "eg 12", placeholderRate: "eg 0.25" },
  { key: "screws_custom", label: "Screws / special fixings", icon: "✦", unit: "each", placeholderQty: "eg 4", placeholderRate: "eg 1" },
  { key: "other", label: "Other consumables", icon: "+", unit: "allowance", placeholderQty: "eg 1", placeholderRate: "eg 15" }
];

function createBlankComponentPart(): CustomComponentPart {
  return {
    id: `part-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    materialId: "",
    name: "",
    qty: "",
    unit: "each",
    unitCost: "",
    note: ""
  };
}

function rateForComponentUnit(material: QuoteMaterial | undefined, unit: string): { rate: number; note?: string } {
  if (!material) return { rate: 0 };
  const normalisedUnit = unit.toLowerCase();
  if (["lm", "m", "metre", "meter"].includes(normalisedUnit)) return rollRate(material);
  if (["sheet", "sheets"].includes(normalisedUnit)) return sheetUnitRate(material);
  if (["sqm", "m2", "m²"].includes(normalisedUnit)) {
    const sheetRate = sheetUnitRate(material);
    const dimensions = bestSheetDimensions(material);
    const parentArea = dimensions ? (dimensions.width / 1000) * (dimensions.length / 1000) : 0;
    if (parentArea > 0) return { rate: sheetRate.rate / parentArea, note: `${usage(parentArea)}sqm parent sheet` };
    return sheetRate;
  }
  return eachRate(material);
}

const eyeletPresets = [
  { label: "4 corners", qty: 4 },
  { label: "Top corners only", qty: 2 },
  { label: "Centre top + bottom", qty: 2 },
  { label: "2 top + 2 bottom for pole fixing", qty: 4 },
  { label: "Custom quantity", qty: 0 }
];

const inputStyle = { minHeight: 48, borderRadius: 16, border: "1px solid #cfd9e8", padding: "0 14px", width: "100%", boxSizing: "border-box" as const, background: "#fff", color: "#0f172a", fontWeight: 700 };
const textareaStyle = { minHeight: 92, borderRadius: 16, border: "1px solid #cfd9e8", padding: "12px 14px", width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit", background: "#fff" };
const primaryButton = { minHeight: 46, borderRadius: 16, border: "none", background: "#155eef", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 18px" };
const ghostButton = { minHeight: 42, borderRadius: 14, border: "1px solid #d0d7e2", background: "#fff", color: "#1e293b", fontWeight: 900, cursor: "pointer", padding: "0 14px" };

function numberValue(value: string | number | null | undefined, fallback = 0): number {
  const text = String(value ?? "").replace(/,/g, "").replace(/\$/g, "").replace(/mm/gi, "").replace(/lm/gi, "").replace(/sqm/gi, "").trim();
  if (!text) return fallback;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : fallback;
}

function money(value: number): string {
  return `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
}

function usage(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";
  if (value < 0.01) return value.toFixed(4);
  if (value < 1) return value.toFixed(3);
  return value.toFixed(2);
}

function minutesLabel(value: string | number | null | undefined): string {
  const minutes = numberValue(value, 0);
  if (minutes <= 0) return "";
  const roundedMinutes = Math.round(minutes * 100) / 100;
  if (roundedMinutes < 1) return `${Math.round(roundedMinutes * 60)} sec`;
  return `${roundedMinutes}min`;
}

function labourBasisValue(value: unknown, fallback: LabourBasis = "line_total"): LabourBasis {
  return value === "per_item" || value === "line_total" ? value : fallback;
}

function labourBasisRecord(value: Record<string, string>, fallback: LabourBasis = "line_total"): Record<string, LabourBasis> {
  return Object.fromEntries(Object.entries(value).map(([key, basis]) => [key, labourBasisValue(basis, fallback)]));
}

function labourMinutesPerUnit(minutes: number, basis: LabourBasis, quantity: number): number {
  if (basis === "per_item") return minutes;
  return minutes / Math.max(1, quantity);
}

function labourChargeNote(minutes: number, basis: LabourBasis, labourRate: number, perItemLabel = "per item"): string {
  return basis === "per_item"
    ? `${minutesLabel(minutes)} ${perItemLabel} · ${money(labourRate)}/hr`
    : `${minutesLabel(minutes)} total for quote line · ${money(labourRate)}/hr`;
}

function multiplierValue(value: string | number | null | undefined, fallback: number): number {
  const amount = numberValue(value, fallback);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function discountPercentValue(value: string | number | null | undefined): number {
  const amount = numberValue(value, 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.min(100, Math.max(0, amount));
}

type MaterialDepartmentGroup = "signage" | "plan-printing" | "poster-printing" | "small-format" | "shared";

function explicitMaterialGroup(material: QuoteMaterial): MaterialDepartmentGroup | null {
  switch (String(material.materialGroup ?? "").trim().toLowerCase().replace(/_/g, "-")) {
    case "signage":
      return "signage";
    case "plan-printing":
      return "plan-printing";
    case "poster-printing":
      return "poster-printing";
    case "small-format":
      return "small-format";
    case "shared":
    case "general":
    case "installation":
      return "shared";
    default:
      return null;
  }
}

function materialText(material: QuoteMaterial): string {
  return `${material.name} ${material.customerFacingName ?? ""} ${material.materialType ?? ""} ${material.materialGroup ?? ""} ${material.gsm ?? ""} ${material.notes ?? ""}`.toLowerCase();
}

function isSignageStock(material: QuoteMaterial): boolean {
  const group = explicitMaterialGroup(material);
  return group === null || group === "signage";
}

function isSheetMaterial(material: QuoteMaterial): boolean {
  const type = String(material.materialType ?? "").toLowerCase();
  const text = materialText(material);
  return type.includes("sheet") || type.includes("paper") || type.includes("card") || text.includes("acm") || text.includes("acrylic") || text.includes("corflute") || text.includes("pvc") || text.includes("foamboard");
}

function isSmallFormatStock(material: QuoteMaterial): boolean {
  const group = explicitMaterialGroup(material);
  if (group) return group === "small-format";

  const type = String(material.materialType ?? "").toLowerCase();
  const text = materialText(material);
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const signageWords = ["acm", "aluminium composite", "aluminum composite", "acrylic", "perspex", "pmma", "corflute", "correx", "pvc", "foamboard", "foam board", "banner", "sav", "vinyl", "laminate"];
  if (signageWords.some((word) => text.includes(word))) return false;
  return type.includes("paper") || type.includes("card") || type.includes("small") || text.includes("paper") || text.includes("card") || text.includes("gsm") || text.includes("ncr") || text.includes("carbon") || text.includes("bond") || purchaseUom.includes("ream");
}

function isPlanPrintingStock(material: QuoteMaterial): boolean {
  const group = explicitMaterialGroup(material);
  if (group) return group === "plan-printing";

  const type = String(material.materialType ?? "").toLowerCase();
  const text = materialText(material);
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const planWords = ["plan", "plans", "drawing", "drawings", "cad", "bond", "plain paper", "copy paper", "engineering", "architectural"];
  if (planWords.some((word) => text.includes(word) || type.includes(word))) return true;
  return isSmallFormatStock(material) && (purchaseUom.includes("sheet") || purchaseUom.includes("ream") || text.includes("paper") || text.includes("gsm"));
}

function isPosterPrintingStock(material: QuoteMaterial): boolean {
  const group = explicitMaterialGroup(material);
  if (group) return group === "poster-printing";

  const type = String(material.materialType ?? "").toLowerCase();
  const text = materialText(material);
  const posterWords = ["poster", "photo", "satin", "gloss", "matte", "matt", "presentation", "display", "synthetic paper", "polypropylene", "pp paper"];
  if (posterWords.some((word) => text.includes(word) || type.includes(word))) return true;
  return isPrintRollMaterial(material) || isSmallFormatStock(material);
}

function isRollMaterial(material: QuoteMaterial): boolean {
  const type = String(material.materialType ?? "").toLowerCase();
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const stockUom = String(material.stockUom ?? "").toLowerCase();
  const text = materialText(material);
  return numberValue(material.rollWidthMm, 0) > 0 || type.includes("roll") || purchaseUom.includes("roll") || stockUom.includes("roll") || text.includes("vinyl") || text.includes("sav") || text.includes("laminate") || text.includes("banner") || text.includes("cello");
}

function isLaminateMaterial(material: QuoteMaterial): boolean {
  const type = String(material.materialType ?? "").toLowerCase();
  const text = materialText(material);
  return type.includes("laminate") || type.includes("cello") || text.includes("laminate") || text.includes("anti graffiti") || text.includes("anti-graffiti") || text.includes("cello");
}

function isPrintRollMaterial(material: QuoteMaterial): boolean {
  return isRollMaterial(material) && !isLaminateMaterial(material);
}

function materialMatchesBase(material: QuoteMaterial, baseType: BaseType): boolean {
  const text = materialText(material);
  if (baseType === "acrylic") return text.includes("acrylic") || text.includes("perspex") || text.includes("pmma");
  if (baseType === "acm") return text.includes("acm") || text.includes("aluminium composite") || text.includes("aluminum composite");
  if (baseType === "corflute") return text.includes("corflute") || text.includes("correx") || text.includes("corrugated");
  if (baseType === "pvc") return text.includes("pvc") || text.includes("foamboard") || text.includes("foam board") || text.includes("foam");
  if (baseType === "banner") return text.includes("banner") || (isRollMaterial(material) && !isLaminateMaterial(material));
  return isSheetMaterial(material);
}

function thicknessFor(material: QuoteMaterial): string {
  const gsm = String(material.gsm ?? "").trim();
  const text = `${material.name} ${gsm}`;
  const mm = text.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (mm) return `${mm[1]}mm`;
  const gsmMatch = text.match(/(\d+(?:\.\d+)?)\s*gsm/i);
  if (gsmMatch) return `${gsmMatch[1]}gsm`;
  return gsm || "Standard";
}

function colourFor(material: QuoteMaterial): string {
  const text = materialText(material);
  if (text.includes("clear")) return "Clear";
  if (text.includes("opal")) return "Opal";
  if (text.includes("white")) return "White";
  if (text.includes("black")) return "Black";
  if (text.includes("red")) return "Red";
  if (text.includes("blue")) return "Blue";
  if (text.includes("green")) return "Green";
  if (text.includes("yellow")) return "Yellow";
  if (text.includes("pink")) return "Pink";
  return "Standard";
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function materialDimensionText(material: QuoteMaterial): string {
  return [material.name, material.sku, material.gsm, material.notes, material.materialType].filter(Boolean).join(" ");
}

function parsedDimensionPairs(material: QuoteMaterial): Array<{ width: number; length: number; source: string }> {
  const pairs: Array<{ width: number; length: number; source: string }> = [];
  const fieldWidth = numberValue(material.widthMm, 0);
  const fieldLength = numberValue(material.lengthMm, 0);
  if (fieldWidth > 0 && fieldLength > 0) {
    pairs.push({ width: fieldWidth, length: fieldLength, source: "fields" });
  }

  const text = materialDimensionText(material);
  const dimensionPattern = /(\d{2,5}(?:\.\d+)?)\s*(?:mm)?\s*[x×]\s*(\d{2,5}(?:\.\d+)?)\s*(?:mm)?/gi;
  let match: RegExpExecArray | null;
  while ((match = dimensionPattern.exec(text)) !== null) {
    const width = numberValue(match[1], 0);
    const length = numberValue(match[2], 0);
    if (width > 0 && length > 0) pairs.push({ width, length, source: "name" });
  }

  return pairs;
}

function bestSheetDimensions(material: QuoteMaterial): { width: number; length: number; source: string } | null {
  const pairs = parsedDimensionPairs(material).filter((pair) => pair.width > 0 && pair.length > 0);
  if (pairs.length === 0) return null;

  // Prefer the largest plausible parent sheet. This protects existing materials where
  // one dimension was accidentally saved as 1220 × 1220 even though the name says
  // 2440 × 1220mm.
  return pairs.sort((a, b) => (b.width * b.length) - (a.width * a.length))[0] ?? null;
}

function sheetAreaSqm(material: QuoteMaterial): number {
  const dimensions = bestSheetDimensions(material);
  if (!dimensions) return 0;
  return (dimensions.width / 1000) * (dimensions.length / 1000);
}

function panelizedSheets(parentWidth: number, parentHeight: number, pieceWidth: number, pieceHeight: number): { sheets: number; across: number; rows: number; rotated: boolean } | null {
  if (parentWidth <= 0 || parentHeight <= 0 || pieceWidth <= 0 || pieceHeight <= 0) return null;

  const normal = {
    sheets: Math.ceil(pieceWidth / parentWidth) * Math.ceil(pieceHeight / parentHeight),
    across: Math.ceil(pieceWidth / parentWidth),
    rows: Math.ceil(pieceHeight / parentHeight),
    rotated: false
  };
  const rotated = {
    sheets: Math.ceil(pieceWidth / parentHeight) * Math.ceil(pieceHeight / parentWidth),
    across: Math.ceil(pieceWidth / parentHeight),
    rows: Math.ceil(pieceHeight / parentWidth),
    rotated: true
  };

  return [normal, rotated].sort((a, b) => a.sheets - b.sheets)[0] ?? null;
}

type SheetBillingRule = { increment: number; label: string; source: "configured" | "recommended" | "exact" };

function recommendedSheetBillingIncrement(material: QuoteMaterial): number {
  const description = [material.name, material.sku, material.notes].filter(Boolean).join(" ").toLowerCase();
  if (/\b(acm|aluminium|aluminum|acrylic|perspex|composite)\b/.test(description)) return 0.25;
  if (/\b(pvc|corflute|coreflute)\b/.test(description)) return 0.5;
  return 0;
}

function sheetBillingRule(material: QuoteMaterial): SheetBillingRule {
  const raw = String(material.minimumBillableSheetFraction ?? "").trim();
  if (raw !== "") {
    const configured = Math.max(0, numberValue(raw, 0));
    if (configured <= 0) return { increment: 0, label: "exact calculated usage", source: "exact" };
    if (Math.abs(configured - 0.25) < 0.0001) return { increment: 0.25, label: "¼-sheet increment", source: "configured" };
    if (Math.abs(configured - 0.5) < 0.0001) return { increment: 0.5, label: "½-sheet increment", source: "configured" };
    if (Math.abs(configured - 1) < 0.0001) return { increment: 1, label: "full-sheet increment", source: "configured" };
    return { increment: configured, label: `${usage(configured)}-sheet increment`, source: "configured" };
  }

  const recommended = recommendedSheetBillingIncrement(material);
  if (Math.abs(recommended - 0.25) < 0.0001) return { increment: 0.25, label: "recommended ¼-sheet increment", source: "recommended" };
  if (Math.abs(recommended - 0.5) < 0.0001) return { increment: 0.5, label: "recommended ½-sheet increment", source: "recommended" };
  return { increment: 0, label: "recommended exact usage", source: "recommended" };
}

function roundSheetUsage(totalSheets: number, increment: number): number {
  if (!Number.isFinite(totalSheets) || totalSheets <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return totalSheets;
  return Math.max(totalSheets, Math.ceil((totalSheets - 0.0000001) / increment) * increment);
}

function sheetUsageForQuoteLine(
  material: QuoteMaterial,
  pieceWidthMm: number,
  pieceHeightMm: number,
  quantity: number
): { amount: number; calculatedTotal: number; billableTotal: number; physicalSheets: number; note?: string } {
  const dimensions = bestSheetDimensions(material);
  const safeQuantity = Math.max(0, quantity);
  if (!dimensions || pieceWidthMm <= 0 || pieceHeightMm <= 0 || safeQuantity <= 0) {
    return { amount: 0, calculatedTotal: 0, billableTotal: 0, physicalSheets: 0, note: "sheet size missing" };
  }

  const parentArea = (dimensions.width / 1000) * (dimensions.length / 1000);
  const perSheet = piecesPerSheet(dimensions.width, dimensions.length, pieceWidthMm, pieceHeightMm);
  const billing = sheetBillingRule(material);

  if (perSheet > 0) {
    const calculatedTotal = safeQuantity / perSheet;
    const billableTotal = roundSheetUsage(calculatedTotal, billing.increment);
    const physicalSheets = Math.max(1, Math.ceil(calculatedTotal - 0.0000001));
    return {
      amount: billableTotal / safeQuantity,
      calculatedTotal,
      billableTotal,
      physicalSheets,
      note: [
        `${perSheet} up per parent sheet`,
        `calculated ${usage(calculatedTotal)} sheet${Math.abs(calculatedTotal - 1) < 0.0001 ? "" : "s"}`,
        `${physicalSheets} physical parent sheet${physicalSheets === 1 ? "" : "s"} opened`,
        billing.label,
        `${usage(parentArea)}sqm parent sheet`
      ].join(" · ")
    };
  }

  const panelized = panelizedSheets(dimensions.width, dimensions.length, pieceWidthMm, pieceHeightMm);
  if (panelized && panelized.sheets > 0) {
    const calculatedTotal = panelized.sheets * safeQuantity;
    const billableTotal = roundSheetUsage(calculatedTotal, billing.increment);
    const physicalSheets = Math.ceil(calculatedTotal - 0.0000001);
    return {
      amount: billableTotal / safeQuantity,
      calculatedTotal,
      billableTotal,
      physicalSheets,
      note: [
        `${physicalSheets} physical parent sheet${physicalSheets === 1 ? "" : "s"} required`,
        `panelled ${panelized.across} across × ${panelized.rows} high`,
        panelized.rotated ? "rotated sheet orientation" : null,
        billing.label,
        `${usage(parentArea)}sqm parent sheet`
      ].filter(Boolean).join(" · ")
    };
  }

  return { amount: 0, calculatedTotal: 0, billableTotal: 0, physicalSheets: 0, note: "sheet size missing" };
}

function sheetUnitRate(material: QuoteMaterial): { rate: number; note?: string } {
  const purchaseCost = numberValue(material.purchaseCost, 0);
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const stockUom = String(material.stockUom ?? "").toLowerCase();
  const stockQty = numberValue(material.stockQuantity, 0);
  if ((purchaseUom.includes("ream") || purchaseUom.includes("pack") || purchaseUom.includes("box")) && stockQty > 0 && (stockUom.includes("sheet") || stockUom.includes("each"))) {
    return { rate: purchaseCost / stockQty, note: `${usage(stockQty)} sheets per ${purchaseUom}` };
  }
  return { rate: purchaseCost, note: purchaseUom && !purchaseUom.includes("sheet") ? `check ${purchaseUom} quantity` : undefined };
}

function rollRate(material: QuoteMaterial): { rate: number; note?: string } {
  const purchaseCost = numberValue(material.purchaseCost, 0);
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const stockUom = String(material.stockUom ?? "").toLowerCase();
  const stockQty = numberValue(material.stockQuantity, 0);
  if (["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(purchaseUom)) return { rate: purchaseCost };
  if (purchaseUom.includes("roll") && stockQty > 0) return { rate: purchaseCost / stockQty, note: `${usage(stockQty)}lm saved roll length` };
  if (stockQty > 0 && ["lm", "m", "metre", "meter"].includes(stockUom)) return { rate: purchaseCost / stockQty, note: `${usage(stockQty)}lm stock length` };
  return { rate: purchaseCost, note: "check roll length" };
}

function eachRate(material: QuoteMaterial): { rate: number; note?: string } {
  const purchaseCost = numberValue(material.purchaseCost, 0);
  const stockQty = numberValue(material.stockQuantity, 0);
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  if ((purchaseUom.includes("box") || purchaseUom.includes("pack") || purchaseUom.includes("bag")) && stockQty > 0) {
    return { rate: purchaseCost / stockQty, note: `${usage(stockQty)} per ${purchaseUom}` };
  }
  return { rate: purchaseCost };
}

type RollBillingRule = { increment: number; label: string };

function rollBillingRule(material: QuoteMaterial): RollBillingRule {
  const raw = String(material.rollBillingIncrementMetres ?? "").trim();
  if (raw !== "") {
    const configured = Math.max(0, numberValue(raw, 0));
    if (configured <= 0) return { increment: 0, label: "exact calculated roll usage" };
    return { increment: configured, label: `${usage(configured)}m billing increment` };
  }
  return { increment: 0.5, label: "recommended 0.5m billing increment" };
}

function roundRollUsage(totalMetres: number, increment: number): number {
  if (!Number.isFinite(totalMetres) || totalMetres <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return totalMetres;
  return Math.max(totalMetres, Math.ceil((totalMetres - 0.0000001) / increment) * increment);
}

type ForcedDropLayout = {
  direction: Exclude<DropDirection, "auto">;
  drops: number;
  panelAcrossMm: number;
  lengthMm: number;
  overlapMm: number;
  rollWidthMm: number;
  totalLmPerFace: number;
  printedAreaSqmPerFace: number;
  note: string;
};

function forcedDropLayout(widthMm: number, heightMm: number, material: QuoteMaterial | undefined, direction: DropDirection, overlapMm: number): ForcedDropLayout | null {
  if (!material || direction === "auto" || widthMm <= 0 || heightMm <= 0) return null;
  const rollWidthMm = numberValue(material.rollWidthMm, 0);
  if (rollWidthMm <= 0) return null;
  const safeOverlap = Math.max(0, Math.min(overlapMm, Math.max(0, rollWidthMm - 1)));
  const acrossMm = direction === "vertical" ? widthMm : heightMm;
  const lengthMm = direction === "vertical" ? heightMm : widthMm;
  const effectiveCoverageMm = Math.max(1, rollWidthMm - safeOverlap);
  let drops = Math.max(1, Math.ceil(Math.max(0, acrossMm - safeOverlap) / effectiveCoverageMm));
  let panelAcrossMm = (acrossMm + Math.max(0, drops - 1) * safeOverlap) / drops;
  while (panelAcrossMm > rollWidthMm + 0.0001) {
    drops += 1;
    panelAcrossMm = (acrossMm + Math.max(0, drops - 1) * safeOverlap) / drops;
  }
  const totalLmPerFace = (drops * lengthMm) / 1000;
  const printedAreaSqmPerFace = (drops * panelAcrossMm * lengthMm) / 1_000_000;
  const orientationLabel = direction === "vertical" ? "vertical drops" : "horizontal strips";
  return {
    direction,
    drops,
    panelAcrossMm,
    lengthMm,
    overlapMm: safeOverlap,
    rollWidthMm,
    totalLmPerFace,
    printedAreaSqmPerFace,
    note: `${drops} ${orientationLabel} at approx ${dimensionMm(panelAcrossMm)} × ${dimensionMm(lengthMm)}mm${safeOverlap > 0 ? ` with ${dimensionMm(safeOverlap)}mm overlap` : ""}`
  };
}

function panelisedRollMetres(widthMm: number, heightMm: number, rollWidthMm: number): { amount: number; panels: number; panelWidthMm: number; note: string } {
  const panels = Math.max(1, Math.ceil(widthMm / rollWidthMm));
  const panelWidthMm = widthMm / panels;
  const amount = (heightMm / 1000) * panels;
  return {
    amount,
    panels,
    panelWidthMm,
    note: `${panels} panel${panels === 1 ? "" : "s"} at ${dimensionMm(panelWidthMm)} × ${dimensionMm(heightMm)}mm because ${dimensionMm(widthMm)}mm is wider than ${dimensionMm(rollWidthMm)}mm roll`
  };
}

function linearMetres(widthMm: number, heightMm: number, material: QuoteMaterial): { amount: number; note?: string } {
  const rollWidthMm = numberValue(material.rollWidthMm, 0);
  if (widthMm <= 0 || heightMm <= 0) return { amount: 0, note: "size missing" };
  if (rollWidthMm <= 0) return { amount: Math.max(widthMm, heightMm) / 1000, note: "roll width missing" };
  const widthFits = widthMm <= rollWidthMm;
  const heightFits = heightMm <= rollWidthMm;
  if (widthFits && heightFits) {
    return { amount: Math.min(widthMm, heightMm) / 1000, note: widthMm <= heightMm ? "rotated to save roll length" : undefined };
  }
  if (widthFits) return { amount: heightMm / 1000 };
  if (heightFits) return { amount: widthMm / 1000, note: "rotated to fit roll width" };

  const panelised = panelisedRollMetres(widthMm, heightMm, rollWidthMm);
  return { amount: panelised.amount, note: panelised.note };
}

function roundedRollMetresForQuantity(widthMm: number, heightMm: number, material: QuoteMaterial, pieces: number, dropDirection: DropDirection = "auto", dropOverlapMm = 0, referenceDropLayout?: ForcedDropLayout | null): { amount: number; unroundedAmount: number; note?: string; dropLayout?: ForcedDropLayout | null } {
  const rollWidthMm = numberValue(material.rollWidthMm, 0);
  const pieceCount = Math.max(1, Math.ceil(pieces));
  const billing = rollBillingRule(material);
  if (widthMm <= 0 || heightMm <= 0) return { amount: 0, unroundedAmount: 0, note: "size missing", dropLayout: null };

  if (referenceDropLayout) {
    const materialRollWidthMm = numberValue(material.rollWidthMm, 0);
    const stripsPerDrop = materialRollWidthMm > 0 ? Math.max(1, Math.ceil(referenceDropLayout.panelAcrossMm / materialRollWidthMm)) : 1;
    const totalStripsPerFace = referenceDropLayout.drops * stripsPerDrop;
    const unroundedAmount = (totalStripsPerFace * referenceDropLayout.lengthMm / 1000) * pieceCount;
    const amount = roundRollUsage(unroundedAmount, billing.increment);
    return {
      amount,
      unroundedAmount,
      dropLayout: referenceDropLayout,
      note: [
        `follows ${referenceDropLayout.drops} ${referenceDropLayout.direction === "vertical" ? "vertical drop" : "horizontal strip"}${referenceDropLayout.drops === 1 ? "" : "s"} from print layout`,
        stripsPerDrop > 1 ? `${stripsPerDrop} ${material.name} strips required across each printed drop because this roll is narrower` : `one ${material.name} strip per printed drop`,
        `${usage(unroundedAmount)}lm calculated across ${pieceCount} face${pieceCount === 1 ? "" : "s"}`,
        billing.label,
        `charged as ${usage(amount)}lm`
      ].join(" · ")
    };
  }

  const forced = forcedDropLayout(widthMm, heightMm, material, dropDirection, dropOverlapMm);
  if (forced) {
    const unroundedAmount = forced.totalLmPerFace * pieceCount;
    const amount = roundRollUsage(unroundedAmount, billing.increment);
    return {
      amount,
      unroundedAmount,
      dropLayout: forced,
      note: [forced.note, `${usage(unroundedAmount)}lm calculated across ${pieceCount} face${pieceCount === 1 ? "" : "s"}`, billing.label, `charged as ${usage(amount)}lm`].join(" · ")
    };
  }

  if (rollWidthMm <= 0) {
    const single = linearMetres(widthMm, heightMm, material);
    const unroundedAmount = single.amount * pieceCount;
    const amount = roundRollUsage(unroundedAmount, billing.increment);
    return { amount, unroundedAmount, note: ["roll width missing", `${usage(unroundedAmount)}lm calculated`, billing.label, `charged as ${usage(amount)}lm`].join(" · ") };
  }

  // When neither finished dimension fits the roll, keep the entered width as the
  // panelled direction. Example: 2000 × 4000mm on a 1370mm roll becomes
  // 2 panels at 1000 × 4000mm = 8lm before billing increment rounding.
  if (widthMm > rollWidthMm && heightMm > rollWidthMm) {
    const panelised = panelisedRollMetres(widthMm, heightMm, rollWidthMm);
    const totalPanels = panelised.panels * pieceCount;
    const panelsAcross = Math.max(1, Math.floor(rollWidthMm / panelised.panelWidthMm));
    const rows = Math.ceil(totalPanels / panelsAcross);
    const unroundedAmount = (rows * heightMm) / 1000;
    const amount = roundRollUsage(unroundedAmount, billing.increment);
    return {
      amount,
      unroundedAmount,
      note: [
        panelised.note,
        `${totalPanels} panel${totalPanels === 1 ? "" : "s"} nested ${panelsAcross} across × ${rows} row${rows === 1 ? "" : "s"}`,
        `${usage(unroundedAmount)}lm calculated`,
        billing.label,
        `charged as ${usage(amount)}lm`
      ].filter(Boolean).join(" · ")
    };
  }

  const layouts = [
    { pieceAcrossMm: widthMm, lengthMm: heightMm, rotated: false },
    { pieceAcrossMm: heightMm, lengthMm: widthMm, rotated: true }
  ]
    .map((layout) => {
      const across = Math.floor(rollWidthMm / layout.pieceAcrossMm);
      if (across <= 0) return null;
      const rows = Math.ceil(pieceCount / across);
      return {
        across,
        rows,
        rotated: layout.rotated,
        unroundedAmount: (rows * layout.lengthMm) / 1000
      };
    })
    .filter((layout): layout is { across: number; rows: number; rotated: boolean; unroundedAmount: number } => Boolean(layout));

  if (layouts.length === 0) {
    const single = linearMetres(widthMm, heightMm, material);
    const unroundedAmount = single.amount * pieceCount;
    const amount = roundRollUsage(unroundedAmount, billing.increment);
    return { amount, unroundedAmount, note: [single.note, "panelled wider-than-roll print", `${usage(unroundedAmount)}lm calculated`, billing.label, `charged as ${usage(amount)}lm`].filter(Boolean).join(" · ") };
  }

  const best = layouts.sort((a, b) => a.unroundedAmount - b.unroundedAmount)[0];
  const amount = roundRollUsage(best.unroundedAmount, billing.increment);
  return {
    amount,
    unroundedAmount: best.unroundedAmount,
    note: [
      `${pieceCount} face${pieceCount === 1 ? "" : "s"} nested ${best.across} across × ${best.rows} row${best.rows === 1 ? "" : "s"}`,
      best.rotated ? "rotated to save roll length" : null,
      `${usage(best.unroundedAmount)}lm calculated`,
      billing.label,
      `charged as ${usage(amount)}lm`
    ].filter(Boolean).join(" · ")
  };
}


function roundedInkSquareMetresForQuoteLine(
  areaPerItemSqm: number,
  sideMultiplier: number,
  quantity: number,
  rollUsage?: { amount: number; unroundedAmount: number } | null,
  inkBillingIncrementSqm = 0.5
): { amount: number; calculatedTotal: number; mediaAdjustedTotal: number; billableTotal: number; note?: string } {
  const safeQuantity = Math.max(1, quantity);
  const calculatedTotal = Math.max(0, areaPerItemSqm) * Math.max(1, sideMultiplier) * safeQuantity;
  const rollRoundingMultiplier = rollUsage && rollUsage.unroundedAmount > 0
    ? Math.max(1, rollUsage.amount / rollUsage.unroundedAmount)
    : 1;
  const mediaAdjustedTotal = calculatedTotal * rollRoundingMultiplier;
  const safeIncrement = Math.max(0, Number.isFinite(inkBillingIncrementSqm) ? inkBillingIncrementSqm : 0.5);
  const billableTotal = mediaAdjustedTotal > 0
    ? (safeIncrement > 0 ? Math.ceil((mediaAdjustedTotal - 0.0000001) / safeIncrement) * safeIncrement : mediaAdjustedTotal)
    : 0;

  return {
    amount: billableTotal / safeQuantity,
    calculatedTotal,
    mediaAdjustedTotal,
    billableTotal,
    note: calculatedTotal > 0
      ? [
          `${usage(calculatedTotal)}sqm artwork area`,
          rollRoundingMultiplier > 1.0000001 ? `${usage(mediaAdjustedTotal)}sqm after media billing round-up` : null,
          safeIncrement > 0 ? `${usage(safeIncrement)}sqm ink billing increment` : "exact ink area",
          `charged as ${usage(billableTotal)}sqm`
        ].filter(Boolean).join(" · ")
      : undefined
  };
}

function piecesPerSheet(parentWidth: number, parentHeight: number, pieceWidth: number, pieceHeight: number): number {
  if (parentWidth <= 0 || parentHeight <= 0 || pieceWidth <= 0 || pieceHeight <= 0) return 0;
  const normal = Math.floor(parentWidth / pieceWidth) * Math.floor(parentHeight / pieceHeight);
  const rotated = Math.floor(parentWidth / pieceHeight) * Math.floor(parentHeight / pieceWidth);
  return Math.max(normal, rotated, 0);
}

function dimensionMm(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function materialCardMeta(material: QuoteMaterial): string {
  const dimensions = bestSheetDimensions(material);
  return [
    material.supplierName,
    material.sku,
    material.gsm,
    dimensions ? `${dimensionMm(dimensions.width)} × ${dimensionMm(dimensions.length)}mm` : null,
    material.rollWidthMm ? `${material.rollWidthMm}mm roll` : null
  ].filter(Boolean).join(" · ");
}

function snapshotString(snapshot: QuickQuoteSnapshot | null, key: keyof QuickQuoteSnapshot, fallback = ""): string {
  const value = snapshot?.[key];
  return typeof value === "string" ? value : fallback;
}

function snapshotStringArray(snapshot: QuickQuoteSnapshot | null, key: keyof QuickQuoteSnapshot): string[] {
  const value = snapshot?.[key];
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function snapshotStringRecord(snapshot: QuickQuoteSnapshot | null, key: keyof QuickQuoteSnapshot): Record<string, string> {
  const value = snapshot?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, String(entryValue ?? "")]));
}

function snapshotMaterialForSave(material: QuoteMaterial | undefined): SnapshotMaterial | null {
  if (!material) return null;
  return {
    id: material.id,
    name: material.name,
    customerFacingName: material.customerFacingName ?? null,
    materialType: material.materialType ?? null,
    materialGroup: material.materialGroup ?? null,
    minimumBillableSheetFraction: material.minimumBillableSheetFraction ?? null,
    rollBillingIncrementMetres: material.rollBillingIncrementMetres ?? null,
    reversePrintable: material.reversePrintable === true,
    usedForBacking: material.usedForBacking === true,
    supplierName: material.supplierName ?? null,
    sku: material.sku ?? null,
    stockUom: material.stockUom ?? null,
    purchaseUom: material.purchaseUom ?? null,
    stockQuantity: material.stockQuantity ?? null,
    purchaseCost: material.purchaseCost ?? null,
    widthMm: material.widthMm ?? null,
    lengthMm: material.lengthMm ?? null,
    rollWidthMm: material.rollWidthMm ?? null,
    gsm: material.gsm ?? null,
    notes: material.notes ?? null
  };
}

function selectedKeys<T extends { key: string; label: string }>(items: T[], keys: string[]): string {
  return items.filter((item) => keys.includes(item.key)).map((item) => item.label).join(", ");
}

function ncrCopyCount(value: string): number {
  if (value === "duplicate") return 2;
  if (value === "triplicate") return 3;
  if (value === "quadruplicate") return 4;
  return 0;
}

function pageColourSummary(count: number, colours: string[]): string {
  return colours.slice(0, Math.max(0, count)).map((colour, index) => `Page ${index + 1}: ${colour}`).join(", ");
}

function normaliseSizePresets(presets: QuoteSizePreset[] | null | undefined, fallback: QuoteSizePreset[]): QuoteSizePreset[] {
  const cleaned = (presets ?? [])
    .map((preset) => ({
      label: String(preset.label ?? "").trim(),
      width: String(preset.width ?? "").trim(),
      height: String(preset.height ?? "").trim()
    }))
    .filter((preset) => preset.label && numberValue(preset.width, 0) > 0 && numberValue(preset.height, 0) > 0);

  return cleaned.length > 0 ? cleaned : fallback;
}

function isPrintDepartmentFlow(value: FlowType): boolean {
  return value === "plan_printing" || value === "poster_printing";
}

function flowTypeLabel(value: FlowType): string {
  if (value === "signage") return "Large format / signage";
  if (value === "plan_printing") return "Plan printing";
  if (value === "poster_printing") return "Poster printing";
  if (value === "small_format") return "Small format / print";
  if (value === "component") return "Custom component";
  if (value === "service") return "Pickup / delivery / install";
  return "Choose later";
}

function flowDepartmentProductName(value: FlowType): string {
  if (value === "plan_printing") return "Plan Printing";
  if (value === "poster_printing") return "Poster Printing";
  return flowTypeLabel(value);
}

function customerMaterialName(material: QuoteMaterial | null | undefined): string {
  return String(material?.customerFacingName ?? "").trim() || String(material?.name ?? "").trim();
}

function internalMaterialName(material: QuoteMaterial | null | undefined): string {
  const name = String(material?.name ?? "").trim();
  const sku = String(material?.sku ?? "").trim();
  return name && sku && !name.toLowerCase().includes(sku.toLowerCase()) ? `${name} · ${sku}` : name || sku;
}

type RollChoiceGroup = {
  key: string;
  label: string;
  materials: QuoteMaterial[];
  representative: QuoteMaterial;
};

function rollChoiceGroups(materials: QuoteMaterial[]): RollChoiceGroup[] {
  const groups = new Map<string, QuoteMaterial[]>();
  for (const material of materials) {
    const label = customerMaterialName(material) || material.name || material.id;
    const key = label.trim().toLowerCase();
    const current = groups.get(key) ?? [];
    current.push(material);
    groups.set(key, current);
  }
  return Array.from(groups.entries())
    .map(([key, groupedMaterials]) => ({
      key,
      label: customerMaterialName(groupedMaterials[0]) || groupedMaterials[0].name,
      materials: groupedMaterials,
      representative: groupedMaterials[0]
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function bestRollMaterialForGroup(materials: QuoteMaterial[], widthMm: number, heightMm: number, pieces: number): QuoteMaterial | undefined {
  if (!materials.length) return undefined;
  return [...materials].sort((a, b) => {
    const aUse = roundedRollMetresForQuantity(widthMm, heightMm, a, pieces);
    const bUse = roundedRollMetresForQuantity(widthMm, heightMm, b, pieces);
    const aCost = aUse.amount * rollRate(a).rate;
    const bCost = bUse.amount * rollRate(b).rate;
    if (Math.abs(aCost - bCost) > 0.000001) return aCost - bCost;
    if (Math.abs(aUse.amount - bUse.amount) > 0.000001) return aUse.amount - bUse.amount;
    return numberValue(a.rollWidthMm, 0) - numberValue(b.rollWidthMm, 0);
  })[0];
}

export function QuoteMaterialFlowBuilder({ quoteId, materials, pricingSettings, editingLine = null }: QuoteMaterialFlowBuilderProps) {
  const initialSnapshot = useMemo(() => readQuickQuoteSnapshot(editingLine?.configurationSnapshot), [editingLine?.configurationSnapshot]);
  const materialPool = useMemo(() => {
    const restoredMaterials = materialsFromSnapshot(initialSnapshot);
    const combined = [...materials, ...restoredMaterials];
    const seen = new Set<string>();
    return combined.filter((material) => {
      if (!material.id || seen.has(material.id)) return false;
      seen.add(material.id);
      return true;
    });
  }, [materials, initialSnapshot]);

  const initialComponentParts = Array.isArray(initialSnapshot?.componentParts) && initialSnapshot.componentParts.length
    ? initialSnapshot.componentParts.map((part, index) => ({
        id: String(part.id ?? `part-restored-${index}`),
        materialId: String(part.materialId ?? ""),
        name: String(part.name ?? ""),
        qty: String(part.qty ?? ""),
        unit: String(part.unit ?? "each"),
        unitCost: String(part.unitCost ?? ""),
        note: String(part.note ?? "")
      }))
    : [createBlankComponentPart()];

  const activeStep: QuickQuoteStep = initialSnapshot?.activeStep ?? (initialSnapshot?.flowType === "service" ? "service_type" : initialSnapshot?.flowType === "small_format" ? "small_type" : initialSnapshot?.flowType === "plan_printing" || initialSnapshot?.flowType === "poster_printing" ? "small_stock" : "base");
  const [flowType, setFlowType] = useState<FlowType>(initialSnapshot?.flowType || "signage");
  const isPrintDepartment = isPrintDepartmentFlow(flowType);

  const [baseType, setBaseType] = useState<BaseType | "">(snapshotString(initialSnapshot, "baseType") as BaseType | "");
  const [thickness, setThickness] = useState(snapshotString(initialSnapshot, "thickness"));
  const [colour, setColour] = useState(snapshotString(initialSnapshot, "colour"));
  const [widthMm, setWidthMm] = useState(snapshotString(initialSnapshot, "widthMm"));
  const [heightMm, setHeightMm] = useState(snapshotString(initialSnapshot, "heightMm"));
  const [bleedSpacingMm, setBleedSpacingMm] = useState(snapshotString(initialSnapshot, "bleedSpacingMm"));
  const [dropDirection, setDropDirection] = useState<DropDirection>((snapshotString(initialSnapshot, "dropDirection") as DropDirection) || "auto");
  const [dropOverlapMm, setDropOverlapMm] = useState(snapshotString(initialSnapshot, "dropOverlapMm", "0"));
  const [artworkChoice, setArtworkChoice] = useState<ArtworkChoice>(snapshotString(initialSnapshot, "artworkChoice") as ArtworkChoice);
  const [artworkMinutes, setArtworkMinutes] = useState(snapshotString(initialSnapshot, "artworkMinutes"));
  const [printMethod, setPrintMethod] = useState<PrintMethod>(snapshotString(initialSnapshot, "printMethod") as PrintMethod);
  const [printSetupMinutes, setPrintSetupMinutes] = useState(snapshotString(initialSnapshot, "printSetupMinutes"));
  const [printSetupLabourBasis, setPrintSetupLabourBasis] = useState<LabourBasis>(labourBasisValue(initialSnapshot?.printSetupLabourBasis, "line_total"));
  const [mediaId, setMediaId] = useState(snapshotString(initialSnapshot, "mediaId"));
  const [ink, setInk] = useState<InkChoice>(snapshotString(initialSnapshot, "ink") as InkChoice);
  const [sides, setSides] = useState<SidesChoice>(snapshotString(initialSnapshot, "sides") as SidesChoice);
  const [printDirection, setPrintDirection] = useState<PrintDirection>(snapshotString(initialSnapshot, "printDirection") as PrintDirection);
  const [backingId, setBackingId] = useState(snapshotString(initialSnapshot, "backingId"));
  const [laminateId, setLaminateId] = useState(snapshotString(initialSnapshot, "laminateId"));
  const [laminateMinutes, setLaminateMinutes] = useState(snapshotString(initialSnapshot, "laminateMinutes"));
  const [laminateLabourBasis, setLaminateLabourBasis] = useState<LabourBasis>(labourBasisValue(initialSnapshot?.laminateLabourBasis, "line_total"));
  const [finishings, setFinishings] = useState<string[]>(snapshotStringArray(initialSnapshot, "finishings"));
  const [finishingMinutes, setFinishingMinutes] = useState<Record<string, string>>(snapshotStringRecord(initialSnapshot, "finishingMinutes"));
  const [finishingLabourBasis, setFinishingLabourBasis] = useState<Record<string, LabourBasis>>(labourBasisRecord(snapshotStringRecord(initialSnapshot, "finishingLabourBasis"), "line_total"));
  const [eyeletPresetLabel, setEyeletPresetLabel] = useState(snapshotString(initialSnapshot, "eyeletPresetLabel", eyeletPresets[0]?.label ?? ""));
  const [customEyeletQty, setCustomEyeletQty] = useState(snapshotString(initialSnapshot, "customEyeletQty"));

  const [smallType, setSmallType] = useState<SmallFormatType | "">(snapshotString(initialSnapshot, "smallType") as SmallFormatType | "");
  const [smallStockId, setSmallStockId] = useState(snapshotString(initialSnapshot, "smallStockId"));
  const [customSmallStockEnabled, setCustomSmallStockEnabled] = useState(Boolean(initialSnapshot?.customSmallStockEnabled));
  const [customSmallStockName, setCustomSmallStockName] = useState(snapshotString(initialSnapshot, "customSmallStockName"));
  const [customSmallStockSupplier, setCustomSmallStockSupplier] = useState(snapshotString(initialSnapshot, "customSmallStockSupplier"));
  const [customSmallStockCost, setCustomSmallStockCost] = useState(snapshotString(initialSnapshot, "customSmallStockCost"));
  const [customSmallStockWidthMm, setCustomSmallStockWidthMm] = useState(snapshotString(initialSnapshot, "customSmallStockWidthMm"));
  const [customSmallStockLengthMm, setCustomSmallStockLengthMm] = useState(snapshotString(initialSnapshot, "customSmallStockLengthMm"));
  const [customSmallStockGsm, setCustomSmallStockGsm] = useState(snapshotString(initialSnapshot, "customSmallStockGsm"));
  const [ncrCopies, setNcrCopies] = useState(snapshotString(initialSnapshot, "ncrCopies"));
  const [ncrSetsPerBook, setNcrSetsPerBook] = useState(snapshotString(initialSnapshot, "ncrSetsPerBook"));
  const [ncrPageColours, setNcrPageColours] = useState(initialSnapshot?.ncrPageColours?.length ? initialSnapshot.ncrPageColours : ["White", "Yellow", "Pink", "Blue"]);
  const [ncrCoverColour, setNcrCoverColour] = useState(snapshotString(initialSnapshot, "ncrCoverColour"));
  const [ncrTapeColour, setNcrTapeColour] = useState(snapshotString(initialSnapshot, "ncrTapeColour"));
  const [smallPrintColour, setSmallPrintColour] = useState<SmallPrintColour>(snapshotString(initialSnapshot, "smallPrintColour") as SmallPrintColour);
  const [smallCoatingId, setSmallCoatingId] = useState(snapshotString(initialSnapshot, "smallCoatingId"));
  const [smallFinishings, setSmallFinishings] = useState<string[]>(snapshotStringArray(initialSnapshot, "smallFinishings"));
  const [smallFinishingMinutes, setSmallFinishingMinutes] = useState<Record<string, string>>(snapshotStringRecord(initialSnapshot, "smallFinishingMinutes"));
  const [smallFinishingLabourBasis, setSmallFinishingLabourBasis] = useState<Record<string, LabourBasis>>(labourBasisRecord(snapshotStringRecord(initialSnapshot, "smallFinishingLabourBasis"), "line_total"));
  const legacySmallFinishingPerItem = Boolean(
    initialSnapshot?.flowType === "small_format"
      && Object.keys(initialSnapshot.smallFinishingMinutes ?? {}).length > 0
      && Object.keys(initialSnapshot.smallFinishingLabourBasis ?? {}).length === 0
  );
  const smallFinishingDefaultBasis: LabourBasis = legacySmallFinishingPerItem ? "per_item" : "line_total";

  const [serviceType, setServiceType] = useState<ServiceType>(snapshotString(initialSnapshot, "serviceType") as ServiceType);
  const [deliveryCharge, setDeliveryCharge] = useState(snapshotString(initialSnapshot, "deliveryCharge"));
  const [installCrewSize, setInstallCrewSize] = useState(snapshotString(initialSnapshot, "installCrewSize", "1"));
  const [installMinutes, setInstallMinutes] = useState(snapshotString(initialSnapshot, "installMinutes"));
  const [installLabourBasis, setInstallLabourBasis] = useState<LabourBasis>(labourBasisValue(initialSnapshot?.installLabourBasis, "line_total"));
  const [travelCharge, setTravelCharge] = useState(snapshotString(initialSnapshot, "travelCharge"));
  const [accessEquipmentRequired, setAccessEquipmentRequired] = useState(Boolean(initialSnapshot?.accessEquipmentRequired));
  const [accessEquipmentType, setAccessEquipmentType] = useState(snapshotString(initialSnapshot, "accessEquipmentType"));
  const [accessEquipmentDailyCharge, setAccessEquipmentDailyCharge] = useState(snapshotString(initialSnapshot, "accessEquipmentDailyCharge"));
  const [accessEquipmentDays, setAccessEquipmentDays] = useState(snapshotString(initialSnapshot, "accessEquipmentDays", "1"));
  const [serviceFixings, setServiceFixings] = useState<string[]>(snapshotStringArray(initialSnapshot, "serviceFixings"));
  const [serviceFixingQty, setServiceFixingQty] = useState<Record<string, string>>(snapshotStringRecord(initialSnapshot, "serviceFixingQty"));
  const [serviceFixingRate, setServiceFixingRate] = useState<Record<string, string>>(snapshotStringRecord(initialSnapshot, "serviceFixingRate"));

  const [componentName, setComponentName] = useState(snapshotString(initialSnapshot, "componentName"));
  const [componentDescription, setComponentDescription] = useState(snapshotString(initialSnapshot, "componentDescription"));
  const [componentParts, setComponentParts] = useState<CustomComponentPart[]>(initialComponentParts);
  const [componentLabourLabel, setComponentLabourLabel] = useState(snapshotString(initialSnapshot, "componentLabourLabel", "Build / assembly labour"));
  const [componentLabourMinutes, setComponentLabourMinutes] = useState(snapshotString(initialSnapshot, "componentLabourMinutes"));

  const [quantity, setQuantity] = useState(editingLine?.quantity ?? snapshotString(initialSnapshot, "quantity", "1"));
  const [unitPriceOverridden, setUnitPriceOverridden] = useState(Boolean(initialSnapshot?.unitPriceOverridden));
  const [manualUnitPrice, setManualUnitPrice] = useState(editingLine?.unitPrice ?? snapshotString(initialSnapshot, "manualUnitPrice", "0.00"));
  const [lineNotes, setLineNotes] = useState(editingLine?.notes ?? snapshotString(initialSnapshot, "notes"));

  const markupMultiplier = multiplierValue(pricingSettings?.markupMultiplier, 1.5);
  const profitMultiplier = multiplierValue(pricingSettings?.profitMultiplier, 1.2);
  const sellMultiplier = markupMultiplier * profitMultiplier;
  const labourRate = numberValue(pricingSettings?.labourRate, defaultLabourRate);
  const inkRatePerSqm = numberValue(pricingSettings?.inkRatePerSqm, defaultInkRatePerSqm);
  const inkBillingIncrementSqm = Math.max(0, numberValue(pricingSettings?.inkBillingIncrementSqm, 0.5));
  const monoRatePerSqm = numberValue(pricingSettings?.monoRatePerSqm, defaultMonoRatePerSqm);
  const signageSizePresets = useMemo(() => normaliseSizePresets(pricingSettings?.signageSizePresets, defaultSignageSizePresets), [pricingSettings?.signageSizePresets]);
  const smallSizePresets = useMemo(() => normaliseSizePresets(pricingSettings?.smallSizePresets, defaultSmallSizePresets), [pricingSettings?.smallSizePresets]);
  const planSizePresets = useMemo(() => defaultPlanSizePresets, []);
  const posterSizePresets = useMemo(() => defaultPosterSizePresets, []);
  const activeSizePresets = flowType === "small_format"
    ? smallSizePresets
    : flowType === "plan_printing"
      ? planSizePresets
      : flowType === "poster_printing"
        ? posterSizePresets
        : signageSizePresets;
  const activeSizePresetValue = activeSizePresets.some((preset) => preset.width === widthMm && preset.height === heightMm)
    ? `${widthMm}x${heightMm}`
    : "";
  const inkChoices = useMemo<Array<{ key: Exclude<InkChoice, "">; label: string; icon: string; description: string }>>(() => [
    { key: "none", label: "No print", icon: "—", description: "Use the selected stock without printing or ink charges." },
    { key: "cmyk", label: "CMYK", icon: "●", description: `${money(inkRatePerSqm)}/m² colour ink charge.` },
    { key: "white", label: "White", icon: "○", description: `${money(inkRatePerSqm)}/m² white ink charge.` },
    { key: "both", label: "CMYK + White", icon: "◐", description: `${money(inkRatePerSqm * 2)}/m² total ink charge.` }
  ], [inkRatePerSqm]);

  const baseMaterials = useMemo(() => {
    if (!baseType) return [];
    return materialPool.filter((material) => isSignageStock(material) && materialMatchesBase(material, baseType));
  }, [materialPool, baseType]);

  const thicknessOptions = useMemo(() => uniq(baseMaterials.map(thicknessFor)), [baseMaterials]);
  const colourOptions = useMemo(() => {
    const materialPool = thickness ? baseMaterials.filter((material) => thicknessFor(material) === thickness) : baseMaterials;
    return uniq(materialPool.map(colourFor));
  }, [baseMaterials, thickness]);

  const isRollStockBase = baseType === "banner";

  const selectedMainMaterial = useMemo(() => {
    if (baseType === "banner") return baseMaterials.find((material) => material.id === mediaId);

    const matchingMaterials = baseMaterials.filter((material) => {
      const thicknessOk = !thickness || thicknessFor(material) === thickness;
      const colourOk = !colour || colourFor(material) === colour;
      return thicknessOk && colourOk;
    });
    return matchingMaterials[0];
  }, [baseMaterials, thickness, colour, baseType, mediaId]);

  const rollMedia = useMemo(() => materialPool.filter((material) => isSignageStock(material) && isPrintRollMaterial(material)), [materialPool]);
  const laminateMaterials = useMemo(() => {
    const departmentGroup: MaterialDepartmentGroup = flowType === "plan_printing"
      ? "plan-printing"
      : flowType === "poster_printing"
        ? "poster-printing"
        : flowType === "small_format"
          ? "small-format"
          : "signage";

    return materialPool.filter((material) => {
      if (!isLaminateMaterial(material)) return false;
      const group = explicitMaterialGroup(material);
      return group === null || group === departmentGroup;
    });
  }, [materialPool, flowType]);
  const smallStocks = useMemo(() => materialPool.filter(isSmallFormatStock), [materialPool]);
  const planPrintingStocks = useMemo(() => {
    const matched = materialPool.filter(isPlanPrintingStock);
    return matched.length > 0 ? matched : smallStocks;
  }, [materialPool, smallStocks]);
  const posterPrintingStocks = useMemo(() => {
    const matched = materialPool.filter(isPosterPrintingStock);
    return matched.length > 0 ? matched : [...rollMedia, ...smallStocks];
  }, [materialPool, rollMedia, smallStocks]);
  const departmentStocks = flowType === "plan_printing" ? planPrintingStocks : flowType === "poster_printing" ? posterPrintingStocks : smallStocks;
  const customSmallStock = useMemo<QuoteMaterial | undefined>(() => {
    if (!customSmallStockEnabled || !customSmallStockName.trim()) return undefined;
    return {
      id: "custom-small-stock",
      name: customSmallStockName.trim(),
      materialType: "Custom small format stock",
      supplierName: customSmallStockSupplier.trim() || "Custom",
      sku: "CUSTOM",
      stockUom: "sheet",
      purchaseUom: "sheet",
      stockQuantity: "",
      purchaseCost: customSmallStockCost,
      widthMm: customSmallStockWidthMm,
      lengthMm: customSmallStockLengthMm,
      gsm: customSmallStockGsm
    };
  }, [customSmallStockEnabled, customSmallStockName, customSmallStockSupplier, customSmallStockCost, customSmallStockWidthMm, customSmallStockLengthMm, customSmallStockGsm]);
  const selectedMedia = rollMedia.find((material) => material.id === mediaId);
  const selectedLaminate = laminateMaterials.find((material) => material.id === laminateId);
  const selectedSmallStock = customSmallStockEnabled ? customSmallStock : departmentStocks.find((material) => material.id === smallStockId);
  const selectedSmallCoating = laminateMaterials.find((material) => material.id === smallCoatingId);
  const eyeletMaterial = materialPool.find((material) => materialText(material).includes("eyelet")) ?? materialPool.find((material) => String(material.materialType ?? "").toLowerCase().includes("fix"));

  const selectedBase = baseTypes.find((item) => item.key === baseType);
  const selectedSmallType = smallFormatTypes.find((item) => item.key === smallType);
  const isDuplicateBook = smallType === "duplicate_books";
  const ncrCopiesCount = ncrCopyCount(ncrCopies);
  const ncrDetailsComplete = !isDuplicateBook || Boolean(ncrCopiesCount > 0 && numberValue(ncrSetsPerBook, 0) > 0 && ncrCoverColour && ncrTapeColour);
  const isClearAcrylic = baseType === "acrylic" && colour.toLowerCase() === "clear";
  const primaryRollMaterial = isRollStockBase ? selectedMainMaterial : selectedMedia;
  const selectedReversePrintableRoll = Boolean(primaryRollMaterial?.reversePrintable);
  const canChooseReversePrint = isClearAcrylic || selectedReversePrintableRoll;
  const primaryRollCustomerName = customerMaterialName(primaryRollMaterial).trim().toLowerCase();
  const backingMaterials = useMemo(() => rollMedia.filter((material) => {
    if (material.usedForBacking !== true && material.id !== backingId) return false;
    if (material.id === primaryRollMaterial?.id) return false;
    const label = customerMaterialName(material).trim().toLowerCase();
    return !primaryRollCustomerName || label !== primaryRollCustomerName;
  }), [rollMedia, primaryRollMaterial?.id, primaryRollCustomerName, backingId]);
  const backingGroups = useMemo(() => rollChoiceGroups(backingMaterials), [backingMaterials]);
  const selectedBackingGroup = backingGroups.find((group) => group.materials.some((material) => material.id === backingId));
  const resolvedPrintMethod: PrintMethod = isRollStockBase ? "roll_stock" : printMethod;
  const needsInkStep = resolvedPrintMethod === "direct_print" || resolvedPrintMethod === "roll_stock";
  const noPrintSelected = needsInkStep && ink === "none";
  const availableInkChoices = resolvedPrintMethod === "roll_stock" ? inkChoices : inkChoices.filter((choice) => choice.key !== "none");
  const printed = resolvedPrintMethod !== "" && resolvedPrintMethod !== "no_print" && !noPrintSelected;
  const backingApplicable = printed && canChooseReversePrint && printDirection === "reverse";
  const needsMediaStep = isRollStockBase || resolvedPrintMethod === "roll_stock" || resolvedPrintMethod === "cut_vinyl";
  const needsAdditionalMediaCost = !isRollStockBase && (resolvedPrintMethod === "roll_stock" || resolvedPrintMethod === "cut_vinyl");
  const width = numberValue(widthMm, 0);
  const height = numberValue(heightMm, 0);
  const bleedSpacingPerSideMm = Math.max(0, numberValue(bleedSpacingMm, 0));
  const usageWidth = width > 0 ? width + bleedSpacingPerSideMm * 2 : width;
  const usageHeight = height > 0 ? height + bleedSpacingPerSideMm * 2 : height;
  const nestingFootprintLabel = bleedSpacingPerSideMm > 0 && usageWidth > 0 && usageHeight > 0
    ? `${dimensionMm(usageWidth)} × ${dimensionMm(usageHeight)}mm calc footprint`
    : "";
  const spacingUsageNote = bleedSpacingPerSideMm > 0
    ? `${dimensionMm(bleedSpacingPerSideMm)}mm bleed / spacing each side · ${nestingFootprintLabel}`
    : "";
  const areaSqm = width > 0 && height > 0 ? (width / 1000) * (height / 1000) : 0;
  const sideMultiplier = printed && sides === "double" ? 2 : 1;
  const effectiveQuantity = flowType === "service" && serviceType === "access_equipment"
    ? accessEquipmentDays
    : quantity;
  const quantityNumber = Math.max(1, numberValue(effectiveQuantity, 1));
  const safeDropOverlapMm = Math.max(0, numberValue(dropOverlapMm, 0));
  const activeRollMaterial = isRollStockBase ? selectedMainMaterial : selectedMedia;
  const activeRollWidthMm = numberValue(activeRollMaterial?.rollWidthMm, 0);
  const effectiveDropDirection: DropDirection = dropDirection === "auto" && activeRollWidthMm > 0 && usageWidth > activeRollWidthMm && usageHeight > activeRollWidthMm
    ? "vertical"
    : dropDirection;
  const dropLayoutPreview = forcedDropLayout(usageWidth, usageHeight, activeRollMaterial, effectiveDropDirection, safeDropOverlapMm);
  const selectedBacking = useMemo(() => selectedBackingGroup
    ? bestRollMaterialForGroup(selectedBackingGroup.materials, usageWidth, usageHeight, quantityNumber)
    : undefined, [selectedBackingGroup, usageWidth, usageHeight, quantityNumber]);
  const backingSelectValue = backingId === "none" ? "none" : selectedBackingGroup?.representative.id ?? backingId;
  const pricedComponentParts = componentParts.filter((part) => {
    const qty = numberValue(part.qty, 0);
    const material = materialPool.find((item) => item.id === part.materialId);
    const rate = part.unitCost.trim() ? numberValue(part.unitCost, 0) : rateForComponentUnit(material, part.unit).rate;
    return qty > 0 && rate > 0 && (part.name.trim() || material);
  });
  const componentHasCost = pricedComponentParts.length > 0 || numberValue(componentLabourMinutes, 0) > 0;

  function toggleFinishing(key: string) {
    setFinishings((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setUnitPriceOverridden(false);
  }

  function toggleSmallFinishing(key: string) {
    setSmallFinishings((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setUnitPriceOverridden(false);
  }

  function toggleServiceFixing(key: string) {
    setServiceFixings((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setUnitPriceOverridden(false);
  }

  function updateComponentPart(id: string, patch: Partial<CustomComponentPart>) {
    setComponentParts((current) => current.map((part) => part.id === id ? { ...part, ...patch } : part));
    setUnitPriceOverridden(false);
  }

  function addComponentPart() {
    setComponentParts((current) => [...current, createBlankComponentPart()]);
    setUnitPriceOverridden(false);
  }

  function removeComponentPart(id: string) {
    setComponentParts((current) => current.length > 1 ? current.filter((part) => part.id !== id) : [createBlankComponentPart()]);
    setUnitPriceOverridden(false);
  }

  const costs = useMemo<CostRow[]>(() => {
    const rows: CostRow[] = [];

    if (flowType === "signage") {
      if (selectedMainMaterial && areaSqm > 0) {
        if (isRollMaterial(selectedMainMaterial) && !isSheetMaterial(selectedMainMaterial)) {
          const lm = roundedRollMetresForQuantity(usageWidth, usageHeight, selectedMainMaterial, quantityNumber, effectiveDropDirection, safeDropOverlapMm);
          const rate = rollRate(selectedMainMaterial);
          const amount = lm.amount / quantityNumber;
          rows.push({
            label: "Base material",
            detail: selectedMainMaterial.name,
            amount,
            unit: "lm",
            rate: rate.rate,
            cost: amount * rate.rate,
            note: [
              spacingUsageNote || null,
              lm.note,
              quantityNumber > 1 ? `${usage(lm.amount)}lm total for qty ${usage(quantityNumber)}` : null,
              rate.note
            ].filter(Boolean).join(" · ") || undefined
          });
        } else {
          const sheetUse = sheetUsageForQuoteLine(selectedMainMaterial, usageWidth, usageHeight, quantityNumber);
          const rate = sheetUnitRate(selectedMainMaterial);
          rows.push({ label: "Base material", detail: selectedMainMaterial.name, amount: sheetUse.amount, unit: "sheet", rate: rate.rate, cost: sheetUse.amount * rate.rate, note: [spacingUsageNote || null, sheetUse.note, rate.note].filter(Boolean).join(" · ") || undefined });
        }
      }

      if (artworkChoice === "required") {
        const minutes = numberValue(artworkMinutes, 0);
        if (minutes > 0) {
          const amount = minutes / quantityNumber;
          const rate = labourRate / 60;
          rows.push({ label: "Artwork", detail: "Artwork/design time", amount, unit: "min", rate, cost: amount * rate, note: quantityNumber > 1 ? `${minutesLabel(minutes)} once per quote line · ${money(labourRate)}/hr` : `${minutesLabel(minutes)} · ${money(labourRate)}/hr` });
        }
      }

      if (printed) {
        const minutes = numberValue(printSetupMinutes, 0);
        const methodLabel = printMethods.find((item) => item.key === resolvedPrintMethod)?.label ?? "Print";
        if (minutes > 0) {
          const amount = labourMinutesPerUnit(minutes, printSetupLabourBasis, quantityNumber);
          const rate = labourRate / 60;
          rows.push({
            label: "Print setup labour",
            detail: methodLabel,
            amount,
            unit: "min",
            rate,
            cost: amount * rate,
            note: labourChargeNote(minutes, printSetupLabourBasis, labourRate)
          });
        }
      }

      if (selectedMedia && needsAdditionalMediaCost && areaSqm > 0) {
        const mediaFaces = Math.max(1, Math.ceil(quantityNumber * sideMultiplier));
        const lm = roundedRollMetresForQuantity(usageWidth, usageHeight, selectedMedia, mediaFaces, effectiveDropDirection, safeDropOverlapMm);
        const rate = rollRate(selectedMedia);
        const amount = lm.amount / quantityNumber;
        rows.push({
          label: resolvedPrintMethod === "cut_vinyl" ? "Cut vinyl" : "Roll print media",
          detail: selectedMedia.name,
          amount,
          unit: "lm",
          rate: rate.rate,
          cost: amount * rate.rate,
          note: [
            spacingUsageNote || null,
            lm.note,
            sides === "double" ? "double sided" : null,
            quantityNumber > 1 || sideMultiplier > 1 ? `${usage(lm.amount)}lm total for ${usage(mediaFaces)} face${mediaFaces === 1 ? "" : "s"}` : null,
            rate.note
          ].filter(Boolean).join(" · ") || undefined
        });
      }

      if (needsInkStep && ink && ink !== "none" && areaSqm > 0) {
        const inkRollMaterial = isRollStockBase ? selectedMainMaterial : needsAdditionalMediaCost ? selectedMedia : undefined;
        const inkRollPieces = isRollStockBase ? quantityNumber : quantityNumber * sideMultiplier;
        const inkRollUse = inkRollMaterial
          ? roundedRollMetresForQuantity(usageWidth, usageHeight, inkRollMaterial, inkRollPieces, effectiveDropDirection, safeDropOverlapMm)
          : null;
        const inkAreaPerFaceSqm = dropLayoutPreview?.printedAreaSqmPerFace ?? areaSqm;
        const inkUse = roundedInkSquareMetresForQuoteLine(inkAreaPerFaceSqm, sideMultiplier, quantityNumber, inkRollUse, inkBillingIncrementSqm);
        const inkNote = [inkUse.note, sides === "double" ? "double sided" : null].filter(Boolean).join(" · ") || undefined;
        if (ink === "cmyk" || ink === "both") {
          rows.push({ label: "CMYK ink", detail: "Sell charge", amount: inkUse.amount, unit: "sqm", rate: inkRatePerSqm, cost: inkUse.amount * inkRatePerSqm, note: inkNote });
        }
        if (ink === "white" || ink === "both") {
          rows.push({ label: "White ink", detail: "Sell charge", amount: inkUse.amount, unit: "sqm", rate: inkRatePerSqm, cost: inkUse.amount * inkRatePerSqm, note: inkNote });
        }
      }

      if (backingApplicable && selectedBacking && backingId !== "none" && areaSqm > 0) {
        const lm = roundedRollMetresForQuantity(usageWidth, usageHeight, selectedBacking, quantityNumber, effectiveDropDirection, safeDropOverlapMm, dropLayoutPreview);
        const rate = rollRate(selectedBacking);
        const amount = quantityNumber > 0 ? lm.amount / quantityNumber : lm.amount;
        rows.push({
          label: "Backing film",
          detail: selectedBacking.name,
          amount,
          unit: "lm",
          rate: rate.rate,
          cost: amount * rate.rate,
          note: [
            selectedBackingGroup && selectedBackingGroup.materials.length > 1 ? `${selectedBackingGroup.label}: auto-selected ${selectedBacking.rollWidthMm || "best"}mm stock` : null,
            spacingUsageNote || null,
            lm.note,
            quantityNumber > 1 ? `${usage(lm.amount)}lm total for qty ${usage(quantityNumber)}` : null,
            rate.note
          ].filter(Boolean).join(" · ") || undefined
        });
      }

      if (selectedLaminate && laminateId !== "none" && areaSqm > 0) {
        const laminateFaces = Math.max(1, Math.ceil(quantityNumber * sideMultiplier));
        const lm = roundedRollMetresForQuantity(usageWidth, usageHeight, selectedLaminate, laminateFaces, effectiveDropDirection, safeDropOverlapMm, dropLayoutPreview);
        const rate = rollRate(selectedLaminate);
        const amount = quantityNumber > 0 ? lm.amount / quantityNumber : lm.amount;
        rows.push({
          label: "Laminate",
          detail: selectedLaminate.name,
          amount,
          unit: "lm",
          rate: rate.rate,
          cost: amount * rate.rate,
          note: [spacingUsageNote || null, lm.note, sides === "double" ? "double sided" : null, quantityNumber > 1 ? `${usage(lm.amount)}lm total for qty ${usage(quantityNumber)}` : null, rate.note].filter(Boolean).join(" · ") || undefined
        });
        const minutes = numberValue(laminateMinutes, 0);
        if (minutes > 0) {
          const amount = labourMinutesPerUnit(minutes, laminateLabourBasis, quantityNumber);
          const rate = labourRate / 60;
          rows.push({ label: "Laminate labour", detail: "Apply laminate", amount, unit: "min", rate, cost: amount * rate, note: labourChargeNote(minutes, laminateLabourBasis, labourRate) });
        }
      }

      for (const item of finishingOptions) {
        if (!finishings.includes(item.key)) continue;
        if (item.key === "eyelets") {
          const preset = eyeletPresets.find((option) => option.label === eyeletPresetLabel);
          const qty = preset?.qty === 0 ? numberValue(customEyeletQty, 0) : preset?.qty ?? 0;
          if (qty > 0 && eyeletMaterial) {
            const rate = eachRate(eyeletMaterial);
            rows.push({ label: "Eyelets", detail: eyeletMaterial.name, amount: qty, unit: "each", rate: rate.rate, cost: qty * rate.rate, note: [eyeletPresetLabel, rate.note].filter(Boolean).join(" · ") || undefined });
          }
          const eyeletMinutes = numberValue(finishingMinutes[item.key], 0);
          if (qty > 0 && eyeletMinutes > 0) {
            const basis = finishingLabourBasis[item.key] ?? "per_item";
            const amount = basis === "per_item"
              ? qty * eyeletMinutes
              : labourMinutesPerUnit(eyeletMinutes, "line_total", quantityNumber);
            const rate = labourRate / 60;
            rows.push({ label: "Eyelet labour", detail: `${eyeletPresetLabel} placement`, amount, unit: "min", rate, cost: amount * rate, note: labourChargeNote(eyeletMinutes, basis, labourRate, "per eyelet") });
          }
          continue;
        }
        const minutes = numberValue(finishingMinutes[item.key], 0);
        if (minutes > 0) {
          const basis = finishingLabourBasis[item.key] ?? "line_total";
          const amount = labourMinutesPerUnit(minutes, basis, quantityNumber);
          const rate = labourRate / 60;
          rows.push({ label: item.label, detail: "Factory labour", amount, unit: "min", rate, cost: amount * rate, note: labourChargeNote(minutes, basis, labourRate) });
        }
      }
    }

    if (isPrintDepartment) {
      const itemArea = areaSqm;
      if (selectedSmallStock && itemArea > 0 && quantityNumber > 0) {
        if (isRollMaterial(selectedSmallStock)) {
          const lm = roundedRollMetresForQuantity(usageWidth, usageHeight, selectedSmallStock, quantityNumber);
          const rate = rollRate(selectedSmallStock);
          const amount = lm.amount / quantityNumber;
          rows.push({
            label: flowType === "plan_printing" ? "Plan media" : "Poster media",
            detail: selectedSmallStock.name,
            amount,
            unit: "lm",
            rate: rate.rate,
            cost: amount * rate.rate,
            note: [spacingUsageNote || null, lm.note, quantityNumber > 1 ? `${usage(lm.amount)}lm total for qty ${usage(quantityNumber)}` : null, rate.note].filter(Boolean).join(" · ") || undefined
          });
        } else {
          const stockDimensions = bestSheetDimensions(selectedSmallStock);
          const parentWidth = stockDimensions?.width ?? 0;
          const parentHeight = stockDimensions?.length ?? 0;
          const perSheet = piecesPerSheet(parentWidth, parentHeight, usageWidth, usageHeight);
          const requiredPieces = quantityNumber;
          const sheets = perSheet > 0 ? Math.ceil(requiredPieces / perSheet) : requiredPieces;
          const rate = sheetUnitRate(selectedSmallStock);
          const amount = sheets / quantityNumber;
          rows.push({
            label: flowType === "plan_printing" ? "Plan stock" : "Poster stock",
            detail: selectedSmallStock.name,
            amount,
            unit: "sheet",
            rate: rate.rate,
            cost: amount * rate.rate,
            note: [spacingUsageNote || null, perSheet > 0 ? `${perSheet} up per parent sheet · ${sheets} sheet${sheets === 1 ? "" : "s"} total for qty ${usage(quantityNumber)}` : rate.note ?? "parent sheet size missing"].filter(Boolean).join(" · ")
          });
        }
      }

      if (artworkChoice === "required") {
        const minutes = numberValue(artworkMinutes, 0);
        if (minutes > 0) {
          const amount = minutes / quantityNumber;
          const rate = labourRate / 60;
          rows.push({ label: "Artwork", detail: "Artwork/design time", amount, unit: "min", rate, cost: amount * rate, note: quantityNumber > 1 ? `${minutesLabel(minutes)} once per quote line · ${money(labourRate)}/hr` : `${minutesLabel(minutes)} · ${money(labourRate)}/hr` });
        }
      }

      if (smallPrintColour && itemArea > 0) {
        const printedArea = itemArea * sideMultiplier;
        if (smallPrintColour === "mono") rows.push({ label: "Mono print", detail: flowDepartmentProductName(flowType), amount: printedArea, unit: "sqm", rate: monoRatePerSqm, cost: printedArea * monoRatePerSqm, note: sides === "double" ? "double sided" : undefined });
        if (smallPrintColour === "cmyk") rows.push({ label: "CMYK print", detail: flowDepartmentProductName(flowType), amount: printedArea, unit: "sqm", rate: inkRatePerSqm, cost: printedArea * inkRatePerSqm, note: sides === "double" ? "double sided" : undefined });
        if (smallPrintColour === "special") rows.push({ label: "CMYK + special print", detail: flowDepartmentProductName(flowType), amount: printedArea, unit: "sqm", rate: inkRatePerSqm * 2, cost: printedArea * inkRatePerSqm * 2, note: sides === "double" ? "double sided" : undefined });
      }

      if (selectedSmallCoating && smallCoatingId !== "none" && itemArea > 0) {
        const rate = isRollMaterial(selectedSmallCoating) ? rollRate(selectedSmallCoating) : sheetUnitRate(selectedSmallCoating);
        const amount = itemArea * sideMultiplier;
        rows.push({ label: "Coating / laminate", detail: selectedSmallCoating.name, amount, unit: "sqm", rate: rate.rate, cost: amount * rate.rate, note: [sides === "double" ? "double sided" : null, rate.note].filter(Boolean).join(" · ") || undefined });
      }

      for (const item of smallFinishingOptions) {
        if (!smallFinishings.includes(item.key)) continue;
        const minutes = numberValue(smallFinishingMinutes[item.key], 0);
        if (minutes > 0) {
          const basis = smallFinishingLabourBasis[item.key] ?? smallFinishingDefaultBasis;
          const amount = labourMinutesPerUnit(minutes, basis, quantityNumber);
          const rate = labourRate / 60;
          rows.push({ label: item.label, detail: "Finishing labour", amount, unit: "min", rate, cost: amount * rate, note: labourChargeNote(minutes, basis, labourRate) });
        }
      }
    }

    if (flowType === "small_format") {
      const itemArea = areaSqm;
      if (selectedSmallStock && itemArea > 0 && quantityNumber > 0) {
        const stockDimensions = bestSheetDimensions(selectedSmallStock);
        const parentWidth = stockDimensions?.width ?? 0;
        const parentHeight = stockDimensions?.length ?? 0;
        const perSheet = piecesPerSheet(parentWidth, parentHeight, usageWidth, usageHeight);
        const setsPerBook = isDuplicateBook ? Math.max(1, numberValue(ncrSetsPerBook, 1)) : 1;
        const copiesPerSet = isDuplicateBook ? Math.max(1, ncrCopiesCount || 1) : 1;
        const requiredPieces = quantityNumber * setsPerBook * copiesPerSet;
        const sheets = perSheet > 0 ? Math.ceil(requiredPieces / perSheet) : requiredPieces;
        const rate = sheetUnitRate(selectedSmallStock);
        rows.push({ label: isDuplicateBook ? "Carbon/NCR stock" : "Paper / card stock", detail: selectedSmallStock.name, amount: sheets, unit: "sheet", rate: rate.rate, cost: sheets * rate.rate, note: [spacingUsageNote || null, isDuplicateBook ? `${usage(quantityNumber)} books × ${usage(setsPerBook)} sets × ${copiesPerSet} copies · ${perSheet > 0 ? `${perSheet} up per parent sheet` : "parent sheet size missing"}` : perSheet > 0 ? `${perSheet} up per parent sheet` : rate.note ?? "parent sheet size missing"].filter(Boolean).join(" · ") });
      }

      if (artworkChoice === "required") {
        const minutes = numberValue(artworkMinutes, 0);
        if (minutes > 0) {
          const rate = labourRate / 60;
          rows.push({ label: "Artwork", detail: "Artwork/design time", amount: minutes, unit: "min", rate, cost: minutes * rate, note: `${minutesLabel(minutes)} · ${money(labourRate)}/hr` });
        }
      }

      if (isDuplicateBook && itemArea > 0 && quantityNumber > 0) {
        const setsPerBook = Math.max(1, numberValue(ncrSetsPerBook, 1));
        const copiesPerSet = Math.max(1, ncrCopiesCount || 1);
        const printedArea = itemArea * quantityNumber * setsPerBook * copiesPerSet;
        rows.push({ label: "Carbon book print", detail: pageColourSummary(copiesPerSet, ncrPageColours), amount: printedArea, unit: "sqm", rate: monoRatePerSqm, cost: printedArea * monoRatePerSqm, note: `${usage(quantityNumber)} books × ${usage(setsPerBook)} sets × ${copiesPerSet} copies` });
      }

      if (smallPrintColour && itemArea > 0 && quantityNumber > 0) {
        const printedArea = itemArea * quantityNumber * sideMultiplier;
        if (smallPrintColour === "mono") rows.push({ label: "Mono print", detail: "Small-format print charge", amount: printedArea, unit: "sqm", rate: monoRatePerSqm, cost: printedArea * monoRatePerSqm, note: sides === "double" ? "double sided" : undefined });
        if (smallPrintColour === "cmyk") rows.push({ label: "CMYK print", detail: "Small-format print charge", amount: printedArea, unit: "sqm", rate: inkRatePerSqm, cost: printedArea * inkRatePerSqm, note: sides === "double" ? "double sided" : undefined });
        if (smallPrintColour === "special") rows.push({ label: "CMYK + special print", detail: "Small-format print charge", amount: printedArea, unit: "sqm", rate: inkRatePerSqm * 2, cost: printedArea * inkRatePerSqm * 2, note: sides === "double" ? "double sided" : undefined });
      }

      if (selectedSmallCoating && smallCoatingId !== "none" && itemArea > 0 && quantityNumber > 0) {
        const rate = isRollMaterial(selectedSmallCoating) ? rollRate(selectedSmallCoating) : sheetUnitRate(selectedSmallCoating);
        const amount = itemArea * quantityNumber * sideMultiplier;
        rows.push({ label: "Cello / coating", detail: selectedSmallCoating.name, amount, unit: "sqm", rate: rate.rate, cost: amount * rate.rate, note: [sides === "double" ? "double sided" : null, rate.note].filter(Boolean).join(" · ") || undefined });
      }

      for (const item of smallFinishingOptions) {
        if (!smallFinishings.includes(item.key)) continue;
        const minutes = numberValue(smallFinishingMinutes[item.key], 0);
        if (minutes > 0) {
          const basis = smallFinishingLabourBasis[item.key] ?? smallFinishingDefaultBasis;
          const amount = labourMinutesPerUnit(minutes, basis, quantityNumber);
          const rate = labourRate / 60;
          rows.push({ label: item.label, detail: "Bindery / finishing labour", amount, unit: "min", rate, cost: amount * rate, note: labourChargeNote(minutes, basis, labourRate) });
        }
      }
    }


    if (flowType === "service") {
      if (serviceType === "pickup") {
        rows.push({ label: "Pickup", detail: "Client collection", amount: 1, unit: "each", rate: 0, cost: 0, note: "no charge" });
      }

      if (serviceType === "delivery") {
        const charge = numberValue(deliveryCharge, 0);
        if (charge > 0) rows.push({ label: "Delivery", detail: "Delivery charge", amount: 1, unit: "each", rate: charge, cost: charge });
      }

      if (serviceType === "install") {
        const people = Math.max(1, numberValue(installCrewSize, 1));
        const minutes = numberValue(installMinutes, 0);
        if (minutes > 0) {
          const amount = people * labourMinutesPerUnit(minutes, installLabourBasis, quantityNumber);
          const rate = labourRate / 60;
          rows.push({ label: "Install labour", detail: `${usage(people)} installer${people === 1 ? "" : "s"}`, amount, unit: "person-min", rate, cost: amount * rate, note: labourChargeNote(minutes, installLabourBasis, labourRate) });
        }
        const travel = numberValue(travelCharge, 0);
        if (travel > 0) rows.push({ label: "Travel / call-out", detail: "One dollar charge for the complete quote line", amount: 1 / Math.max(1, quantityNumber), unit: "charge", rate: travel, cost: travel / Math.max(1, quantityNumber), note: `${money(travel)} total; not multiplied by quantity` });
        for (const item of fixingOptions) {
          if (!serviceFixings.includes(item.key)) continue;
          const qty = numberValue(serviceFixingQty[item.key], 0);
          const rate = numberValue(serviceFixingRate[item.key], 0);
          if (qty > 0 && rate > 0) rows.push({ label: item.label, detail: "Install fixing / consumable total", amount: qty / Math.max(1, quantityNumber), unit: item.unit, rate, cost: (qty * rate) / Math.max(1, quantityNumber), note: `${usage(qty)} ${item.unit} total for the quote line` });
        }
      }

      if (serviceType === "access_equipment") {
        const dailyCharge = numberValue(accessEquipmentDailyCharge, 0);
        if (dailyCharge > 0) {
          rows.push({
            label: "Access equipment",
            detail: accessEquipmentType.trim() || "Equipment hire",
            amount: 1,
            unit: "day",
            rate: dailyCharge,
            cost: dailyCharge,
            note: "Daily equipment cost before quote pricing"
          });
        }
      }
    }

    if (flowType === "component") {
      for (const part of componentParts) {
        const material = materialPool.find((item) => item.id === part.materialId);
        const qty = numberValue(part.qty, 0);
        const derivedRate = rateForComponentUnit(material, part.unit);
        const rate = part.unitCost.trim() ? numberValue(part.unitCost, 0) : derivedRate.rate;
        const label = part.name.trim() || material?.name || "Component part";
        if (qty > 0 && rate > 0) {
          rows.push({
            label,
            detail: material ? material.name : "Custom part",
            amount: qty,
            unit: part.unit || "each",
            rate,
            cost: qty * rate,
            note: [part.note.trim(), !part.unitCost.trim() ? derivedRate.note : null].filter(Boolean).join(" · ") || undefined
          });
        }
      }

      const minutes = numberValue(componentLabourMinutes, 0);
      if (minutes > 0) {
        const rate = labourRate / 60;
        rows.push({ label: componentLabourLabel.trim() || "Assembly labour", detail: componentName.trim() || "Custom component", amount: minutes, unit: "min", rate, cost: minutes * rate, note: `${minutesLabel(minutes)} · ${money(labourRate)}/hr` });
      }
    }

    return rows;
  }, [flowType, selectedMainMaterial, areaSqm, width, height, usageWidth, usageHeight, spacingUsageNote, artworkChoice, artworkMinutes, printed, printSetupMinutes, printSetupLabourBasis, selectedMedia, needsAdditionalMediaCost, sideMultiplier, resolvedPrintMethod, needsInkStep, ink, backingApplicable, selectedBacking, backingId, selectedBackingGroup, selectedLaminate, laminateId, laminateMinutes, laminateLabourBasis, finishings, finishingMinutes, finishingLabourBasis, eyeletPresetLabel, customEyeletQty, eyeletMaterial, selectedSmallStock, quantityNumber, smallPrintColour, sides, selectedSmallCoating, smallCoatingId, smallFinishings, smallFinishingMinutes, smallFinishingLabourBasis, smallFinishingDefaultBasis, isDuplicateBook, ncrSetsPerBook, ncrCopiesCount, ncrPageColours, serviceType, deliveryCharge, installCrewSize, installMinutes, installLabourBasis, travelCharge, accessEquipmentDailyCharge, accessEquipmentType, serviceFixings, serviceFixingQty, serviceFixingRate, componentParts, componentLabourMinutes, componentLabourLabel, componentName, materialPool, labourRate, monoRatePerSqm, inkRatePerSqm, inkBillingIncrementSqm, isPrintDepartment, effectiveDropDirection, safeDropOverlapMm, dropLayoutPreview]);

  const serviceLabel = serviceTypes.find((item) => item.key === serviceType)?.label;
  const rawCost = costs.reduce((total, row) => total + row.cost, 0);
  const priceLevelFactor = Math.max(0, numberValue(pricingSettings?.priceLevelFactor, 1));
  const manualQuoteDiscountPercent = discountPercentValue(pricingSettings?.manualQuoteDiscountPercent);
  const manualQuoteDiscountMultiplier = Math.max(0, 1 - manualQuoteDiscountPercent / 100);
  const pricingMultiplier = sellMultiplier * priceLevelFactor * manualQuoteDiscountMultiplier;
  const autoUnitPrice = rawCost * pricingMultiplier;
  const unitPrice = unitPriceOverridden ? numberValue(manualUnitPrice, 0) : autoUnitPrice;
  const lineTotal = unitPrice * quantityNumber;
  const selectedMediaName = isRollStockBase ? "" : customerMaterialName(selectedMedia);
  const selectedBackingName = backingApplicable ? (backingId === "none" ? "None" : selectedBackingGroup?.label ?? customerMaterialName(selectedBacking)) : "";
  const selectedLaminateName = laminateId === "none" ? "None" : customerMaterialName(selectedLaminate);
  const selectedSmallCoatingName = smallCoatingId === "none" ? "None" : customerMaterialName(selectedSmallCoating);
  const dispatchLineQuantity = serviceType === "install" && installLabourBasis === "per_item" ? Math.max(1, quantityNumber) : 1;
  const dispatchCosts = useMemo<CostRow[]>(() => {
    const rows: CostRow[] = [];

    if (serviceType === "delivery") {
      const charge = numberValue(deliveryCharge, 0);
      if (charge > 0) rows.push({ label: "Delivery", detail: "Delivery charge", amount: 1, unit: "each", rate: charge, cost: charge });
    }

    if (serviceType === "install") {
      const people = Math.max(1, numberValue(installCrewSize, 1));
      const minutes = numberValue(installMinutes, 0);
      if (minutes > 0) {
        const amount = people * minutes;
        const rate = labourRate / 60;
        rows.push({ label: "Install labour", detail: `${usage(people)} installer${people === 1 ? "" : "s"}`, amount, unit: "person-min", rate, cost: amount * rate, note: labourChargeNote(minutes, installLabourBasis, labourRate) });
      }
      const travel = numberValue(travelCharge, 0);
      if (travel > 0) rows.push({ label: "Travel / call-out", detail: "One dollar charge for the complete quote line", amount: 1 / dispatchLineQuantity, unit: "charge", rate: travel, cost: travel / dispatchLineQuantity, note: `${money(travel)} total; not multiplied by quantity` });
      for (const item of fixingOptions) {
        if (!serviceFixings.includes(item.key)) continue;
        const qty = numberValue(serviceFixingQty[item.key], 0);
        const rate = numberValue(serviceFixingRate[item.key], 0);
        if (qty > 0 && rate > 0) rows.push({ label: item.label, detail: "Install fixing / consumable total", amount: qty / dispatchLineQuantity, unit: item.unit, rate, cost: (qty * rate) / dispatchLineQuantity, note: `${usage(qty)} ${item.unit} total for the quote line` });
      }
    }

    return rows;
  }, [serviceType, deliveryCharge, installCrewSize, installMinutes, installLabourBasis, travelCharge, serviceFixings, serviceFixingQty, serviceFixingRate, labourRate, dispatchLineQuantity]);
  const dispatchRawCost = dispatchCosts.reduce((total, row) => total + row.cost, 0);
  const dispatchUnitPrice = dispatchRawCost * pricingMultiplier;
  const dispatchLineTotal = dispatchUnitPrice * dispatchLineQuantity;
  const fixingAllowanceSummary = serviceFixings.map((key) => {
    const item = fixingOptions.find((option) => option.key === key);
    if (!item) return "";
    const qty = numberValue(serviceFixingQty[key], 0);
    if (qty <= 0) return item.label;
    const pluralUnit = item.unit === "tube" && Math.abs(qty - 1) > 0.0001
      ? "tubes"
      : item.unit === "allowance" && Math.abs(qty - 1) > 0.0001
        ? "allowances"
        : item.unit;
    const unitText = pluralUnit === "lm" ? `${usage(qty)}lm` : `${usage(qty)} ${pluralUnit}`;
    return `${item.label} — ${unitText}`;
  }).filter(Boolean).join(", ");
  const dispatchSummary = serviceType === "pickup"
    ? "Pickup"
    : serviceType === "delivery"
      ? `Delivery${deliveryCharge ? ` · allowance ${money(numberValue(deliveryCharge, 0))}` : ""}`
      : serviceType === "install"
        ? ["Install", installCrewSize ? `${installCrewSize} installer${numberValue(installCrewSize, 1) === 1 ? "" : "s"}` : null, installMinutes ? `${minutesLabel(installMinutes)} ${installLabourBasis === "per_item" ? "per item" : "total line item"}` : null, travelCharge ? `${money(numberValue(travelCharge, 0))} travel / call-out total` : null, fixingAllowanceSummary ? `Fixings allowance: ${fixingAllowanceSummary}` : null].filter(Boolean).join(" · ")
        : "";
  const shouldCreateDispatchLine = flowType !== "service" && (serviceType === "delivery" || serviceType === "install") && dispatchUnitPrice > 0;
  const accessEquipmentDaysNumber = Math.max(1, numberValue(accessEquipmentDays, 1));
  const accessEquipmentRawDailyCharge = numberValue(accessEquipmentDailyCharge, 0);
  const accessEquipmentDailySellPrice = accessEquipmentRawDailyCharge * pricingMultiplier;
  const accessEquipmentLineTotal = accessEquipmentDailySellPrice * accessEquipmentDaysNumber;
  const accessEquipmentDetailsComplete = Boolean(
    accessEquipmentType.trim()
      && accessEquipmentRawDailyCharge > 0
      && numberValue(accessEquipmentDays, 0) > 0
  );
  const shouldCreateAccessEquipmentLine = serviceType === "install"
    && accessEquipmentRequired
    && accessEquipmentDetailsComplete;
  const accessEquipmentSummary = accessEquipmentDetailsComplete
    ? `${accessEquipmentType.trim()} · ${usage(accessEquipmentDaysNumber)} day${accessEquipmentDaysNumber === 1 ? "" : "s"}`
    : "";
  const baseSheetUse = flowType === "signage" ? costs.find((row) => row.label === "Base material" && row.unit === "sheet") : undefined;
  const totalSheetUse = baseSheetUse ? baseSheetUse.amount * quantityNumber : 0;
  const sheetUseLabel = baseSheetUse && totalSheetUse > 0
    ? `Stock: ${baseSheetUse.detail} — ${usage(totalSheetUse)} sheet${Math.abs(totalSheetUse - 1) < 0.0001 ? "" : "s"} calculated`
    : "";
  const rollUseRow = flowType === "signage"
    ? costs.find((row) => row.unit === "lm" && ["Roll print media", "Cut vinyl", "Base material"].includes(row.label))
    : undefined;
  const totalRollUse = rollUseRow ? rollUseRow.amount * quantityNumber : 0;
  const rollUseLabel = rollUseRow && totalRollUse > 0
    ? `${rollUseRow.label === "Base material" ? "Stock" : rollUseRow.label === "Cut vinyl" ? "Cut vinyl" : "Print media"}: ${rollUseRow.detail} — ${usage(totalRollUse)}lm calculated`
    : "";
  const inkUseRow = flowType === "signage"
    ? costs.find((row) => row.unit === "sqm" && (row.label === "CMYK ink" || row.label === "White ink"))
    : undefined;
  const totalInkUse = inkUseRow ? inkUseRow.amount * quantityNumber : 0;
  const inkUseLabel = inkUseRow && totalInkUse > 0
    ? `Ink: ${ink === "both" ? "CMYK + White" : inkUseRow.label.replace(/ ink$/i, "")} — ${usage(totalInkUse)}sqm calculated${ink === "both" ? " each" : ""}`
    : "";
  const backingUseRow = flowType === "signage" ? costs.find((row) => row.label === "Backing film" && row.unit === "lm") : undefined;
  const totalBackingUse = backingUseRow ? backingUseRow.amount * quantityNumber : 0;
  const backingUseLabel = backingUseRow && totalBackingUse > 0
    ? `Backing: ${backingUseRow.detail} — ${usage(totalBackingUse)}lm calculated`
    : "";
  const laminateUseRow = flowType === "signage" ? costs.find((row) => row.label === "Laminate" && row.unit === "lm") : undefined;
  const totalLaminateUse = laminateUseRow ? laminateUseRow.amount * quantityNumber : 0;
  const laminateUseLabel = laminateUseRow && totalLaminateUse > 0
    ? `Laminate: ${laminateUseRow.detail} — ${usage(totalLaminateUse)}lm calculated`
    : "";

  const finishingSummary = finishings.map((key) => {
    if (key === "eyelets") {
      const preset = eyeletPresets.find((option) => option.label === eyeletPresetLabel);
      const qty = preset?.qty === 0 ? numberValue(customEyeletQty, 0) : preset?.qty ?? 0;
      return `Eyelets: ${eyeletPresetLabel}${qty > 0 ? ` (${qty})` : ""}`;
    }
    return finishingOptions.find((item) => item.key === key)?.label ?? "";
  }).filter(Boolean).join(", ");
  const smallFinishingSummary = selectedKeys(smallFinishingOptions, smallFinishings);

  const componentPartSummary = pricedComponentParts.map((part) => {
    const material = materialPool.find((item) => item.id === part.materialId);
    return `${usage(numberValue(part.qty, 0))} ${part.unit || "each"} ${part.name.trim() || customerMaterialName(material) || "part"}`;
  }).join(", ");
  const finishedSizeLabel = width > 0 && height > 0 ? `${dimensionMm(width)} × ${dimensionMm(height)}mm` : "";
  const dropLayoutSummary = dropLayoutPreview
    ? `${dropLayoutPreview.drops} ${dropLayoutPreview.direction === "vertical" ? "vertical drops" : "horizontal strips"} approx ${dimensionMm(dropLayoutPreview.panelAcrossMm)} × ${dimensionMm(dropLayoutPreview.lengthMm)}mm${dropLayoutPreview.overlapMm > 0 ? ` · ${dimensionMm(dropLayoutPreview.overlapMm)}mm overlap` : ""}`
    : activeRollMaterial && dropDirection === "auto" ? "Auto / best yield" : "";
  const lineName = flowType === "component"
    ? componentName.trim() || "Custom component"
    : flowType === "service"
    ? serviceType === "install"
      ? "Sign Install"
      : serviceType === "access_equipment"
        ? `Access Equipment${accessEquipmentType.trim() ? ` - ${accessEquipmentType.trim()}` : ""}`
        : serviceLabel ?? "Service item"
    : flowType === "small_format"
      ? selectedSmallType?.label ?? "Small format item"
      : flowType === "plan_printing"
        ? "Plan Printing"
        : flowType === "poster_printing"
          ? "Poster Printing"
          : isRollStockBase
            ? customerMaterialName(selectedMainMaterial) || selectedBase?.label || "Vinyl/Roll Stock"
            : selectedBase?.label ?? "Signage item";

  const optionSummary = flowType === "component"
    ? [
      componentName.trim() || "Custom component",
      componentPartSummary ? `Parts: ${componentPartSummary}` : null,
      numberValue(componentLabourMinutes, 0) > 0 ? `${minutesLabel(componentLabourMinutes)} ${componentLabourLabel.trim() || "labour"}` : null,
      componentDescription.trim() || null,
      `Qty ${quantityNumber}`
    ].filter(Boolean).join(" · ")
    : flowType === "service"
    ? [
      serviceType === "install" ? "Install only — client-supplied signage" : serviceType === "access_equipment" ? accessEquipmentSummary : serviceLabel,
      serviceType === "delivery" && deliveryCharge ? `Delivery charge ${money(numberValue(deliveryCharge, 0))}` : null,
      serviceType === "install" ? `${installCrewSize || "1"} installer${numberValue(installCrewSize, 1) === 1 ? "" : "s"}` : null,
      serviceType === "install" && installMinutes ? `${minutesLabel(installMinutes)} install ${installLabourBasis === "per_item" ? "per item" : "total line item"}` : null,
      serviceType === "install" && travelCharge ? `Travel / call-out charge ${money(numberValue(travelCharge, 0))} total` : null,
      serviceType === "install" && fixingAllowanceSummary ? `Fixings allowance: ${fixingAllowanceSummary}` : null
    ].filter(Boolean).join(" · ")
    : isPrintDepartment
      ? [
      flowDepartmentProductName(flowType),
      customerMaterialName(selectedSmallStock) ? `Stock: ${customerMaterialName(selectedSmallStock)}` : null,
      finishedSizeLabel ? `Finished size: ${finishedSizeLabel}` : null,
      artworkChoice === "required" ? numberValue(artworkMinutes, 0) > 0 ? `Artwork ${minutesLabel(artworkMinutes)}` : "Artwork required" : artworkChoice === "client_supplied" ? "Artwork supplied" : null,
      sides ? `${sides === "double" ? "Double" : "Single"} sided` : null,
      smallPrintColour ? smallPrintColour === "mono" ? "Mono" : smallPrintColour === "cmyk" ? "CMYK" : "CMYK + special" : null,
      selectedSmallCoatingName ? `Coating: ${selectedSmallCoatingName}` : null,
      smallFinishingSummary ? `Finishing: ${smallFinishingSummary}` : null,
      serviceType !== "install" && dispatchSummary ? `Dispatch: ${dispatchSummary}` : null,
      `Qty ${quantityNumber}`
    ].filter(Boolean).join(" · ")
    : flowType === "small_format"
      ? [
      selectedSmallType?.label,
      customerMaterialName(selectedSmallStock) ? `Stock: ${customerMaterialName(selectedSmallStock)}` : null,
      isDuplicateBook && ncrCopies ? `${ncrCopiesCount} part book` : null,
      isDuplicateBook && ncrSetsPerBook ? `${ncrSetsPerBook} sets/book` : null,
      isDuplicateBook && ncrCopiesCount ? pageColourSummary(ncrCopiesCount, ncrPageColours) : null,
      isDuplicateBook && ncrCoverColour ? `Cover: ${ncrCoverColour}` : null,
      isDuplicateBook && ncrTapeColour ? `Tape: ${ncrTapeColour}` : null,
      finishedSizeLabel ? `Finished size: ${finishedSizeLabel}` : null,
      artworkChoice === "required" ? numberValue(artworkMinutes, 0) > 0 ? `Artwork ${minutesLabel(artworkMinutes)}` : "Artwork required" : artworkChoice === "client_supplied" ? "Artwork supplied" : null,
      sides ? `${sides === "double" ? "Double" : "Single"} sided` : null,
      smallPrintColour ? smallPrintColour === "mono" ? "Mono" : smallPrintColour === "cmyk" ? "CMYK" : "CMYK + special" : null,
      selectedSmallCoatingName ? `Coating: ${selectedSmallCoatingName}` : null,
      smallFinishingSummary ? `Finishing: ${smallFinishingSummary}` : null,
      serviceType !== "install" && dispatchSummary ? `Dispatch: ${dispatchSummary}` : null,
      `Qty ${quantityNumber}`
    ].filter(Boolean).join(" · ")
    : [
      selectedBase?.label,
      finishedSizeLabel ? `Finished size: ${finishedSizeLabel}` : null,
      artworkChoice === "required" ? numberValue(artworkMinutes, 0) > 0 ? `Artwork ${minutesLabel(artworkMinutes)}` : "Artwork required" : artworkChoice === "client_supplied" ? "Artwork supplied" : null,
      isRollStockBase ? null : printMethods.find((item) => item.key === resolvedPrintMethod)?.label,
      printed && numberValue(printSetupMinutes, 0) > 0 ? `Print setup ${minutesLabel(printSetupMinutes)}` : null,
      sheetUseLabel || null,
      rollUseLabel || null,
      activeRollMaterial && dropLayoutSummary ? `Drop layout: ${dropLayoutSummary}` : null,
      inkUseLabel || (inkChoices.find((item) => item.key === ink)?.label ?? null),
      sides ? `${sides === "double" ? "Double" : "Single"} sided` : null,
      printDirection ? `${printDirection === "reverse" ? "Reverse" : (selectedReversePrintableRoll && !isClearAcrylic ? "Standard" : "Positive")} print` : null,
      backingUseLabel || (backingApplicable && selectedBackingName ? `Backing: ${selectedBackingName}` : null),
      laminateUseLabel || (selectedLaminateName ? `Laminate: ${selectedLaminateName}` : null),
      finishingSummary ? `Finishing: ${finishingSummary}` : null,
      serviceType !== "install" && dispatchSummary ? `Dispatch: ${dispatchSummary}` : null
    ].filter(Boolean).join(" · ");

  const accessEquipmentSelectionComplete = !accessEquipmentRequired || accessEquipmentDetailsComplete;
  const dispatchComplete = serviceType === "pickup"
    || (serviceType === "delivery" && numberValue(deliveryCharge, 0) > 0)
    || (serviceType === "install" && numberValue(installCrewSize, 0) > 0 && numberValue(installMinutes, 0) > 0 && accessEquipmentSelectionComplete);

  const canSave = flowType === "component"
    ? Boolean(componentName.trim() && componentHasCost)
    : flowType === "service"
    ? Boolean(serviceType && (
      serviceType === "pickup"
      || (serviceType === "delivery" && numberValue(deliveryCharge, 0) > 0)
      || (serviceType === "install" && numberValue(installCrewSize, 0) > 0 && numberValue(installMinutes, 0) > 0 && accessEquipmentSelectionComplete)
      || (serviceType === "access_equipment" && accessEquipmentDetailsComplete)
    ))
    : isPrintDepartment
      ? Boolean(selectedSmallStock && width > 0 && height > 0 && artworkChoice && sides && smallPrintColour && smallCoatingId && quantityNumber > 0 && dispatchComplete)
      : flowType === "small_format"
        ? Boolean(smallType && ncrDetailsComplete && selectedSmallStock && width > 0 && height > 0 && artworkChoice && (isDuplicateBook || (sides && smallPrintColour && smallCoatingId)) && quantityNumber > 0 && dispatchComplete)
        : Boolean(baseType && selectedMainMaterial && width > 0 && height > 0 && artworkChoice && resolvedPrintMethod && (!needsMediaStep || mediaId) && (!needsInkStep || ink) && (!printed || sides) && (!canChooseReversePrint || !printed || printDirection) && (!backingApplicable || Boolean(backingId)) && (!printed || Boolean(laminateId)) && dispatchComplete);

  const configurationSnapshot: QuickQuoteSnapshot = {
    version: 1,
    source: "quick_quote_builder",
    reconstructed: false,
    surveyImported: initialSnapshot?.surveyImported,
    surveyNeedsConfiguration: initialSnapshot?.surveyImported ? !canSave : undefined,
    surveyContext: initialSnapshot?.surveyContext,
    linkedDispatchLineId: initialSnapshot?.linkedDispatchLineId ?? null,
    linkedAccessEquipmentLineId: initialSnapshot?.linkedAccessEquipmentLineId ?? null,
    builderMode: "quick",
    activeStep,
    flowType,
    baseType,
    thickness,
    colour,
    widthMm,
    heightMm,
    bleedSpacingMm,
    dropDirection: effectiveDropDirection,
    dropOverlapMm: String(safeDropOverlapMm),
    dropCount: dropLayoutPreview?.drops,
    dropPanelWidthMm: dropLayoutPreview ? String(dropLayoutPreview.panelAcrossMm) : undefined,
    dropLengthMm: dropLayoutPreview ? String(dropLayoutPreview.lengthMm) : undefined,
    artworkChoice,
    artworkMinutes,
    printMethod: resolvedPrintMethod,
    printSetupMinutes,
    printSetupLabourBasis,
    mediaId,
    ink,
    sides,
    printDirection,
    backingId: backingId === "none" ? "none" : selectedBacking?.id ?? backingId,
    laminateId,
    laminateMinutes,
    laminateLabourBasis,
    finishings,
    finishingMinutes,
    finishingLabourBasis,
    eyeletPresetLabel,
    customEyeletQty,
    smallType,
    smallStockId,
    customSmallStockEnabled,
    customSmallStockName,
    customSmallStockSupplier,
    customSmallStockCost,
    customSmallStockWidthMm,
    customSmallStockLengthMm,
    customSmallStockGsm,
    ncrCopies,
    ncrSetsPerBook,
    ncrPageColours,
    ncrCoverColour,
    ncrTapeColour,
    smallPrintColour,
    smallCoatingId,
    smallFinishings,
    smallFinishingMinutes,
    smallFinishingLabourBasis,
    serviceType,
    deliveryCharge,
    installCrewSize,
    installMinutes,
    installLabourBasis,
    travelCharge,
    accessEquipmentRequired,
    accessEquipmentType,
    accessEquipmentDailyCharge,
    accessEquipmentDays,
    serviceFixings,
    serviceFixingQty,
    serviceFixingRate,
    componentName,
    componentDescription,
    componentParts,
    componentLabourLabel,
    componentLabourMinutes,
    quantity: effectiveQuantity,
    unitPriceOverridden,
    manualUnitPrice: (unitPriceOverridden ? numberValue(manualUnitPrice, 0) : autoUnitPrice).toFixed(2),
    notes: lineNotes,
    materialSnapshots: {
      main: snapshotMaterialForSave(selectedMainMaterial),
      media: snapshotMaterialForSave(isRollStockBase ? undefined : selectedMedia),
      backing: snapshotMaterialForSave(backingApplicable && backingId !== "none" ? selectedBacking : undefined),
      laminate: snapshotMaterialForSave(selectedLaminate),
      smallStock: snapshotMaterialForSave(selectedSmallStock),
      smallCoating: snapshotMaterialForSave(selectedSmallCoating),
      eyelet: snapshotMaterialForSave(eyeletMaterial),
      componentParts: Array.from(new Map(componentParts
        .map((part) => materialPool.find((material) => material.id === part.materialId))
        .filter((material): material is QuoteMaterial => Boolean(material))
        .map((material) => [material.id, snapshotMaterialForSave(material) as SnapshotMaterial])).values())
    },
    pricingSnapshot: {
      markupMultiplier,
      profitMultiplier,
      labourRate,
      inkRatePerSqm,
      inkBillingIncrementSqm,
      monoRatePerSqm,
      rawCost,
      autoUnitPrice,
      priceLevelCode: pricingSettings?.priceLevelCode || "Level A",
      priceLevelName: pricingSettings?.priceLevelName || pricingSettings?.priceLevelCode || "Level A",
      priceLevelFactor,
      manualQuoteDiscountPercent,
      pricingBreakdown: costs.map((row) => ({ ...row }))
    }
  };

  const dispatchConfigurationSnapshot: QuickQuoteSnapshot = {
    version: 1,
    source: "quick_quote_builder",
    parentLineId: editingLine?.id ?? null,
    linkedAccessEquipmentLineId: initialSnapshot?.linkedAccessEquipmentLineId ?? null,
    builderMode: "quick",
    activeStep: "service_details",
    flowType: "service",
    serviceType,
    deliveryCharge,
    installCrewSize,
    installMinutes,
    installLabourBasis,
    travelCharge,
    accessEquipmentRequired,
    accessEquipmentType,
    accessEquipmentDailyCharge,
    accessEquipmentDays,
    serviceFixings,
    serviceFixingQty,
    serviceFixingRate,
    quantity: String(dispatchLineQuantity),
    unitPriceOverridden: false,
    manualUnitPrice: dispatchUnitPrice.toFixed(2),
    notes: "",
    materialSnapshots: { componentParts: [] },
    pricingSnapshot: {
      markupMultiplier,
      profitMultiplier,
      labourRate,
      rawCost: dispatchRawCost,
      autoUnitPrice: dispatchUnitPrice,
      priceLevelCode: pricingSettings?.priceLevelCode || "Level A",
      priceLevelName: pricingSettings?.priceLevelName || pricingSettings?.priceLevelCode || "Level A",
      priceLevelFactor,
      manualQuoteDiscountPercent,
      pricingBreakdown: dispatchCosts.map((row) => ({ ...row }))
    }
  };

  const accessEquipmentConfigurationSnapshot: QuickQuoteSnapshot = {
    version: 1,
    source: "quick_quote_builder",
    parentLineId: editingLine?.id ?? null,
    builderMode: "quick",
    activeStep: "service_details",
    flowType: "service",
    serviceType: "access_equipment",
    accessEquipmentRequired: true,
    accessEquipmentType,
    accessEquipmentDailyCharge,
    accessEquipmentDays,
    quantity: String(accessEquipmentDaysNumber),
    unitPriceOverridden: false,
    manualUnitPrice: accessEquipmentDailySellPrice.toFixed(2),
    notes: "",
    materialSnapshots: { componentParts: [] },
    pricingSnapshot: {
      markupMultiplier,
      profitMultiplier,
      labourRate,
      rawCost: accessEquipmentRawDailyCharge,
      autoUnitPrice: accessEquipmentDailySellPrice,
      priceLevelCode: pricingSettings?.priceLevelCode || "Level A",
      priceLevelName: pricingSettings?.priceLevelName || pricingSettings?.priceLevelCode || "Level A",
      priceLevelFactor,
      manualQuoteDiscountPercent,
      pricingBreakdown: [{
        label: "Access equipment",
        detail: accessEquipmentType.trim(),
        amount: 1,
        unit: "day",
        rate: accessEquipmentRawDailyCharge,
        cost: accessEquipmentRawDailyCharge,
        note: "Daily equipment cost before quote pricing"
      }]
    }
  };

  function renderDropLayoutControls(compact = false) {
    if (!activeRollMaterial) return null;
    const preview = dropLayoutPreview;
    const cardStyle = (selected: boolean) => ({
      border: selected ? "2px solid #ea580c" : "1px solid #d0d5dd",
      borderRadius: 12,
      background: selected ? "#fff7ed" : "#fff",
      minHeight: compact ? 42 : 74,
      padding: compact ? "8px 10px" : "10px 12px",
      display: "grid",
      gap: 3,
      textAlign: "left" as const,
      cursor: "pointer"
    });
    return (
      <div style={{ border: "1px solid #fed7aa", borderRadius: compact ? 14 : 18, padding: compact ? 10 : 14, background: "#fffaf5", display: "grid", gap: 10, gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", flexWrap: "wrap" }}>
          <div><strong>Drop / panel direction</strong><div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>Controls how wide roll jobs are split for printing, laminate and installation.</div></div>
          <span style={{ color: "#9a3412", fontSize: 12, fontWeight: 900 }}>{numberValue(activeRollMaterial.rollWidthMm, 0) > 0 ? `${dimensionMm(numberValue(activeRollMaterial.rollWidthMm, 0))}mm roll` : "Roll width not set"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {([
            ["auto", "Auto / best yield", "Uses the most efficient roll layout. Oversized wall panels default to vertical drops."],
            ["vertical", "Vertical drops", "Split across the wall width; each drop runs the finished wall height."],
            ["horizontal", "Horizontal strips", "Split across the wall height; each strip runs the finished wall width."]
          ] as Array<[DropDirection, string, string]>).map(([value, label, note]) => (
            <button key={value} type="button" onClick={() => { setDropDirection(value); setUnitPriceOverridden(false); }} style={cardStyle(dropDirection === value)}>
              <strong>{label}</strong>{!compact ? <span style={{ color: "#64748b", fontSize: 12, lineHeight: 1.35 }}>{note}</span> : null}
            </button>
          ))}
        </div>
        <label style={{ display: "grid", gap: 5, maxWidth: 260 }}><b>Overlap between drops mm</b><input value={dropOverlapMm} onChange={(event) => { setDropOverlapMm(event.target.value); setUnitPriceOverridden(false); }} type="number" min="0" step="1" style={inputStyle} /><small style={{ color: "#64748b" }}>0 = butt join / no overlap. Enter the printed overlap required between adjacent drops.</small></label>
        {preview ? <div style={{ borderRadius: 10, background: "#fff", border: "1px solid #fdba74", padding: "8px 10px", color: "#7c2d12", fontSize: 12 }}><strong>{preview.direction === "vertical" ? "INSTALL AS VERTICAL DROPS" : "INSTALL AS HORIZONTAL STRIPS"}</strong><br />{preview.note} · {usage(preview.totalLmPerFace)}lm per face before billing round-up.</div> : dropDirection === "auto" ? <div style={{ color: "#64748b", fontSize: 12 }}>Auto will choose the existing best-yield layout. If both finished dimensions exceed the roll width, PM uses vertical drops.</div> : null}
      </div>
    );
  }

  function renderCompactStep(stepOverride?: QuickQuoteStep) {
    const compactStep = stepOverride ?? activeStep;
    const compactGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 } as const;
    const compactPanel = { border: "1px solid #dbeafe", borderRadius: 14, background: "#f8fbff", padding: 12, display: "grid", gap: 10 } as const;
    const checkGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 } as const;
    const changed = () => setUnitPriceOverridden(false);

    if (compactStep === "flow") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Quote line type</b><select value={flowType} onChange={(event) => { setFlowType(event.target.value as FlowType); changed(); }} style={inputStyle}><option value="signage">Large format / signage</option><option value="small_format">Small format / print</option><option value="plan_printing">Plan printing</option><option value="poster_printing">Poster printing</option><option value="service">Pickup / delivery / install</option><option value="component">Custom component / assembly</option></select></label></div>;
    }

    if (compactStep === "base") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Base product</b><select value={baseType} onChange={(event) => { setBaseType(event.target.value as BaseType); setThickness(""); setColour(""); setMediaId(""); changed(); }} style={inputStyle}><option value="">Choose base</option>{baseTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>;
    }

    if (compactStep === "thickness" || compactStep === "colour") {
      const selectedId = selectedMainMaterial?.id ?? "";
      return <div style={compactPanel}>
        <label style={{ display: "grid", gap: 6 }}><b>Material / substrate</b><select value={selectedId} onChange={(event) => { const material = baseMaterials.find((item) => item.id === event.target.value); if (baseType === "banner") setMediaId(event.target.value); else { setThickness(material ? thicknessFor(material) : ""); setColour(material ? colourFor(material) : ""); } changed(); }} style={inputStyle}><option value="">Choose material</option>{baseMaterials.map((material) => <option key={material.id} value={material.id}>{internalMaterialName(material)}</option>)}</select></label>
        {selectedMainMaterial ? <small style={{ color: "#64748b" }}>{materialCardMeta(selectedMainMaterial)}</small> : null}
      </div>;
    }

    if (compactStep === "size" || compactStep === "small_size") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Preset finished size</b><select value={activeSizePresetValue} onChange={(event) => { const preset = activeSizePresets.find((item) => `${item.width}x${item.height}` === event.target.value); if (preset) { setWidthMm(preset.width); setHeightMm(preset.height); changed(); } }} style={inputStyle}><option value="">Custom size</option>{activeSizePresets.map((preset) => <option key={`${preset.label}-${preset.width}-${preset.height}`} value={`${preset.width}x${preset.height}`}>{preset.label}</option>)}</select></label><label style={{ display: "grid", gap: 6 }}><b>Width mm</b><input value={widthMm} onChange={(event) => { setWidthMm(event.target.value); changed(); }} type="number" min="0" step="1" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Height mm</b><input value={heightMm} onChange={(event) => { setHeightMm(event.target.value); changed(); }} type="number" min="0" step="1" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Bleed / spacing per side mm</b><input value={bleedSpacingMm} onChange={(event) => { setBleedSpacingMm(event.target.value); changed(); }} type="number" min="0" step="0.5" style={inputStyle} /></label></div>{nestingFootprintLabel ? <small style={{ color: "#64748b" }}>Material yield uses {nestingFootprintLabel}; client-facing finished size stays unchanged.</small> : null}{compactStep === "size" && isRollStockBase ? renderDropLayoutControls(true) : null}</div>;
    }

    if (compactStep === "artwork") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Artwork</b><select value={artworkChoice} onChange={(event) => { setArtworkChoice(event.target.value as ArtworkChoice); changed(); }} style={inputStyle}><option value="">Choose artwork</option><option value="client_supplied">Print-ready artwork supplied</option><option value="required">Artwork / setup required</option></select></label>{artworkChoice === "required" ? <label style={{ display: "grid", gap: 6 }}><b>Artwork minutes</b><input value={artworkMinutes} onChange={(event) => { setArtworkMinutes(event.target.value); changed(); }} type="number" min="0" step="0.5" style={inputStyle} /></label> : null}</div></div>;
    }

    if (compactStep === "print") {
      return <div style={compactPanel}><div style={compactGrid}>{!isRollStockBase ? <label style={{ display: "grid", gap: 6 }}><b>Print method</b><select value={printMethod} onChange={(event) => { setPrintMethod(event.target.value as PrintMethod); setInk(""); setMediaId(""); setPrintDirection(""); setBackingId(""); changed(); }} style={inputStyle}><option value="">Choose print method</option>{printMethods.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label> : <div><b>Print method</b><div style={{ marginTop: 6, fontWeight: 900 }}>Roll stock</div></div>}</div>{printed ? <InlineLabourField label="Print setup labour" value={printSetupMinutes} basis={printSetupLabourBasis} onChange={(value) => { setPrintSetupMinutes(value); changed(); }} onBasisChange={(basis) => { setPrintSetupLabourBasis(basis); changed(); }} labourRate={labourRate} quantity={quantityNumber} /> : null}</div>;
    }

    if (compactStep === "media") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>{resolvedPrintMethod === "cut_vinyl" ? "Cut vinyl" : "Roll stock / media"}</b><select value={mediaId} onChange={(event) => { setMediaId(event.target.value); setPrintDirection(""); setBackingId(""); changed(); }} style={inputStyle}><option value="">Choose roll material</option>{rollMedia.map((material) => <option key={material.id} value={material.id}>{internalMaterialName(material)}</option>)}</select></label>{activeRollMaterial ? renderDropLayoutControls(true) : null}</div>;
    }

    if (compactStep === "ink") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Ink</b><select value={ink} onChange={(event) => { setInk(event.target.value as InkChoice); changed(); }} style={inputStyle}><option value="">Choose ink</option>{availableInkChoices.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>;
    }

    if (compactStep === "sides" || compactStep === "small_sides") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Sides</b><select value={sides} onChange={(event) => { setSides(event.target.value as SidesChoice); changed(); }} style={inputStyle}><option value="">Choose sides</option><option value="single">Single sided</option><option value="double">Double sided</option></select></label>{compactStep === "sides" && canChooseReversePrint && printed ? <label style={{ display: "grid", gap: 6 }}><b>Print direction</b><select value={printDirection} onChange={(event) => { const direction = event.target.value as PrintDirection; setPrintDirection(direction); if (direction !== "reverse") setBackingId(""); changed(); }} style={inputStyle}><option value="">Choose direction</option><option value="positive">{selectedReversePrintableRoll && !isClearAcrylic ? "Standard print" : "Positive / face print"}</option><option value="reverse">Reverse print</option></select></label> : null}</div></div>;
    }

    if (compactStep === "laminate") {
      return <div style={compactPanel}><div style={compactGrid}>{backingApplicable ? <label style={{ display: "grid", gap: 6 }}><b>Backing</b><select value={backingSelectValue} onChange={(event) => { setBackingId(event.target.value); changed(); }} style={inputStyle}><option value="">Choose backing</option><option value="none">No backing</option>{backingGroups.map((group) => <option key={group.key} value={group.representative.id}>{group.label}</option>)}</select></label> : null}<label style={{ display: "grid", gap: 6 }}><b>Laminate</b><select value={laminateId} onChange={(event) => { setLaminateId(event.target.value); changed(); }} style={inputStyle}><option value="">Choose laminate</option><option value="none">No laminate</option>{laminateMaterials.map((material) => <option key={material.id} value={material.id}>{internalMaterialName(material)}</option>)}</select></label></div>{printed && laminateId && laminateId !== "none" ? <InlineLabourField label="Laminate labour" value={laminateMinutes} basis={laminateLabourBasis} onChange={(value) => { setLaminateMinutes(value); changed(); }} onBasisChange={(basis) => { setLaminateLabourBasis(basis); changed(); }} labourRate={labourRate} quantity={quantityNumber} /> : null}</div>;
    }

    if (compactStep === "finishing") {
      return <div style={compactPanel}><div style={checkGrid}>{finishingOptions.map((item) => <label key={item.key} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 850 }}><input type="checkbox" checked={finishings.includes(item.key)} onChange={() => { toggleFinishing(item.key); changed(); }} /><span>{item.label}</span></label>)}</div><SelectedLabourMinutes options={finishingOptions} selected={finishings} values={finishingMinutes} bases={finishingLabourBasis} onChange={(value) => { setFinishingMinutes(value); changed(); }} onBasesChange={(value) => { setFinishingLabourBasis(value); changed(); }} defaultBasis="line_total" eachLabelFor="eyelets" labourRate={labourRate} quantity={quantityNumber} />{finishings.includes("eyelets") ? <div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Eyelet preset</b><select value={eyeletPresetLabel} onChange={(event) => { setEyeletPresetLabel(event.target.value); changed(); }} style={inputStyle}>{eyeletPresets.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}</select></label><label style={{ display: "grid", gap: 6 }}><b>Custom eyelet qty</b><input value={customEyeletQty} onChange={(event) => { setCustomEyeletQty(event.target.value); changed(); }} type="number" min="0" step="1" style={inputStyle} /></label></div> : null}</div>;
    }

    if (compactStep === "small_type") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Print item</b><select value={smallType} onChange={(event) => { setSmallType(event.target.value as SmallFormatType); changed(); }} style={inputStyle}><option value="">Choose item</option>{smallFormatTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>;
    }

    if (compactStep === "ncr_details") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Copies / parts</b><input value={ncrCopies} onChange={(event) => { setNcrCopies(event.target.value); changed(); }} type="number" min="2" step="1" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Sets per book</b><input value={ncrSetsPerBook} onChange={(event) => { setNcrSetsPerBook(event.target.value); changed(); }} type="number" min="1" step="1" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Page colours</b><input value={ncrPageColours.join(", ")} onChange={(event) => { setNcrPageColours(event.target.value.split(",").map((item) => item.trim()).filter(Boolean)); changed(); }} style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Cover colour</b><input value={ncrCoverColour} onChange={(event) => { setNcrCoverColour(event.target.value); changed(); }} style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Tape colour</b><input value={ncrTapeColour} onChange={(event) => { setNcrTapeColour(event.target.value); changed(); }} style={inputStyle} /></label></div></div>;
    }

    if (compactStep === "small_stock") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Material / stock</b><select value={smallStockId} onChange={(event) => { setCustomSmallStockEnabled(false); setSmallStockId(event.target.value); changed(); }} style={inputStyle}><option value="">Choose stock</option>{departmentStocks.map((material) => <option key={material.id} value={material.id}>{internalMaterialName(material)}</option>)}</select></label>{customSmallStockEnabled ? <small style={{ color: "#b54708" }}>This line currently uses a custom stock. Choosing a library material will replace it.</small> : null}</div>;
    }

    if (compactStep === "small_print") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Print colour</b><select value={smallPrintColour} onChange={(event) => { setSmallPrintColour(event.target.value as SmallPrintColour); changed(); }} style={inputStyle}><option value="">Choose print</option><option value="mono">Mono</option><option value="cmyk">CMYK</option><option value="special">CMYK + special</option></select></label></div>;
    }

    if (compactStep === "small_coating") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Cello / coating</b><select value={smallCoatingId} onChange={(event) => { setSmallCoatingId(event.target.value); changed(); }} style={inputStyle}><option value="">Choose coating</option><option value="none">None</option>{laminateMaterials.map((material) => <option key={material.id} value={material.id}>{internalMaterialName(material)}</option>)}</select></label></div>;
    }

    if (compactStep === "small_finishing") {
      return <div style={compactPanel}><div style={checkGrid}>{smallFinishingOptions.map((item) => <label key={item.key} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 850 }}><input type="checkbox" checked={smallFinishings.includes(item.key)} onChange={() => { toggleSmallFinishing(item.key); changed(); }} /><span>{item.label}</span></label>)}</div><SelectedLabourMinutes options={smallFinishingOptions} selected={smallFinishings} values={smallFinishingMinutes} bases={smallFinishingLabourBasis} onChange={(value) => { setSmallFinishingMinutes(value); changed(); }} onBasesChange={(value) => { setSmallFinishingLabourBasis(value); changed(); }} defaultBasis={smallFinishingDefaultBasis} labourRate={labourRate} quantity={quantityNumber} /></div>;
    }

    if (compactStep === "small_quantity" || compactStep === "review") {
      return <div style={compactPanel}><div style={compactGrid}>{serviceType !== "access_equipment" ? <label style={{ display: "grid", gap: 6 }}><b>Quantity</b><input value={quantity} onChange={(event) => { setQuantity(event.target.value); changed(); }} type="number" min="1" step="any" style={inputStyle} /></label> : null}<label style={{ display: "grid", gap: 6 }}><b>Internal line notes</b><textarea value={lineNotes} onChange={(event) => setLineNotes(event.target.value)} style={textareaStyle} /></label></div></div>;
    }

    if (compactStep === "service_type") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Service</b><select value={serviceType} onChange={(event) => { setServiceType(event.target.value as ServiceType); changed(); }} style={inputStyle}><option value="">Choose service</option>{serviceTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>;
    }

    if (compactStep === "service_details" || compactStep === "dispatch") {
      const availableServiceTypes = flowType === "service" ? serviceTypes : dispatchServiceTypes;
      return (
        <div style={compactPanel}>
          <div style={compactGrid}>
            <label style={{ display: "grid", gap: 6 }}>
              <b>Pickup / delivery / install</b>
              <select value={serviceType} onChange={(event) => { setServiceType(event.target.value as ServiceType); changed(); }} style={inputStyle}>
                <option value="">Choose</option>
                {availableServiceTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            {serviceType === "delivery" ? (
              <label style={{ display: "grid", gap: 6 }}>
                <b>Delivery charge ($)</b>
                <input value={deliveryCharge} onChange={(event) => { setDeliveryCharge(event.target.value); changed(); }} placeholder="Dollar amount, eg 45.00" type="number" min="0" step="0.01" style={inputStyle} />
              </label>
            ) : null}
            {serviceType === "install" ? (
              <>
                <label style={{ display: "grid", gap: 6 }}>
                  <b>Installers</b>
                  <input value={installCrewSize} onChange={(event) => { setInstallCrewSize(event.target.value); changed(); }} type="number" min="1" step="1" style={inputStyle} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <b>Travel / call-out charge ($)</b>
                  <input value={travelCharge} onChange={(event) => { setTravelCharge(event.target.value); changed(); }} placeholder="Dollar amount, not minutes" type="number" min="0" step="0.01" style={inputStyle} />
                  <small style={{ color: "#64748b" }}>Enter the total dollar charge once for this quote line.</small>
                </label>
              </>
            ) : null}
          </div>

          {serviceType === "install" ? (
            <>
              <InstallLabourField value={installMinutes} basis={installLabourBasis} crewSize={installCrewSize} quantity={quantityNumber} labourRate={labourRate} onChange={(value) => { setInstallMinutes(value); changed(); }} onBasisChange={(basis) => { setInstallLabourBasis(basis); changed(); }} />
              <div style={{ border: "1px solid #bfdbfe", borderRadius: 14, background: "#eff6ff", padding: 12, display: "grid", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                  <input
                    type="checkbox"
                    checked={accessEquipmentRequired}
                    onChange={(event) => { setAccessEquipmentRequired(event.target.checked); changed(); }}
                  />
                  Is access equipment required?
                </label>
                {accessEquipmentRequired ? (
                  <div style={compactGrid}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <b>Type of equipment</b>
                      <input value={accessEquipmentType} onChange={(event) => { setAccessEquipmentType(event.target.value); changed(); }} placeholder="eg Scissor lift" style={inputStyle} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <b>Daily charge ($)</b>
                      <input value={accessEquipmentDailyCharge} onChange={(event) => { setAccessEquipmentDailyCharge(event.target.value); changed(); }} placeholder="Equipment cost per day" type="number" min="0" step="0.01" style={inputStyle} />
                      <small style={{ color: "#64748b" }}>Markup, profit and the client price level are applied automatically.</small>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <b>Number of days</b>
                      <input value={accessEquipmentDays} onChange={(event) => { setAccessEquipmentDays(event.target.value); changed(); }} type="number" min="1" step="1" style={inputStyle} />
                    </label>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {serviceType === "access_equipment" ? (
            <div style={compactGrid}>
              <label style={{ display: "grid", gap: 6 }}>
                <b>Type of equipment</b>
                <input value={accessEquipmentType} onChange={(event) => { setAccessEquipmentType(event.target.value); changed(); }} placeholder="eg Scissor lift" style={inputStyle} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <b>Daily charge ($)</b>
                <input value={accessEquipmentDailyCharge} onChange={(event) => { setAccessEquipmentDailyCharge(event.target.value); changed(); }} placeholder="Equipment cost per day" type="number" min="0" step="0.01" style={inputStyle} />
                <small style={{ color: "#64748b" }}>Markup, profit and the client price level are applied automatically.</small>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <b>Number of days</b>
                <input value={accessEquipmentDays} onChange={(event) => { setAccessEquipmentDays(event.target.value); changed(); }} type="number" min="1" step="1" style={inputStyle} />
              </label>
            </div>
          ) : null}
        </div>
      );
    }

    if (compactStep === "service_fixings") {
      return <div style={compactPanel}>{fixingOptions.map((item) => <div key={item.key} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) 120px 140px", gap: 8, alignItems: "center" }}><label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 850 }}><input type="checkbox" checked={serviceFixings.includes(item.key)} onChange={() => { toggleServiceFixing(item.key); changed(); }} />{item.label}</label>{serviceFixings.includes(item.key) ? <><input value={serviceFixingQty[item.key] ?? ""} onChange={(event) => { setServiceFixingQty({ ...serviceFixingQty, [item.key]: event.target.value }); changed(); }} placeholder={`Qty (${item.unit})`} type="number" min="0" step="0.01" style={inputStyle} /><input value={serviceFixingRate[item.key] ?? ""} onChange={(event) => { setServiceFixingRate({ ...serviceFixingRate, [item.key]: event.target.value }); changed(); }} placeholder="Cost each" type="number" min="0" step="0.01" style={inputStyle} /></> : <span />}</div>)}</div>;
    }

    if (compactStep === "component_details") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Component name</b><input value={componentName} onChange={(event) => { setComponentName(event.target.value); changed(); }} style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Description</b><textarea value={componentDescription} onChange={(event) => { setComponentDescription(event.target.value); changed(); }} style={textareaStyle} /></label></div></div>;
    }

    if (compactStep === "component_parts") {
      return <div style={compactPanel}>{componentParts.map((part, index) => <div key={part.id} style={{ border: "1px solid #fed7aa", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>Part {index + 1}</b><button type="button" onClick={() => removeComponentPart(part.id)} style={{ ...ghostButton, color: "#b42318", minHeight: 32 }}>Remove</button></div><div style={compactGrid}><select value={part.materialId} onChange={(event) => { const material = materialPool.find((item) => item.id === event.target.value); updateComponentPart(part.id, { materialId: event.target.value, name: part.name.trim() || material?.name || "", unit: material ? (isRollMaterial(material) ? "lm" : isSheetMaterial(material) ? "sheet" : "each") : part.unit }); changed(); }} style={inputStyle}><option value="">Custom part</option>{materialPool.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select><input value={part.name} onChange={(event) => { updateComponentPart(part.id, { name: event.target.value }); changed(); }} placeholder="Part name" style={inputStyle} /><input value={part.qty} onChange={(event) => { updateComponentPart(part.id, { qty: event.target.value }); changed(); }} placeholder="Qty" type="number" min="0" step="0.01" style={inputStyle} /><select value={part.unit} onChange={(event) => { updateComponentPart(part.id, { unit: event.target.value }); changed(); }} style={inputStyle}><option value="each">each</option><option value="lm">lm</option><option value="sheet">sheet</option><option value="sqm">sqm</option><option value="pack">pack</option></select><input value={part.unitCost} onChange={(event) => { updateComponentPart(part.id, { unitCost: event.target.value }); changed(); }} placeholder="Cost/unit" type="number" min="0" step="0.01" style={inputStyle} /></div></div>)}<button type="button" onClick={addComponentPart} style={ghostButton}>+ Add part</button></div>;
    }

    if (compactStep === "component_labour") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Labour label</b><input value={componentLabourLabel} onChange={(event) => { setComponentLabourLabel(event.target.value); changed(); }} style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Labour minutes</b><input value={componentLabourMinutes} onChange={(event) => { setComponentLabourMinutes(event.target.value); changed(); }} type="number" min="0" step="0.5" style={inputStyle} /></label></div></div>;
    }

    return <div style={compactPanel}><span style={{ color: "#64748b" }}>This component is stored in the structured quote snapshot and can be updated here.</span></div>;
  }

  const handleBuilderKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase();
    const isPlainEnter = event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;

    if (isPlainEnter && (tagName === "input" || tagName === "select")) {
      event.preventDefault();
    }
  };

  const handleBuilderSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!canSave) {
      event.preventDefault();
    }
  };

  const allSignageSteps: QuickQuoteStep[] = flowType === "service"
      ? ["flow", "service_type", "service_details", ...(serviceType === "install" ? ["service_fixings" as QuickQuoteStep] : []), "review"]
      : flowType === "component"
        ? ["flow", "component_details", "component_parts", "component_labour", "review"]
        : flowType === "small_format"
          ? ["flow", "small_type", ...(isDuplicateBook ? ["ncr_details" as QuickQuoteStep] : []), "small_stock", "small_size", "artwork", "small_print", "small_sides", "small_coating", "small_finishing", "dispatch", "small_quantity"]
          : isPrintDepartment
            ? ["flow", "small_stock", "small_size", "artwork", "small_print", "small_sides", "small_coating", "small_finishing", "dispatch", "small_quantity"]
            : [
              "flow",
              "base",
              "thickness",
              "size",
              "artwork",
              "print",
              ...(!isRollStockBase && needsMediaStep ? ["media" as QuickQuoteStep] : []),
              ...(needsInkStep ? ["ink" as QuickQuoteStep] : []),
              ...(printed ? ["sides" as QuickQuoteStep, "laminate" as QuickQuoteStep] : []),
              "finishing",
              "dispatch",
              "review",
            ];
    const allStepLabels: Partial<Record<QuickQuoteStep, string>> = {
      flow: "Quote line type",
      base: "Sign type",
      thickness: "Substrate / material",
      size: "Finished size",
      artwork: "Artwork",
      print: "Print method",
      media: "Roll stock / media",
      ink: "Ink",
      sides: "Sides / print direction",
      laminate: "Laminate / backing",
      finishing: "Finishing",
      small_type: "Print item",
      ncr_details: "NCR book details",
      small_stock: "Stock",
      small_size: "Finished size",
      small_print: "Print colour",
      small_sides: "Sides",
      small_coating: "Cello / coating",
      small_finishing: "Finishing",
      small_quantity: "Quantity and internal notes",
      service_type: "Service type",
      service_details: "Service details",
      service_fixings: "Fixings and consumables",
      component_details: "Component details",
      component_parts: "Materials and parts",
      component_labour: "Assembly labour",
      dispatch: "Pickup / delivery / install",
      review: "Quantity and internal notes",
    };
    return (
      <form action={addQuoteLineAction} onSubmit={handleBuilderSubmit} onKeyDown={handleBuilderKeyDown} style={{ display: "grid", gap: 12 }}>
        <input type="hidden" name="quoteId" value={quoteId} />
        {editingLine ? <input type="hidden" name="editingLineId" value={editingLine.id} /> : null}
        <input type="hidden" name="configurationSnapshot" value={JSON.stringify(configurationSnapshot)} />
        <input type="hidden" name="productName" value={editingLine?.productName || lineName} />
        <input type="hidden" name="optionSummary" value={optionSummary} />
        <input type="hidden" name="unitPrice" value={(unitPriceOverridden ? numberValue(manualUnitPrice, 0) : autoUnitPrice).toFixed(2)} />
        <input type="hidden" name="quantity" value={effectiveQuantity} />
        <input type="hidden" name="notes" value={lineNotes} />
        {shouldCreateDispatchLine ? (
          <>
            <input type="hidden" name="serviceLineProductName" value={serviceType === "install" ? "Sign Install" : "Delivery"} />
            <input type="hidden" name="serviceLineOptionSummary" value={dispatchSummary} />
            <input type="hidden" name="serviceLineUnitPrice" value={dispatchUnitPrice.toFixed(2)} />
            <input type="hidden" name="serviceLineQuantity" value={String(dispatchLineQuantity)} />
            <input type="hidden" name="serviceLineConfigurationSnapshot" value={JSON.stringify(dispatchConfigurationSnapshot)} />
          </>
        ) : null}
        {shouldCreateAccessEquipmentLine ? (
          <>
            <input type="hidden" name="accessEquipmentLineProductName" value={`Access Equipment - ${accessEquipmentType.trim()}`} />
            <input type="hidden" name="accessEquipmentLineOptionSummary" value={accessEquipmentSummary} />
            <input type="hidden" name="accessEquipmentLineUnitPrice" value={accessEquipmentDailySellPrice.toFixed(2)} />
            <input type="hidden" name="accessEquipmentLineQuantity" value={String(accessEquipmentDaysNumber)} />
            <input type="hidden" name="accessEquipmentLineConfigurationSnapshot" value={JSON.stringify(accessEquipmentConfigurationSnapshot)} />
          </>
        ) : null}

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ borderRadius: 14, background: "#eff6ff", border: "1px solid #bfdbfe", padding: "12px 14px" }}>
            <strong style={{ color: "#1d4ed8" }}>Configure the complete quote line</strong>
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>Make every required selection below. Nothing is submitted until you press Save Quote Line.</div>
          </div>
          {allSignageSteps.map((step, index) => (
            <section key={step} style={{ display: "grid", gap: 7 }}>
              <strong style={{ color: "#344054", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>{index + 1}. {allStepLabels[step] ?? step.replaceAll("_", " ")}</strong>
              {renderCompactStep(step)}
            </section>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em" }}>Updated price</span>
            <strong>{money(unitPrice)} each · {money(lineTotal)} line total</strong>
            {shouldCreateDispatchLine ? <span style={{ color: "#9a3412", fontSize: 12, fontWeight: 850 }}>Plus {serviceType === "install" ? "Sign Install" : "Delivery"}: qty {usage(dispatchLineQuantity)} × {money(dispatchUnitPrice)} = {money(dispatchLineTotal)}</span> : null}
            {shouldCreateAccessEquipmentLine ? <span style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 850 }}>Plus Access Equipment - {accessEquipmentType.trim()}: {usage(accessEquipmentDaysNumber)} day{accessEquipmentDaysNumber === 1 ? "" : "s"} × {money(accessEquipmentDailySellPrice)} = {money(accessEquipmentLineTotal)}</span> : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" disabled={!canSave} style={{ ...primaryButton, minHeight: 40, opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}>{canSave ? "Save Quote Line" : "Complete required fields"}</button>
          </div>
        </div>
      </form>
    );
}

function labourPreviewText(minutes: number, basis: LabourBasis, labourRate: number, quantity: number, perItemLabel = "per item"): string {
  if (minutes <= 0) return "Leave blank or enter 0 to add no labour charge.";
  const totalMinutes = basis === "per_item" ? minutes * Math.max(1, quantity) : minutes;
  const totalCost = totalMinutes * (labourRate / 60);
  return basis === "per_item"
    ? `${minutesLabel(minutes)} ${perItemLabel} × qty ${usage(Math.max(1, quantity))} = ${minutesLabel(totalMinutes)} total · ${money(totalCost)} labour`
    : `${minutesLabel(minutes)} for the whole line · ${money(totalCost)} labour`;
}

function InlineLabourField({ label, value, basis, onChange, onBasisChange, labourRate, quantity, perItemLabel = "Per item" }: { label: string; value: string; basis: LabourBasis; onChange: (value: string) => void; onBasisChange: (basis: LabourBasis) => void; labourRate: number; quantity: number; perItemLabel?: string }) {
  const enteredMinutes = numberValue(value, 0);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <b>{label} (optional)</b>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 170px", gap: 8 }}>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Minutes, eg 0.5" type="number" min="0" step="0.5" style={inputStyle} />
        <select value={basis} onChange={(event) => onBasisChange(event.target.value as LabourBasis)} style={inputStyle}>
          <option value="line_total">Total line item</option>
          <option value="per_item">{perItemLabel}</option>
        </select>
      </div>
      <small style={{ color: "#64748b" }}>{labourPreviewText(enteredMinutes, basis, labourRate, quantity, perItemLabel.toLowerCase())}</small>
    </div>
  );
}

function InstallLabourField({ value, basis, crewSize, quantity, labourRate, onChange, onBasisChange }: { value: string; basis: LabourBasis; crewSize: string; quantity: number; labourRate: number; onChange: (value: string) => void; onBasisChange: (basis: LabourBasis) => void }) {
  const minutes = numberValue(value, 0);
  const crew = Math.max(1, numberValue(crewSize, 1));
  const safeQuantity = Math.max(1, quantity);
  const totalSiteMinutes = basis === "per_item" ? minutes * safeQuantity : minutes;
  const personMinutes = totalSiteMinutes * crew;
  const labourCost = personMinutes * (labourRate / 60);
  const preview = minutes <= 0
    ? "Enter the installation time, then choose whether it covers the complete line or each quoted item."
    : basis === "per_item"
      ? `${minutesLabel(minutes)} per item × qty ${usage(safeQuantity)} × ${usage(crew)} installer${crew === 1 ? "" : "s"} = ${minutesLabel(personMinutes)} person-time · ${money(labourCost)} labour`
      : `${minutesLabel(minutes)} for the complete line × ${usage(crew)} installer${crew === 1 ? "" : "s"} = ${minutesLabel(personMinutes)} person-time · ${money(labourCost)} labour`;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <b>Install labour time</b>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 170px", gap: 8 }}>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Minutes, eg 60" type="number" min="0" step="0.5" style={inputStyle} />
        <select value={basis} onChange={(event) => onBasisChange(event.target.value as LabourBasis)} style={inputStyle}>
          <option value="line_total">Total line item</option>
          <option value="per_item">Per item</option>
        </select>
      </div>
      <small style={{ color: "#64748b" }}>{preview}</small>
    </div>
  );
}

function SelectedLabourMinutes<T extends { key: string; label: string }>({ options, selected, values, bases, onChange, onBasesChange, defaultBasis, eachLabelFor, labourRate, quantity }: { options: T[]; selected: string[]; values: Record<string, string>; bases: Record<string, LabourBasis>; onChange: (value: Record<string, string>) => void; onBasesChange: (value: Record<string, LabourBasis>) => void; defaultBasis: LabourBasis; eachLabelFor?: string; labourRate: number; quantity: number }) {
  const chosen = options.filter((item) => selected.includes(item.key));
  if (chosen.length === 0) return null;
  return (
    <div style={{ border: "1px solid #dbeafe", borderRadius: 20, padding: 14, background: "#f8fbff", display: "grid", gap: 10 }}>
      <strong>Labour for selected finishing</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
        {chosen.map((item) => {
          const isEach = item.key === eachLabelFor;
          const basis = bases[item.key] ?? (isEach ? "per_item" : defaultBasis);
          const enteredMinutes = numberValue(values[item.key], 0);
          const perItemLabel = isEach ? "Per eyelet" : "Per item";
          return (
            <div key={item.key} style={{ display: "grid", gap: 6 }}>
              <b>{item.label} labour</b>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 155px", gap: 8 }}>
                <input value={values[item.key] ?? ""} onChange={(event) => onChange({ ...values, [item.key]: event.target.value })} placeholder="Minutes, eg 0.5" type="number" min="0" step="0.5" style={inputStyle} />
                <select value={basis} onChange={(event) => onBasesChange({ ...bases, [item.key]: event.target.value as LabourBasis })} style={inputStyle}>
                  <option value="line_total">Total line item</option>
                  <option value="per_item">{perItemLabel}</option>
                </select>
              </div>
              <small style={{ color: "#64748b" }}>{isEach && basis === "per_item" ? `${minutesLabel(enteredMinutes)} per eyelet; multiplied by eyelet count and quote quantity.` : labourPreviewText(enteredMinutes, basis, labourRate, quantity, "per item")}</small>
            </div>
          );
        })}
      </div>
      <span style={{ color: "#475467", fontSize: 13 }}>Decimal minutes are supported: 0.5 = 30 seconds. Total line item charges the entered time once for the complete quantity.</span>
    </div>
  );
}
