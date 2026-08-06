"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { addQuoteLineAction } from "./actions";
import { QuoteLineBuilder } from "./QuoteLineBuilder";
import { materialsFromSnapshot, readQuickQuoteSnapshot, type QuickQuoteFlowType, type QuickQuoteSnapshot, type QuickQuoteStep, type SnapshotMaterial } from "./quoteLineSnapshot";

type QuoteMaterial = {
  id: string;
  name: string;
  materialType?: string | null;
  materialGroup?: string | null;
  minimumBillableSheetFraction?: string | null;
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

type ClientDiscountRule = {
  productType: string;
  minQty: number;
  maxQty?: number | null;
  discountPercent: number;
  note?: string;
};

type PricingSettings = {
  markupMultiplier?: string | number | null;
  profitMultiplier?: string | number | null;
  labourRate?: string | number | null;
  inkRatePerSqm?: string | number | null;
  monoRatePerSqm?: string | number | null;
  signageSizePresets?: QuoteSizePreset[] | null;
  smallSizePresets?: QuoteSizePreset[] | null;
  clientDefaultDiscountPercent?: string | number | null;
  clientDiscountRules?: ClientDiscountRule[] | null;
};

type SavedQuoteChoice = {
  id?: string | null;
  label?: string | null;
  value?: string | null;
  widthMm?: string | null;
  heightMm?: string | null;
};

type SavedQuoteQuestion = {
  id?: string | null;
  key: string;
  label: string;
  type: string;
  required?: boolean;
  defaultValue?: string | null;
  helpText?: string | null;
  options?: SavedQuoteChoice[];
  showWhen?: {
    optionKey?: string | null;
    optionValues?: string[] | null;
  } | null;
};

type SavedQuoteComponent = {
  id?: string | null;
  label?: string | null;
  kind?: string | null;
  materialId?: string | null;
  quantity?: string | null;
  unit?: string | null;
  ruleType?: string | null;
  wastePercent?: string | null;
  notes?: string | null;
  stockUsage?: {
    usageBasis?: string | null;
    dimensionSource?: string | null;
    optionKey?: string | null;
    optionValues?: string[] | null;
    widthMm?: string | null;
    heightMm?: string | null;
    rollWidthMm?: string | null;
    partsPerSheet?: string | null;
    metresPerUnit?: string | null;
    sheetsPerUnit?: string | null;
    sellRate?: string | null;
    chargeName?: string | null;
    quantitySource?: string | null;
    quantityPrompt?: string | null;
    quantityPresets?: Array<{ id?: string | null; label?: string | null; value?: string | null; qty?: string | number | null }> | null;
    allowCustomQuantity?: boolean | null;
    customQuantityLabel?: string | null;
    quantityOptionKey?: string | null;
    quantityCustomFieldKey?: string | null;
    quantityValueMap?: Record<string, string | number | null> | null;
    quantityUnitLabel?: string | null;
  } | null;
  trigger?: {
    optionKey?: string | null;
    optionValues?: string[] | null;
  } | null;
};

type SavedQuoteProduct = {
  id: string;
  name: string;
  sku?: string | null;
  fields: SavedQuoteQuestion[];
  components: SavedQuoteComponent[];
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
  savedProducts?: SavedQuoteProduct[];
  editingLine?: EditableQuoteLine | null;
  editingStep?: QuickQuoteStep | null;
};

type FlowType = QuickQuoteFlowType;
type BaseType = "acrylic" | "acm" | "corflute" | "pvc" | "banner" | "other_sheet";
type SmallFormatType = "business_cards" | "flyers" | "brochures" | "booklets" | "duplicate_books" | "stickers";
type ServiceType = "" | "pickup" | "delivery" | "install";
type BuilderMode = "quick" | "saved" | "advanced";
type PrintMethod = "" | "no_print" | "direct_print" | "roll_stock" | "cut_vinyl";
type InkChoice = "" | "cmyk" | "white" | "both";
type SidesChoice = "" | "single" | "double";
type PrintDirection = "" | "positive" | "reverse";
type ArtworkChoice = "" | "required" | "client_supplied";
type SmallPrintColour = "" | "mono" | "cmyk" | "special";
type StepKey = QuickQuoteStep;

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
  { key: "install", label: "Install", icon: "⚒", description: "Charge install time by crew size, minutes and fixing consumables." }
];

const fixingOptions = [
  { key: "silicone", label: "Silicone", icon: "◍", unit: "tube", placeholderQty: "eg 1", placeholderRate: "eg 12" },
  { key: "tape", label: "VHB / double-sided tape", icon: "═", unit: "lm", placeholderQty: "eg 3", placeholderRate: "eg 2.5" },
  { key: "screws", label: "Screws / anchors", icon: "•", unit: "each", placeholderQty: "eg 12", placeholderRate: "eg 0.25" },
  { key: "screws_custom", label: "Screms / special fixings", icon: "✦", unit: "each", placeholderQty: "eg 4", placeholderRate: "eg 1" },
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
const darkButton = { minHeight: 46, borderRadius: 16, border: "none", background: "#0f172a", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 18px" };
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
  return `${roundedMinutes}min`;
}

function multiplierValue(value: string | number | null | undefined, fallback: number): number {
  const amount = numberValue(value, fallback);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function normaliseProductType(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function resolveClientDiscountPercent(input: {
  rules?: ClientDiscountRule[] | null;
  defaultDiscount?: string | number | null;
  productTypes: string[];
  quantity: number;
}): { percent: number; reason: string } {
  const productKeys = input.productTypes.map(normaliseProductType).filter(Boolean);
  const quantity = Math.max(1, input.quantity || 1);
  const matchingRules = (input.rules ?? []).filter((rule) => {
    const ruleKey = normaliseProductType(String(rule.productType ?? ""));
    const minQty = Number(rule.minQty ?? 0);
    const maxQty = rule.maxQty == null ? null : Number(rule.maxQty);
    const percent = Number(rule.discountPercent ?? 0);
    if (!ruleKey || !Number.isFinite(percent) || percent <= 0) return false;
    const productMatches = productKeys.some((key) => key === ruleKey || key.includes(ruleKey) || ruleKey.includes(key));
    const qtyMatches = quantity >= (Number.isFinite(minQty) ? minQty : 0) && (maxQty == null || !Number.isFinite(maxQty) || quantity <= maxQty);
    return productMatches && qtyMatches;
  }).sort((a, b) => Number(b.discountPercent ?? 0) - Number(a.discountPercent ?? 0));

  const best = matchingRules[0];
  if (best) return { percent: Math.max(0, Number(best.discountPercent)), reason: `${best.productType} qty ${usage(quantity)} rule` };

  const fallback = Number(input.defaultDiscount ?? 0);
  return Number.isFinite(fallback) && fallback > 0 ? { percent: fallback, reason: "client default discount" } : { percent: 0, reason: "" };
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
  return `${material.name} ${material.materialType ?? ""} ${material.materialGroup ?? ""} ${material.gsm ?? ""} ${material.notes ?? ""}`.toLowerCase();
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

function roundedRollMetresForQuantity(widthMm: number, heightMm: number, material: QuoteMaterial, pieces: number): { amount: number; unroundedAmount: number; note?: string } {
  const rollWidthMm = numberValue(material.rollWidthMm, 0);
  const pieceCount = Math.max(1, Math.ceil(pieces));
  if (widthMm <= 0 || heightMm <= 0) return { amount: 0, unroundedAmount: 0, note: "size missing" };

  if (rollWidthMm <= 0) {
    const single = linearMetres(widthMm, heightMm, material);
    const unroundedAmount = single.amount * pieceCount;
    const amount = unroundedAmount > 0 ? Math.max(1, Math.ceil(unroundedAmount)) : 0;
    return { amount, unroundedAmount, note: ["roll width missing", `${usage(unroundedAmount)}lm before whole-metre rounding`].join(" · ") };
  }

  // When neither finished dimension fits the roll, keep the entered width as the
  // panelled direction. Example: 2000 × 4000mm on a 1370mm roll becomes
  // 2 panels at 1000 × 4000mm = 8lm before whole-metre rounding.
  if (widthMm > rollWidthMm && heightMm > rollWidthMm) {
    const panelised = panelisedRollMetres(widthMm, heightMm, rollWidthMm);
    const totalPanels = panelised.panels * pieceCount;
    const panelsAcross = Math.max(1, Math.floor(rollWidthMm / panelised.panelWidthMm));
    const rows = Math.ceil(totalPanels / panelsAcross);
    const unroundedAmount = (rows * heightMm) / 1000;
    const amount = unroundedAmount > 0 ? Math.max(1, Math.ceil(unroundedAmount)) : 0;
    return {
      amount,
      unroundedAmount,
      note: [
        panelised.note,
        `${totalPanels} panel${totalPanels === 1 ? "" : "s"} nested ${panelsAcross} across × ${rows} row${rows === 1 ? "" : "s"}`,
        `${usage(unroundedAmount)}lm before whole-metre rounding`,
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
    const amount = unroundedAmount > 0 ? Math.max(1, Math.ceil(unroundedAmount)) : 0;
    return { amount, unroundedAmount, note: [single.note, "panelled wider-than-roll print", `${usage(unroundedAmount)}lm before whole-metre rounding`].filter(Boolean).join(" · ") };
  }

  const best = layouts.sort((a, b) => a.unroundedAmount - b.unroundedAmount)[0];
  const amount = best.unroundedAmount > 0 ? Math.max(1, Math.ceil(best.unroundedAmount)) : 0;
  return {
    amount,
    unroundedAmount: best.unroundedAmount,
    note: [
      `${pieceCount} face${pieceCount === 1 ? "" : "s"} nested ${best.across} across × ${best.rows} row${best.rows === 1 ? "" : "s"}`,
      best.rotated ? "rotated to save roll length" : null,
      `${usage(best.unroundedAmount)}lm before whole-metre rounding`,
      `charged as ${usage(amount)}lm`
    ].filter(Boolean).join(" · ")
  };
}


function roundedInkSquareMetresForQuoteLine(
  areaPerItemSqm: number,
  sideMultiplier: number,
  quantity: number,
  rollUsage?: { amount: number; unroundedAmount: number } | null
): { amount: number; calculatedTotal: number; mediaAdjustedTotal: number; billableTotal: number; note?: string } {
  const safeQuantity = Math.max(1, quantity);
  const calculatedTotal = Math.max(0, areaPerItemSqm) * Math.max(1, sideMultiplier) * safeQuantity;
  const rollRoundingMultiplier = rollUsage && rollUsage.unroundedAmount > 0
    ? Math.max(1, rollUsage.amount / rollUsage.unroundedAmount)
    : 1;
  const mediaAdjustedTotal = calculatedTotal * rollRoundingMultiplier;
  const billableTotal = mediaAdjustedTotal > 0 ? Math.max(1, Math.ceil(mediaAdjustedTotal - 0.0000001)) : 0;

  return {
    amount: billableTotal / safeQuantity,
    calculatedTotal,
    mediaAdjustedTotal,
    billableTotal,
    note: calculatedTotal > 0
      ? [
          `${usage(calculatedTotal)}sqm artwork area`,
          rollRoundingMultiplier > 1.0000001 ? `${usage(mediaAdjustedTotal)}sqm after whole-metre media rounding` : null,
          "whole-square-metre ink rounding",
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
    materialType: material.materialType ?? null,
    materialGroup: material.materialGroup ?? null,
    minimumBillableSheetFraction: material.minimumBillableSheetFraction ?? null,
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

function cardButtonStyle(selected: boolean, accent = "#2563eb") {
  return {
    border: selected ? `2px solid ${accent}` : "1px solid #dbe5f3",
    borderRadius: 22,
    padding: 16,
    background: selected ? "linear-gradient(135deg, #eff6ff, #ffffff)" : "#ffffff",
    boxShadow: selected ? "0 16px 34px rgba(37,99,235,0.14)" : "0 10px 26px rgba(15,23,42,0.05)",
    textAlign: "left" as const,
    cursor: "pointer",
    display: "grid",
    gap: 8,
    minHeight: 122,
    color: "#0f172a"
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

export function QuoteMaterialFlowBuilder({ quoteId, materials, pricingSettings, savedProducts = [], editingLine = null, editingStep = null }: QuoteMaterialFlowBuilderProps) {
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

  const [builderMode, setBuilderMode] = useState<BuilderMode>(editingLine ? "advanced" : initialSnapshot?.builderMode ?? "quick");
  const [activeStep, setActiveStep] = useState<StepKey>(editingStep ?? initialSnapshot?.activeStep ?? (initialSnapshot?.flowType === "service" ? "service_type" : initialSnapshot?.flowType === "small_format" ? "small_type" : initialSnapshot?.flowType === "plan_printing" || initialSnapshot?.flowType === "poster_printing" ? "small_stock" : "base"));
  const [flowType, setFlowType] = useState<FlowType>(initialSnapshot?.flowType || "signage");
  const isPrintDepartment = isPrintDepartmentFlow(flowType);

  const [baseType, setBaseType] = useState<BaseType | "">(snapshotString(initialSnapshot, "baseType") as BaseType | "");
  const [thickness, setThickness] = useState(snapshotString(initialSnapshot, "thickness"));
  const [colour, setColour] = useState(snapshotString(initialSnapshot, "colour"));
  const [widthMm, setWidthMm] = useState(snapshotString(initialSnapshot, "widthMm"));
  const [heightMm, setHeightMm] = useState(snapshotString(initialSnapshot, "heightMm"));
  const [artworkChoice, setArtworkChoice] = useState<ArtworkChoice>(snapshotString(initialSnapshot, "artworkChoice") as ArtworkChoice);
  const [artworkMinutes, setArtworkMinutes] = useState(snapshotString(initialSnapshot, "artworkMinutes"));
  const [printMethod, setPrintMethod] = useState<PrintMethod>(snapshotString(initialSnapshot, "printMethod") as PrintMethod);
  const [printSetupMinutes, setPrintSetupMinutes] = useState(snapshotString(initialSnapshot, "printSetupMinutes"));
  const [mediaId, setMediaId] = useState(snapshotString(initialSnapshot, "mediaId"));
  const [ink, setInk] = useState<InkChoice>(snapshotString(initialSnapshot, "ink") as InkChoice);
  const [sides, setSides] = useState<SidesChoice>(snapshotString(initialSnapshot, "sides") as SidesChoice);
  const [printDirection, setPrintDirection] = useState<PrintDirection>(snapshotString(initialSnapshot, "printDirection") as PrintDirection);
  const [laminateId, setLaminateId] = useState(snapshotString(initialSnapshot, "laminateId"));
  const [laminateMinutes, setLaminateMinutes] = useState(snapshotString(initialSnapshot, "laminateMinutes"));
  const [finishings, setFinishings] = useState<string[]>(snapshotStringArray(initialSnapshot, "finishings"));
  const [finishingMinutes, setFinishingMinutes] = useState<Record<string, string>>(snapshotStringRecord(initialSnapshot, "finishingMinutes"));
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

  const [serviceType, setServiceType] = useState<ServiceType>(snapshotString(initialSnapshot, "serviceType") as ServiceType);
  const [deliveryCharge, setDeliveryCharge] = useState(snapshotString(initialSnapshot, "deliveryCharge"));
  const [installCrewSize, setInstallCrewSize] = useState(snapshotString(initialSnapshot, "installCrewSize", "1"));
  const [installMinutes, setInstallMinutes] = useState(snapshotString(initialSnapshot, "installMinutes"));
  const [travelCharge, setTravelCharge] = useState(snapshotString(initialSnapshot, "travelCharge"));
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
  const monoRatePerSqm = numberValue(pricingSettings?.monoRatePerSqm, defaultMonoRatePerSqm);
  const signageSizePresets = useMemo(() => normaliseSizePresets(pricingSettings?.signageSizePresets, defaultSignageSizePresets), [pricingSettings?.signageSizePresets]);
  const smallSizePresets = useMemo(() => normaliseSizePresets(pricingSettings?.smallSizePresets, defaultSmallSizePresets), [pricingSettings?.smallSizePresets]);
  const planSizePresets = useMemo(() => defaultPlanSizePresets, []);
  const posterSizePresets = useMemo(() => defaultPosterSizePresets, []);
  const inkChoices = useMemo<Array<{ key: Exclude<InkChoice, "">; label: string; icon: string; description: string }>>(() => [
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
  const resolvedPrintMethod: PrintMethod = isRollStockBase ? "roll_stock" : printMethod;
  const printed = resolvedPrintMethod !== "" && resolvedPrintMethod !== "no_print";
  const needsMediaStep = isRollStockBase || resolvedPrintMethod === "roll_stock" || resolvedPrintMethod === "cut_vinyl";
  const needsAdditionalMediaCost = !isRollStockBase && (resolvedPrintMethod === "roll_stock" || resolvedPrintMethod === "cut_vinyl");
  const needsInkStep = resolvedPrintMethod === "direct_print" || resolvedPrintMethod === "roll_stock";
  const width = numberValue(widthMm, 0);
  const height = numberValue(heightMm, 0);
  const areaSqm = width > 0 && height > 0 ? (width / 1000) * (height / 1000) : 0;
  const sideMultiplier = sides === "double" ? 2 : 1;
  const quantityNumber = Math.max(1, numberValue(quantity, 1));
  const pricedComponentParts = componentParts.filter((part) => {
    const qty = numberValue(part.qty, 0);
    const material = materialPool.find((item) => item.id === part.materialId);
    const rate = part.unitCost.trim() ? numberValue(part.unitCost, 0) : rateForComponentUnit(material, part.unit).rate;
    return qty > 0 && rate > 0 && (part.name.trim() || material);
  });
  const componentHasCost = pricedComponentParts.length > 0 || numberValue(componentLabourMinutes, 0) > 0;

  const steps = useMemo(() => {
    const next: Array<{ key: StepKey; label: string; complete: boolean; icon: string }> = [
      { key: "flow", label: "Type", complete: Boolean(flowType), icon: "1" }
    ];

    if (flowType === "service") {
      next.push({ key: "service_type", label: "Service", complete: Boolean(serviceType), icon: "2" });
      next.push({ key: "service_details", label: serviceType === "install" ? "Crew / time" : serviceType === "delivery" ? "Charge" : "Details", complete: serviceType === "pickup" || (serviceType === "delivery" && numberValue(deliveryCharge, 0) >= 0) || (serviceType === "install" && numberValue(installCrewSize, 0) > 0 && numberValue(installMinutes, 0) > 0), icon: "3" });
      if (serviceType === "install") next.push({ key: "service_fixings", label: "Fixings", complete: true, icon: "4" });
      next.push({ key: "review", label: "Review", complete: Boolean(serviceType), icon: "✓" });
      return next;
    }

    if (flowType === "component") {
      next.push({ key: "component_details", label: "Component", complete: Boolean(componentName.trim()), icon: "2" });
      next.push({ key: "component_parts", label: "Parts", complete: pricedComponentParts.length > 0, icon: "3" });
      next.push({ key: "component_labour", label: "Labour", complete: true, icon: "4" });
      next.push({ key: "review", label: "Review", complete: Boolean(componentName.trim() && componentHasCost), icon: "✓" });
      return next;
    }


    if (isPrintDepartment) {
      next.push({ key: "small_stock", label: "Stock", complete: Boolean(selectedSmallStock), icon: "2" });
      next.push({ key: "small_size", label: "Size", complete: width > 0 && height > 0, icon: "3" });
      next.push({ key: "artwork", label: "Artwork", complete: Boolean(artworkChoice), icon: "4" });
      next.push({ key: "small_sides", label: "Sides", complete: Boolean(sides), icon: "5" });
      next.push({ key: "small_print", label: "Print colour", complete: Boolean(smallPrintColour), icon: "6" });
      next.push({ key: "small_coating", label: "Coating", complete: Boolean(smallCoatingId), icon: "7" });
      next.push({ key: "small_finishing", label: "Finishing", complete: true, icon: "8" });
      next.push({ key: "small_quantity", label: "Quantity", complete: quantityNumber > 0, icon: "9" });
      next.push({ key: "dispatch", label: "Dispatch", complete: Boolean(serviceType && (serviceType === "pickup" || (serviceType === "delivery" && numberValue(deliveryCharge, 0) > 0) || (serviceType === "install" && numberValue(installCrewSize, 0) > 0 && numberValue(installMinutes, 0) > 0))), icon: "→" });
      next.push({ key: "review", label: "Review", complete: Boolean(selectedSmallStock && width > 0 && height > 0 && artworkChoice && sides && smallPrintColour && smallCoatingId && serviceType), icon: "✓" });
      return next;
    }

    if (flowType === "small_format") {
      next.push({ key: "small_type", label: "Print item", complete: Boolean(smallType), icon: "2" });
      if (isDuplicateBook) next.push({ key: "ncr_details", label: "Book details", complete: ncrDetailsComplete, icon: "3" });
      next.push({ key: "small_stock", label: "Stock", complete: Boolean(selectedSmallStock), icon: isDuplicateBook ? "4" : "3" });
      next.push({ key: "small_size", label: "Size", complete: width > 0 && height > 0, icon: isDuplicateBook ? "5" : "4" });
      next.push({ key: "artwork", label: "Artwork", complete: Boolean(artworkChoice), icon: isDuplicateBook ? "6" : "5" });
      if (!isDuplicateBook) {
        next.push({ key: "small_sides", label: "Sides", complete: Boolean(sides), icon: "6" });
        next.push({ key: "small_print", label: "Print colour", complete: Boolean(smallPrintColour), icon: "7" });
        next.push({ key: "small_coating", label: "Coating", complete: Boolean(smallCoatingId), icon: "8" });
      }
      next.push({ key: "small_finishing", label: "Finishing", complete: true, icon: isDuplicateBook ? "7" : "9" });
      next.push({ key: "small_quantity", label: "Quantity", complete: quantityNumber > 0, icon: isDuplicateBook ? "8" : "10" });
      next.push({ key: "dispatch", label: "Dispatch", complete: Boolean(serviceType && (serviceType === "pickup" || (serviceType === "delivery" && numberValue(deliveryCharge, 0) > 0) || (serviceType === "install" && numberValue(installCrewSize, 0) > 0 && numberValue(installMinutes, 0) > 0))), icon: "→" });
      next.push({ key: "review", label: "Review", complete: Boolean(smallType && ncrDetailsComplete && selectedSmallStock && width > 0 && height > 0 && artworkChoice && (isDuplicateBook || (sides && smallPrintColour && smallCoatingId)) && serviceType), icon: "✓" });
      return next;
    }

    if (flowType === "signage") {
      next.push({ key: "base", label: "Base material", complete: Boolean(baseType), icon: "2" });
      if (isRollStockBase) {
        next.push({ key: "media", label: "Roll stock", complete: Boolean(mediaId && selectedMainMaterial), icon: "3" });
      } else {
        next.push({ key: "thickness", label: "Thickness", complete: Boolean(thickness), icon: "3" });
        next.push({ key: "colour", label: "Colour", complete: Boolean(colour && selectedMainMaterial), icon: "4" });
      }
      next.push({ key: "size", label: "Size", complete: width > 0 && height > 0, icon: "5" });
      next.push({ key: "artwork", label: "Artwork", complete: Boolean(artworkChoice), icon: "6" });
      next.push({ key: "print", label: isRollStockBase ? "Print setup" : "Print method", complete: Boolean(resolvedPrintMethod), icon: "7" });
      if (!isRollStockBase && needsMediaStep) next.push({ key: "media", label: resolvedPrintMethod === "cut_vinyl" ? "Cut vinyl" : "Roll media", complete: Boolean(mediaId), icon: "8" });
      if (needsInkStep) next.push({ key: "ink", label: "Ink", complete: Boolean(ink), icon: "9" });
      if (printed) next.push({ key: "sides", label: isClearAcrylic ? "Sides / direction" : "Sides", complete: Boolean(sides && (!isClearAcrylic || printDirection)), icon: "•" });
      if (printed) next.push({ key: "laminate", label: "Laminate", complete: Boolean(laminateId), icon: "•" });
      next.push({ key: "finishing", label: "Finishing", complete: true, icon: "•" });
      next.push({ key: "dispatch", label: "Dispatch", complete: Boolean(serviceType && (serviceType === "pickup" || (serviceType === "delivery" && numberValue(deliveryCharge, 0) > 0) || (serviceType === "install" && numberValue(installCrewSize, 0) > 0 && numberValue(installMinutes, 0) > 0))), icon: "→" });
      next.push({ key: "review", label: "Review", complete: Boolean(baseType && selectedMainMaterial && width > 0 && height > 0 && artworkChoice && resolvedPrintMethod && serviceType), icon: "✓" });
    }

    return next;
  }, [flowType, isPrintDepartment, componentName, pricedComponentParts.length, componentHasCost, smallType, isDuplicateBook, ncrDetailsComplete, selectedSmallStock, width, height, artworkChoice, artworkMinutes, sides, smallPrintColour, smallCoatingId, quantityNumber, baseType, thickness, colour, selectedMainMaterial, resolvedPrintMethod, needsMediaStep, needsInkStep, mediaId, ink, printed, isClearAcrylic, isRollStockBase, printDirection, laminateId, laminateMinutes, serviceType, deliveryCharge, installCrewSize, installMinutes]);

  const activeStepIndex = Math.max(0, steps.findIndex((step) => step.key === activeStep));
  const nextStep = steps[activeStepIndex + 1]?.key;
  const previousStep = steps[activeStepIndex - 1]?.key;

  function jumpToNext(current: StepKey) {
    const index = steps.findIndex((step) => step.key === current);
    const next = steps[index + 1]?.key;
    if (next) setActiveStep(next);
  }

  function chooseFlow(nextFlow: FlowType) {
    setFlowType(nextFlow);
    setBaseType("");
    setThickness("");
    setColour("");
    setSmallType("");
    setSmallStockId("");
    setCustomSmallStockEnabled(false);
    setCustomSmallStockName("");
    setCustomSmallStockSupplier("");
    setCustomSmallStockCost("");
    setCustomSmallStockWidthMm("");
    setCustomSmallStockLengthMm("");
    setCustomSmallStockGsm("");
    setNcrCopies("");
    setNcrSetsPerBook("");
    setNcrPageColours(["White", "Yellow", "Pink", "Blue"]);
    setNcrCoverColour("");
    setNcrTapeColour("");
    setWidthMm("");
    setHeightMm("");
    setArtworkChoice("");
    setArtworkMinutes("");
    setPrintMethod("");
    setPrintSetupMinutes("");
    setMediaId("");
    setInk("");
    setSides("");
    setPrintDirection("");
    setLaminateId("");
    setLaminateMinutes("");
    setSmallPrintColour("");
    setSmallCoatingId("");
    setFinishings([]);
    setSmallFinishings([]);
    setQuantity("1");
    setServiceType("");
    setDeliveryCharge("");
    setInstallCrewSize("1");
    setInstallMinutes("");
    setTravelCharge("");
    setServiceFixings([]);
    setServiceFixingQty({});
    setServiceFixingRate({});
    setComponentName("");
    setComponentDescription("");
    setComponentParts([createBlankComponentPart()]);
    setComponentLabourLabel("Build / assembly labour");
    setComponentLabourMinutes("");
    setUnitPriceOverridden(false);
    setActiveStep(nextFlow === "small_format" ? "small_type" : isPrintDepartmentFlow(nextFlow) ? "small_stock" : nextFlow === "service" ? "service_type" : nextFlow === "component" ? "component_details" : "base");
  }

  function resetAfterBase(nextBase: BaseType) {
    const rollStockBase = nextBase === "banner";
    setBaseType(nextBase);
    setThickness("");
    setColour("");
    setWidthMm("");
    setHeightMm("");
    setArtworkChoice("");
    setArtworkMinutes("");
    setPrintMethod(rollStockBase ? "roll_stock" : "");
    setPrintSetupMinutes("");
    setMediaId("");
    setInk("");
    setSides("");
    setPrintDirection("");
    setLaminateId("");
    setLaminateMinutes("");
    setFinishings([]);
    setUnitPriceOverridden(false);
    setActiveStep(rollStockBase ? "media" : "thickness");
  }

  function setPresetSize(widthValue: string, heightValue: string, next: StepKey) {
    setWidthMm(widthValue);
    setHeightMm(heightValue);
    setActiveStep(next);
  }

  function nextStepAfterPrint(method: PrintMethod): StepKey {
    if (isRollStockBase) return "ink";
    if (method === "roll_stock" || method === "cut_vinyl") return "media";
    if (method === "direct_print") return "ink";
    return "finishing";
  }

  function setPrint(nextMethod: Exclude<PrintMethod, "">) {
    setPrintMethod(nextMethod);
    setPrintSetupMinutes("");
    setMediaId("");
    if (nextMethod === "no_print" || nextMethod === "cut_vinyl") setInk("");
    if (nextMethod === "no_print") {
      setSides("");
      setPrintDirection("");
      setLaminateId("none");
      setLaminateMinutes("");
      setActiveStep("finishing");
    }
    setUnitPriceOverridden(false);
  }

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
          const lm = roundedRollMetresForQuantity(width, height, selectedMainMaterial, quantityNumber);
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
              lm.note,
              quantityNumber > 1 ? `${usage(lm.amount)}lm total for qty ${usage(quantityNumber)}` : null,
              rate.note
            ].filter(Boolean).join(" · ") || undefined
          });
        } else {
          const sheetUse = sheetUsageForQuoteLine(selectedMainMaterial, width, height, quantityNumber);
          const rate = sheetUnitRate(selectedMainMaterial);
          rows.push({ label: "Base material", detail: selectedMainMaterial.name, amount: sheetUse.amount, unit: "sheet", rate: rate.rate, cost: sheetUse.amount * rate.rate, note: [sheetUse.note, rate.note].filter(Boolean).join(" · ") || undefined });
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
          const amount = minutes / quantityNumber;
          const rate = labourRate / 60;
          rows.push({
            label: "Print setup labour",
            detail: methodLabel,
            amount,
            unit: "min",
            rate,
            cost: amount * rate,
            note: quantityNumber > 1 ? `${minutesLabel(minutes)} once per quote line · ${money(labourRate)}/hr` : `${minutesLabel(minutes)} · ${money(labourRate)}/hr`
          });
        }
      }

      if (selectedMedia && needsAdditionalMediaCost && areaSqm > 0) {
        const mediaFaces = Math.max(1, Math.ceil(quantityNumber * sideMultiplier));
        const lm = roundedRollMetresForQuantity(width, height, selectedMedia, mediaFaces);
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
            lm.note,
            sides === "double" ? "double sided" : null,
            quantityNumber > 1 || sideMultiplier > 1 ? `${usage(lm.amount)}lm total for ${usage(mediaFaces)} face${mediaFaces === 1 ? "" : "s"}` : null,
            rate.note
          ].filter(Boolean).join(" · ") || undefined
        });
      }

      if (needsInkStep && ink && areaSqm > 0) {
        const inkRollMaterial = isRollStockBase ? selectedMainMaterial : needsAdditionalMediaCost ? selectedMedia : undefined;
        const inkRollPieces = isRollStockBase ? quantityNumber : quantityNumber * sideMultiplier;
        const inkRollUse = inkRollMaterial
          ? roundedRollMetresForQuantity(width, height, inkRollMaterial, inkRollPieces)
          : null;
        const inkUse = roundedInkSquareMetresForQuoteLine(areaSqm, sideMultiplier, quantityNumber, inkRollUse);
        const inkNote = [inkUse.note, sides === "double" ? "double sided" : null].filter(Boolean).join(" · ") || undefined;
        if (ink === "cmyk" || ink === "both") {
          rows.push({ label: "CMYK ink", detail: "Sell charge", amount: inkUse.amount, unit: "sqm", rate: inkRatePerSqm, cost: inkUse.amount * inkRatePerSqm, note: inkNote });
        }
        if (ink === "white" || ink === "both") {
          rows.push({ label: "White ink", detail: "Sell charge", amount: inkUse.amount, unit: "sqm", rate: inkRatePerSqm, cost: inkUse.amount * inkRatePerSqm, note: inkNote });
        }
      }

      if (selectedLaminate && laminateId !== "none" && areaSqm > 0) {
        const laminateFaces = Math.max(1, Math.ceil(quantityNumber * sideMultiplier));
        const lm = roundedRollMetresForQuantity(width, height, selectedLaminate, laminateFaces);
        const rate = rollRate(selectedLaminate);
        const amount = quantityNumber > 0 ? lm.amount / quantityNumber : lm.amount;
        rows.push({
          label: "Laminate",
          detail: selectedLaminate.name,
          amount,
          unit: "lm",
          rate: rate.rate,
          cost: amount * rate.rate,
          note: [lm.note, sides === "double" ? "double sided" : null, quantityNumber > 1 ? `${usage(lm.amount)}lm total for qty ${usage(quantityNumber)}` : null, rate.note].filter(Boolean).join(" · ") || undefined
        });
        const minutes = numberValue(laminateMinutes, 0);
        if (minutes > 0) {
          const amount = minutes / quantityNumber;
          const rate = labourRate / 60;
          rows.push({ label: "Laminate labour", detail: "Apply laminate", amount, unit: "min", rate, cost: amount * rate, note: quantityNumber > 1 ? `${minutesLabel(minutes)} once per quote line · ${money(labourRate)}/hr` : `${minutesLabel(minutes)} · ${money(labourRate)}/hr` });
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
            const amount = qty * eyeletMinutes;
            const rate = labourRate / 60;
            rows.push({ label: "Eyelet labour", detail: `${eyeletPresetLabel} placement`, amount, unit: "min", rate, cost: amount * rate, note: `${minutesLabel(eyeletMinutes)} each · ${money(labourRate)}/hr` });
          }
          continue;
        }
        const minutes = numberValue(finishingMinutes[item.key], 0);
        if (minutes > 0) {
          const amount = minutes / quantityNumber;
          const rate = labourRate / 60;
          rows.push({ label: item.label, detail: "Factory labour", amount, unit: "min", rate, cost: amount * rate, note: quantityNumber > 1 ? `${minutesLabel(minutes)} once per quote line · ${money(labourRate)}/hr` : `${minutesLabel(minutes)} · ${money(labourRate)}/hr` });
        }
      }
    }

    if (isPrintDepartment) {
      const itemArea = areaSqm;
      if (selectedSmallStock && itemArea > 0 && quantityNumber > 0) {
        if (isRollMaterial(selectedSmallStock)) {
          const lm = roundedRollMetresForQuantity(width, height, selectedSmallStock, quantityNumber);
          const rate = rollRate(selectedSmallStock);
          const amount = lm.amount / quantityNumber;
          rows.push({
            label: flowType === "plan_printing" ? "Plan media" : "Poster media",
            detail: selectedSmallStock.name,
            amount,
            unit: "lm",
            rate: rate.rate,
            cost: amount * rate.rate,
            note: [lm.note, quantityNumber > 1 ? `${usage(lm.amount)}lm total for qty ${usage(quantityNumber)}` : null, rate.note].filter(Boolean).join(" · ") || undefined
          });
        } else {
          const stockDimensions = bestSheetDimensions(selectedSmallStock);
          const parentWidth = stockDimensions?.width ?? 0;
          const parentHeight = stockDimensions?.length ?? 0;
          const perSheet = piecesPerSheet(parentWidth, parentHeight, width, height);
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
            note: perSheet > 0 ? `${perSheet} up per parent sheet · ${sheets} sheet${sheets === 1 ? "" : "s"} total for qty ${usage(quantityNumber)}` : rate.note ?? "parent sheet size missing"
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
          const amount = minutes / quantityNumber;
          const rate = labourRate / 60;
          rows.push({ label: item.label, detail: "Finishing labour", amount, unit: "min", rate, cost: amount * rate, note: quantityNumber > 1 ? `${minutesLabel(minutes)} once per quote line · ${money(labourRate)}/hr` : `${minutesLabel(minutes)} · ${money(labourRate)}/hr` });
        }
      }
    }

    if (flowType === "small_format") {
      const itemArea = areaSqm;
      if (selectedSmallStock && itemArea > 0 && quantityNumber > 0) {
        const stockDimensions = bestSheetDimensions(selectedSmallStock);
        const parentWidth = stockDimensions?.width ?? 0;
        const parentHeight = stockDimensions?.length ?? 0;
        const perSheet = piecesPerSheet(parentWidth, parentHeight, width, height);
        const setsPerBook = isDuplicateBook ? Math.max(1, numberValue(ncrSetsPerBook, 1)) : 1;
        const copiesPerSet = isDuplicateBook ? Math.max(1, ncrCopiesCount || 1) : 1;
        const requiredPieces = quantityNumber * setsPerBook * copiesPerSet;
        const sheets = perSheet > 0 ? Math.ceil(requiredPieces / perSheet) : requiredPieces;
        const rate = sheetUnitRate(selectedSmallStock);
        rows.push({ label: isDuplicateBook ? "Carbon/NCR stock" : "Paper / card stock", detail: selectedSmallStock.name, amount: sheets, unit: "sheet", rate: rate.rate, cost: sheets * rate.rate, note: isDuplicateBook ? `${usage(quantityNumber)} books × ${usage(setsPerBook)} sets × ${copiesPerSet} copies · ${perSheet > 0 ? `${perSheet} up per parent sheet` : "parent sheet size missing"}` : perSheet > 0 ? `${perSheet} up per parent sheet` : rate.note ?? "parent sheet size missing" });
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
          const rate = labourRate / 60;
          rows.push({ label: item.label, detail: "Bindery / finishing labour", amount: minutes, unit: "min", rate, cost: minutes * rate, note: `${minutesLabel(minutes)} · ${money(labourRate)}/hr` });
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
          const amount = people * minutes;
          const rate = labourRate / 60;
          rows.push({ label: "Install labour", detail: `${usage(people)} installer${people === 1 ? "" : "s"}`, amount, unit: "min", rate, cost: amount * rate, note: `${minutesLabel(minutes)} on site per installer · ${money(labourRate)}/hr` });
        }
        const travel = numberValue(travelCharge, 0);
        if (travel > 0) rows.push({ label: "Travel / delivery", detail: "Travel or call-out allowance", amount: 1, unit: "each", rate: travel, cost: travel });
        for (const item of fixingOptions) {
          if (!serviceFixings.includes(item.key)) continue;
          const qty = numberValue(serviceFixingQty[item.key], 0);
          const rate = numberValue(serviceFixingRate[item.key], 0);
          if (qty > 0 && rate > 0) rows.push({ label: item.label, detail: "Install fixing / consumable", amount: qty, unit: item.unit, rate, cost: qty * rate });
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
  }, [flowType, selectedMainMaterial, areaSqm, width, height, artworkChoice, artworkMinutes, printed, printSetupMinutes, selectedMedia, needsAdditionalMediaCost, sideMultiplier, resolvedPrintMethod, needsInkStep, ink, selectedLaminate, laminateId, laminateMinutes, finishings, finishingMinutes, eyeletPresetLabel, customEyeletQty, eyeletMaterial, selectedSmallStock, quantityNumber, smallPrintColour, sides, selectedSmallCoating, smallCoatingId, smallFinishings, smallFinishingMinutes, isDuplicateBook, ncrSetsPerBook, ncrCopiesCount, ncrPageColours, serviceType, deliveryCharge, installCrewSize, installMinutes, travelCharge, serviceFixings, serviceFixingQty, serviceFixingRate, componentParts, componentLabourMinutes, componentLabourLabel, componentName, materialPool, labourRate, monoRatePerSqm, inkRatePerSqm, isPrintDepartment]);

  const serviceLabel = serviceTypes.find((item) => item.key === serviceType)?.label;
  const rawCost = costs.reduce((total, row) => total + row.cost, 0);
  const lineProductTypes = flowType === "small_format"
    ? ["small_format", selectedSmallType?.label ?? ""]
    : flowType === "plan_printing"
      ? ["plan_printing", "Plan printing"]
      : flowType === "poster_printing"
        ? ["poster_printing", "Poster printing"]
        : flowType === "service"
          ? ["service", serviceLabel ?? "", serviceType === "install" ? "installation" : "", serviceType === "install" ? "signage" : ""]
          : flowType === "component"
            ? ["component", componentName.trim()]
            : ["signage", selectedBase?.label ?? "", baseType];
  const clientDiscount = resolveClientDiscountPercent({
    rules: pricingSettings?.clientDiscountRules,
    defaultDiscount: pricingSettings?.clientDefaultDiscountPercent,
    productTypes: lineProductTypes,
    quantity: quantityNumber
  });
  const discountMultiplier = Math.max(0, 1 - clientDiscount.percent / 100);
  const autoUnitPrice = rawCost * sellMultiplier * discountMultiplier;
  const unitPrice = unitPriceOverridden ? numberValue(manualUnitPrice, 0) : autoUnitPrice;
  const lineTotal = unitPrice * quantityNumber;
  const selectedMediaName = isRollStockBase ? "" : selectedMedia?.name ?? "";
  const selectedLaminateName = laminateId === "none" ? "None" : selectedLaminate?.name ?? "";
  const selectedSmallCoatingName = smallCoatingId === "none" ? "None" : selectedSmallCoating?.name ?? "";
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
        rows.push({ label: "Install labour", detail: `${usage(people)} installer${people === 1 ? "" : "s"}`, amount, unit: "min", rate, cost: amount * rate, note: `${minutesLabel(minutes)} on site per installer · ${money(labourRate)}/hr` });
      }
      const travel = numberValue(travelCharge, 0);
      if (travel > 0) rows.push({ label: "Travel / delivery", detail: "Travel or call-out allowance", amount: 1, unit: "each", rate: travel, cost: travel });
      for (const item of fixingOptions) {
        if (!serviceFixings.includes(item.key)) continue;
        const qty = numberValue(serviceFixingQty[item.key], 0);
        const rate = numberValue(serviceFixingRate[item.key], 0);
        if (qty > 0 && rate > 0) rows.push({ label: item.label, detail: "Install fixing / consumable", amount: qty, unit: item.unit, rate, cost: qty * rate });
      }
    }

    return rows;
  }, [serviceType, deliveryCharge, installCrewSize, installMinutes, travelCharge, serviceFixings, serviceFixingQty, serviceFixingRate, labourRate]);
  const dispatchRawCost = dispatchCosts.reduce((total, row) => total + row.cost, 0);
  const dispatchUnitPrice = dispatchRawCost * sellMultiplier;
  const dispatchSummary = serviceType === "pickup"
    ? "Pickup"
    : serviceType === "delivery"
      ? `Delivery${deliveryCharge ? ` · allowance ${money(numberValue(deliveryCharge, 0))}` : ""}`
      : serviceType === "install"
        ? ["Install", installCrewSize ? `${installCrewSize} installer${numberValue(installCrewSize, 1) === 1 ? "" : "s"}` : null, installMinutes ? minutesLabel(installMinutes) : null, serviceFixings.length ? `Fixings: ${selectedKeys(fixingOptions, serviceFixings)}` : null].filter(Boolean).join(" · ")
        : "";
  const shouldCreateDispatchLine = flowType !== "service" && (serviceType === "delivery" || serviceType === "install") && dispatchUnitPrice > 0;
  const baseSheetUse = flowType === "signage" ? costs.find((row) => row.label === "Base material" && row.unit === "sheet") : undefined;
  const totalSheetUse = baseSheetUse ? baseSheetUse.amount * quantityNumber : 0;
  const sheetUseLabel = baseSheetUse && totalSheetUse > 0
    ? `${usage(totalSheetUse)} billable sheet${Math.abs(totalSheetUse - 1) < 0.0001 ? "" : "s"}${baseSheetUse.note ? ` · ${baseSheetUse.note}` : ""}`
    : "";
  const rollUseRow = flowType === "signage"
    ? costs.find((row) => row.unit === "lm" && ["Roll print media", "Cut vinyl", "Base material"].includes(row.label))
    : undefined;
  const totalRollUse = rollUseRow ? rollUseRow.amount * quantityNumber : 0;
  const rollUseLabel = rollUseRow && totalRollUse > 0
    ? `${usage(totalRollUse)}lm total${rollUseRow.note ? ` · ${rollUseRow.note}` : ""}`
    : "";
  const inkUseRow = flowType === "signage"
    ? costs.find((row) => row.unit === "sqm" && (row.label === "CMYK ink" || row.label === "White ink"))
    : undefined;
  const totalInkUse = inkUseRow ? inkUseRow.amount * quantityNumber : 0;
  const inkUseLabel = inkUseRow && totalInkUse > 0
    ? `${usage(totalInkUse)}sqm billable${inkUseRow.note ? ` · ${inkUseRow.note}` : ""}`
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
    return `${usage(numberValue(part.qty, 0))} ${part.unit || "each"} ${part.name.trim() || material?.name || "part"}`;
  }).join(", ");
  const finishedSizeLabel = width > 0 && height > 0 ? `${dimensionMm(width)} × ${dimensionMm(height)}mm` : "";
  const lineName = flowType === "component"
    ? componentName.trim() || "Custom component"
    : flowType === "service"
    ? serviceType === "install" ? "Sign Install" : serviceLabel ?? "Service item"
    : flowType === "small_format"
      ? selectedSmallType?.label ?? "Small format item"
      : flowType === "plan_printing"
        ? "Plan Printing"
        : flowType === "poster_printing"
          ? "Poster Printing"
          : isRollStockBase
            ? selectedMainMaterial?.name ?? selectedBase?.label ?? "Vinyl/Roll Stock"
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
      serviceType === "install" ? "Install only — client-supplied signage" : serviceLabel,
      serviceType === "delivery" && deliveryCharge ? `Delivery charge ${money(numberValue(deliveryCharge, 0))}` : null,
      serviceType === "install" ? `${installCrewSize || "1"} installer${numberValue(installCrewSize, 1) === 1 ? "" : "s"}` : null,
      serviceType === "install" && installMinutes ? `${minutesLabel(installMinutes)} install` : null,
      serviceType === "install" && travelCharge ? `Travel ${money(numberValue(travelCharge, 0))}` : null,
      serviceFixings.length ? `Fixings: ${selectedKeys(fixingOptions, serviceFixings)}` : null
    ].filter(Boolean).join(" · ")
    : isPrintDepartment
      ? [
      flowDepartmentProductName(flowType),
      selectedSmallStock?.name ? `Stock: ${selectedSmallStock.name}` : null,
      finishedSizeLabel ? `Finished size: ${finishedSizeLabel}` : null,
      artworkChoice === "required" ? numberValue(artworkMinutes, 0) > 0 ? `Artwork ${minutesLabel(artworkMinutes)}` : "Artwork required" : artworkChoice === "client_supplied" ? "Artwork supplied" : null,
      sides ? `${sides === "double" ? "Double" : "Single"} sided` : null,
      smallPrintColour ? smallPrintColour === "mono" ? "Mono" : smallPrintColour === "cmyk" ? "CMYK" : "CMYK + special" : null,
      selectedSmallCoatingName ? `Coating: ${selectedSmallCoatingName}` : null,
      smallFinishingSummary ? `Finishing: ${smallFinishingSummary}` : null,
      dispatchSummary ? `Dispatch: ${dispatchSummary}` : null,
      `Qty ${quantityNumber}`
    ].filter(Boolean).join(" · ")
    : flowType === "small_format"
      ? [
      selectedSmallType?.label,
      selectedSmallStock?.name ? `Stock: ${selectedSmallStock.name}` : null,
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
      dispatchSummary ? `Dispatch: ${dispatchSummary}` : null,
      `Qty ${quantityNumber}`
    ].filter(Boolean).join(" · ")
    : [
      selectedBase?.label,
      selectedMainMaterial?.name ? `Substrate: ${selectedMainMaterial.name}` : null,
      finishedSizeLabel ? `Finished size: ${finishedSizeLabel}` : null,
      artworkChoice === "required" ? numberValue(artworkMinutes, 0) > 0 ? `Artwork ${minutesLabel(artworkMinutes)}` : "Artwork required" : artworkChoice === "client_supplied" ? "Artwork supplied" : null,
      isRollStockBase ? null : printMethods.find((item) => item.key === resolvedPrintMethod)?.label,
      printed && numberValue(printSetupMinutes, 0) > 0 ? `Print setup ${minutesLabel(printSetupMinutes)}` : null,
      selectedMediaName || null,
      inkChoices.find((item) => item.key === ink)?.label,
      sides ? `${sides === "double" ? "Double" : "Single"} sided` : null,
      printDirection ? `${printDirection === "reverse" ? "Reverse" : "Positive"} print` : null,
      selectedLaminateName ? `Laminate: ${selectedLaminateName}` : null,
      finishingSummary ? `Finishing: ${finishingSummary}` : null,
      dispatchSummary ? `Dispatch: ${dispatchSummary}` : null
    ].filter(Boolean).join(" · ");

  const dispatchComplete = serviceType === "pickup" || (serviceType === "delivery" && numberValue(deliveryCharge, 0) > 0) || (serviceType === "install" && numberValue(installCrewSize, 0) > 0 && numberValue(installMinutes, 0) > 0);

  const canSave = flowType === "component"
    ? Boolean(componentName.trim() && componentHasCost)
    : flowType === "service"
    ? Boolean(serviceType && (serviceType === "pickup" || (serviceType === "delivery" && numberValue(deliveryCharge, 0) > 0) || (numberValue(installCrewSize, 0) > 0 && numberValue(installMinutes, 0) > 0)))
    : isPrintDepartment
      ? Boolean(selectedSmallStock && width > 0 && height > 0 && artworkChoice && sides && smallPrintColour && smallCoatingId && quantityNumber > 0 && dispatchComplete)
      : flowType === "small_format"
        ? Boolean(smallType && ncrDetailsComplete && selectedSmallStock && width > 0 && height > 0 && artworkChoice && (isDuplicateBook || (sides && smallPrintColour && smallCoatingId)) && quantityNumber > 0 && dispatchComplete)
        : Boolean(baseType && selectedMainMaterial && width > 0 && height > 0 && artworkChoice && resolvedPrintMethod && (!needsMediaStep || mediaId) && (!needsInkStep || ink) && (!printed || sides) && (!isClearAcrylic || !printed || printDirection) && (!printed || Boolean(laminateId)) && dispatchComplete);

  const configurationSnapshot: QuickQuoteSnapshot = {
    version: 1,
    source: "quick_quote_builder",
    reconstructed: false,
    linkedDispatchLineId: initialSnapshot?.linkedDispatchLineId ?? null,
    builderMode: builderMode === "saved" ? "quick" : builderMode,
    activeStep,
    flowType,
    baseType,
    thickness,
    colour,
    widthMm,
    heightMm,
    artworkChoice,
    artworkMinutes,
    printMethod: resolvedPrintMethod,
    printSetupMinutes,
    mediaId,
    ink,
    sides,
    printDirection,
    laminateId,
    laminateMinutes,
    finishings,
    finishingMinutes,
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
    serviceType,
    deliveryCharge,
    installCrewSize,
    installMinutes,
    travelCharge,
    serviceFixings,
    serviceFixingQty,
    serviceFixingRate,
    componentName,
    componentDescription,
    componentParts,
    componentLabourLabel,
    componentLabourMinutes,
    quantity,
    unitPriceOverridden,
    manualUnitPrice: (unitPriceOverridden ? numberValue(manualUnitPrice, 0) : autoUnitPrice).toFixed(2),
    notes: lineNotes,
    materialSnapshots: {
      main: snapshotMaterialForSave(selectedMainMaterial),
      media: snapshotMaterialForSave(isRollStockBase ? undefined : selectedMedia),
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
      monoRatePerSqm,
      rawCost,
      autoUnitPrice,
      pricingBreakdown: costs.map((row) => ({ ...row }))
    }
  };

  const dispatchConfigurationSnapshot: QuickQuoteSnapshot = {
    version: 1,
    source: "quick_quote_builder",
    parentLineId: editingLine?.id ?? null,
    builderMode: "advanced",
    activeStep: "service_details",
    flowType: "service",
    serviceType,
    deliveryCharge,
    installCrewSize,
    installMinutes,
    travelCharge,
    serviceFixings,
    serviceFixingQty,
    serviceFixingRate,
    quantity: "1",
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
      pricingBreakdown: dispatchCosts.map((row) => ({ ...row }))
    }
  };

  function stepTitle(): string {
    const current = steps.find((step) => step.key === activeStep);
    return current?.label ?? "Quote builder";
  }

  function renderArtworkStep(nextAfterChoice: StepKey) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <StepIntro icon="✎" title="Does this item need artwork?" text="Every quote line now asks this. Client-supplied artwork adds no labour; required artwork charges the minutes you enter." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          <button type="button" onClick={() => { setArtworkChoice("client_supplied"); setArtworkMinutes(""); setActiveStep(nextAfterChoice); }} style={cardButtonStyle(artworkChoice === "client_supplied", "#64748b")}>
            <span style={{ fontSize: 32 }}>✓</span>
            <strong>No - client supplied</strong>
            <span style={{ color: "#64748b" }}>No artwork charge is added.</span>
          </button>
          <button type="button" onClick={() => setArtworkChoice("required")} style={cardButtonStyle(artworkChoice === "required", "#e11d48")}>
            <span style={{ fontSize: 32 }}>✎</span>
            <strong>Yes - artwork required</strong>
            <span style={{ color: "#64748b" }}>Enter the design/artwork time for this item.</span>
          </button>
        </div>
        {artworkChoice === "required" ? (
          <div style={{ border: "1px solid #fecdd3", borderRadius: 20, padding: 14, background: "#fff1f2", display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}><b>Artwork minutes (optional)</b><input value={artworkMinutes} onChange={(event) => setArtworkMinutes(event.target.value)} placeholder="Optional, eg 30" type="number" min="0" step="1" style={inputStyle} /></label>
            <small style={{ color: "#64748b" }}>Leave blank or enter 0 when no artwork labour charge is needed.</small>
            <button type="button" onClick={() => setActiveStep(nextAfterChoice)} style={primaryButton}>Continue</button>
          </div>
        ) : null}
      </div>
    );
  }

  function chooseInstallOnly() {
    chooseFlow("service");
    setServiceType("install");
    setQuantity("1");
    setActiveStep("service_details");
  }

  function chooseQuickFlow(nextFlow: FlowType) {
    if (nextFlow === flowType) return;
    if (nextFlow === "service") {
      chooseInstallOnly();
      return;
    }
    chooseFlow(nextFlow);
  }

  function renderDispatchSection(installOnly = false) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong style={{ fontSize: 18 }}>{installOnly ? "Install client-supplied signage" : "How can we get your order to you?"}</strong>
          <span style={{ color: "#64748b", fontSize: 13 }}>{installOnly ? "No substrate or production material is added. Quote only the installation labour, travel and fixings." : "Pickup is no charge. Delivery and install add their own clear line to the quote."}</span>
        </div>
        {!installOnly ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {serviceTypes.map((choice) => (
              <button
                key={choice.key}
                type="button"
                onClick={() => { setServiceType(choice.key); setUnitPriceOverridden(false); }}
                style={{
                  ...cardButtonStyle(serviceType === choice.key, choice.key === "install" ? "#ea580c" : choice.key === "delivery" ? "#0891b2" : "#16a34a"),
                  minHeight: 96,
                  padding: 14
                }}
              >
                <span style={{ fontSize: 28 }}>{choice.icon}</span>
                <strong>{choice.label}</strong>
                <span style={{ color: "#64748b", fontSize: 13 }}>{choice.description}</span>
              </button>
            ))}
          </div>
        ) : null}
        {serviceType === "delivery" ? (
          <div style={{ border: "1px solid #bae6fd", borderRadius: 18, padding: 14, background: "#f0f9ff", display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}><b>Delivery / courier cost</b><input value={deliveryCharge} onChange={(event) => { setDeliveryCharge(event.target.value); setUnitPriceOverridden(false); }} placeholder="eg 45" type="number" min="0" step="0.01" style={inputStyle} /></label>
            <span style={{ color: "#475467", fontSize: 13 }}>This becomes a separate Delivery line on the quote.</span>
          </div>
        ) : null}
        {serviceType === "install" ? (
          <div style={{ border: "1px solid #fed7aa", borderRadius: 18, padding: 14, background: "#fff7ed", display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}><b>Installers</b><input value={installCrewSize} onChange={(event) => { setInstallCrewSize(event.target.value); setUnitPriceOverridden(false); }} placeholder="eg 2" type="number" min="1" step="1" style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 6 }}><b>Install minutes</b><input value={installMinutes} onChange={(event) => { setInstallMinutes(event.target.value); setUnitPriceOverridden(false); }} placeholder="eg 120" type="number" min="0" step="1" style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 6 }}><b>Travel / call-out cost</b><input value={travelCharge} onChange={(event) => { setTravelCharge(event.target.value); setUnitPriceOverridden(false); }} placeholder="optional" type="number" min="0" step="0.01" style={inputStyle} /></label>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <strong>Fixings / install consumables</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                {fixingOptions.map((item) => {
                  const selected = serviceFixings.includes(item.key);
                  return (
                    <div key={item.key} style={{ border: selected ? "2px solid #ea580c" : "1px solid #fed7aa", borderRadius: 16, padding: 12, background: selected ? "#ffedd5" : "#fff", display: "grid", gap: 8 }}>
                      <button type="button" onClick={() => toggleServiceFixing(item.key)} style={{ border: "none", background: "transparent", color: "#0f172a", display: "flex", gap: 8, alignItems: "center", padding: 0, fontWeight: 950, cursor: "pointer", textAlign: "left" }}>
                        <span>{selected ? "✓" : "+"}</span><span>{item.label}</span>
                      </button>
                      {selected ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <input value={serviceFixingQty[item.key] ?? ""} onChange={(event) => { setServiceFixingQty({ ...serviceFixingQty, [item.key]: event.target.value }); setUnitPriceOverridden(false); }} placeholder={`Qty ${item.placeholderQty}`} type="number" min="0" step="0.01" style={inputStyle} />
                          <input value={serviceFixingRate[item.key] ?? ""} onChange={(event) => { setServiceFixingRate({ ...serviceFixingRate, [item.key]: event.target.value }); setUnitPriceOverridden(false); }} placeholder={`Cost ${item.placeholderRate}`} type="number" min="0" step="0.01" style={inputStyle} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <span style={{ color: "#475467", fontSize: 13 }}>{installOnly ? "This is saved as one Sign Install quote line and can later hand off to Install Scheduler." : "Install becomes a separate Sign Install line on the quote and can later hand off to Install Scheduler."}</span>
          </div>
        ) : null}
      </div>
    );
  }

  function renderQuickQuoteLayout() {
    const sizePresetValue = widthMm && heightMm ? `${widthMm}x${heightMm}` : "";
    const signagePresets = signageSizePresets.map((preset) => ({ ...preset, value: `${preset.width}x${preset.height}` }));
    const smallPresets = smallSizePresets.map((preset) => ({ ...preset, value: `${preset.width}x${preset.height}` }));
    const planPresets = planSizePresets.map((preset) => ({ ...preset, value: `${preset.width}x${preset.height}` }));
    const posterPresets = posterSizePresets.map((preset) => ({ ...preset, value: `${preset.width}x${preset.height}` }));
    const currentPresets = flowType === "small_format" ? smallPresets : flowType === "plan_printing" ? planPresets : flowType === "poster_printing" ? posterPresets : signagePresets;

    return (
      <div style={{ display: "grid", gap: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #dfe7f2" }}>
          <button type="button" onClick={() => setBuilderMode("quick")} style={{ border: "none", borderTop: "4px solid #65a30d", background: "#ffffff", minHeight: 58, fontWeight: 950, fontSize: 16, color: "#65a30d", cursor: "pointer" }}>Build a quick quote item</button>
          <button type="button" onClick={() => setBuilderMode("saved")} style={{ border: "none", borderLeft: "1px solid #dfe7f2", background: "#f3f4f6", minHeight: 58, fontWeight: 950, fontSize: 16, color: "#1f2937", cursor: "pointer" }}>Use saved product</button>
        </div>

        <div style={{ padding: 22, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20, alignItems: "start" }}>
          <section style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
              <div>
                <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12, fontWeight: 950, color: "#65a30d" }}>Fast quote builder</p>
                <h3 style={{ margin: "4px 0 0", fontSize: 28, letterSpacing: "-0.04em" }}>{flowType === "service" ? "Quote installation of client-supplied signage without adding a substrate." : "Build the item, choose artwork, then choose pickup / delivery / install."}</h3>
              </div>
              <span style={{ borderRadius: 999, background: "#ecfccb", color: "#3f6212", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>Quick layout</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <b>Quote type</b>
                <select value={flowType} onChange={(event) => chooseQuickFlow(event.target.value as FlowType)} style={inputStyle}>
                  <option value="signage">Large format / signage</option>
                  <option value="service">↳ Install only — client-supplied signage</option>
                  {printDepartments.filter((department) => department.key !== "signage").map((department) => <option key={department.key} value={department.key}>{department.label}</option>)}
                  <option value="component">Custom component / assembly</option>
                </select>
              </label>
              {flowType === "service" ? (
                <div style={{ minHeight: 48, borderRadius: 16, border: "1px solid #fed7aa", padding: "0 14px", background: "#fff7ed", display: "flex", alignItems: "center", color: "#9a3412", fontWeight: 900 }}>Quantity: 1 install job</div>
              ) : (
                <label style={{ display: "grid", gap: 6 }}><b>Quantity</b><input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="1" step="1" style={inputStyle} /></label>
              )}
            </div>

            {flowType === "component" ? (
              <div style={{ border: "1px solid #fed7aa", borderRadius: 20, padding: 16, background: "#fff7ed", display: "grid", gap: 12 }}>
                <strong>Custom component / assembly</strong>
                <p style={{ margin: 0, color: "#9a3412" }}>Components can be more detailed, so use the advanced flow for parts, labour and assembly breakdowns.</p>
                <button type="button" onClick={() => { setBuilderMode("advanced"); setActiveStep("component_details"); }} style={{ ...primaryButton, justifySelf: "start" }}>Open component builder</button>
              </div>
            ) : null}

            {flowType === "signage" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}><b>Product / base</b><select value={baseType} onChange={(event) => event.target.value === "install_only" ? chooseInstallOnly() : resetAfterBase(event.target.value as BaseType)} style={inputStyle}><option value="">Choose product type</option><option value="install_only">Install only — client-supplied signage</option>{baseTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
                {isRollStockBase ? (
                  <label style={{ display: "grid", gap: 6 }}><b>Roll stock / media</b><select value={mediaId} onChange={(event) => { setMediaId(event.target.value); setUnitPriceOverridden(false); }} style={inputStyle}><option value="">Choose roll stock</option>{baseMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
                ) : (
                  <label style={{ display: "grid", gap: 6 }}><b>Thickness / stock</b><select value={thickness} onChange={(event) => { setThickness(event.target.value); setColour(""); setUnitPriceOverridden(false); }} style={inputStyle}><option value="">Choose thickness</option>{thicknessOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                )}
                {!isRollStockBase ? <label style={{ display: "grid", gap: 6 }}><b>Colour</b><select value={colour} onChange={(event) => { setColour(event.target.value); setUnitPriceOverridden(false); }} style={inputStyle}><option value="">Choose colour</option>{colourOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
                <label style={{ display: "grid", gap: 6 }}><b>Finished size</b><select value={sizePresetValue} onChange={(event) => { const preset = currentPresets.find((item) => item.value === event.target.value); if (preset) setPresetSize(preset.width, preset.height, "artwork"); }} style={inputStyle}><option value="">Choose preset or type custom</option>{currentPresets.map((preset) => <option key={preset.label} value={preset.value}>{preset.label}</option>)}</select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Width mm</b><input value={widthMm} onChange={(event) => setWidthMm(event.target.value)} placeholder="eg 6000" type="number" min="0" step="1" style={inputStyle} /></label>
                <label style={{ display: "grid", gap: 6 }}><b>Height mm</b><input value={heightMm} onChange={(event) => setHeightMm(event.target.value)} placeholder="eg 1220" type="number" min="0" step="1" style={inputStyle} /></label>
                {!isRollStockBase ? <label style={{ display: "grid", gap: 6 }}><b>Print method</b><select value={printMethod} onChange={(event) => setPrint(event.target.value as Exclude<PrintMethod, "">)} style={inputStyle}><option value="">Choose print method</option>{printMethods.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label> : null}
                {printed ? <label style={{ display: "grid", gap: 6 }}><b>Print setup labour minutes (optional)</b><input value={printSetupMinutes} onChange={(event) => { setPrintSetupMinutes(event.target.value); setUnitPriceOverridden(false); }} placeholder="Optional, eg 15" type="number" min="0" step="1" style={inputStyle} /><small style={{ color: "#64748b" }}>Leave blank or enter 0 for no setup charge. Entered minutes are priced at {money(labourRate)}/hr.</small></label> : null}
                {!isRollStockBase && needsMediaStep ? <label style={{ display: "grid", gap: 6 }}><b>{resolvedPrintMethod === "cut_vinyl" ? "Cut vinyl" : "Roll media"}</b><select value={mediaId} onChange={(event) => { setMediaId(event.target.value); setUnitPriceOverridden(false); }} style={inputStyle}><option value="">Choose roll material</option>{rollMedia.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label> : null}
                {needsInkStep ? <label style={{ display: "grid", gap: 6 }}><b>Ink</b><select value={ink} onChange={(event) => setInk(event.target.value as InkChoice)} style={inputStyle}><option value="">Choose ink</option>{inkChoices.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label> : null}
                {printed ? <label style={{ display: "grid", gap: 6 }}><b>Sides</b><select value={sides} onChange={(event) => setSides(event.target.value as SidesChoice)} style={inputStyle}><option value="">Choose sides</option><option value="single">Single sided</option><option value="double">Double sided</option></select></label> : null}
                {isClearAcrylic && printed ? <label style={{ display: "grid", gap: 6 }}><b>Print direction</b><select value={printDirection} onChange={(event) => setPrintDirection(event.target.value as PrintDirection)} style={inputStyle}><option value="">Choose direction</option><option value="positive">Positive / face print</option><option value="reverse">Reverse print</option></select></label> : null}
                {printed ? <label style={{ display: "grid", gap: 6 }}><b>Laminate</b><select value={laminateId} onChange={(event) => { setLaminateId(event.target.value); setUnitPriceOverridden(false); }} style={inputStyle}><option value="">Choose laminate</option><option value="none">No laminate</option>{laminateMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label> : null}
                {printed && laminateId && laminateId !== "none" ? <label style={{ display: "grid", gap: 6 }}><b>Laminate labour minutes (optional)</b><input value={laminateMinutes} onChange={(event) => setLaminateMinutes(event.target.value)} placeholder="Optional, eg 15" type="number" min="0" step="1" style={inputStyle} /></label> : null}
              </div>
            ) : null}

            {isPrintDepartment ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}><b>Department</b><input value={flowDepartmentProductName(flowType)} readOnly style={{ ...inputStyle, background: "#f8fafc" }} /></label>
                <label style={{ display: "grid", gap: 6 }}><b>Material / stock</b><select value={smallStockId} onChange={(event) => { setCustomSmallStockEnabled(false); setSmallStockId(event.target.value); setUnitPriceOverridden(false); }} style={inputStyle}><option value="">Choose stock</option>{departmentStocks.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Finished size</b><select value={sizePresetValue} onChange={(event) => { const preset = currentPresets.find((item) => item.value === event.target.value); if (preset) setPresetSize(preset.width, preset.height, "artwork"); }} style={inputStyle}><option value="">Choose preset or type custom</option>{currentPresets.map((preset) => <option key={preset.label} value={preset.value}>{preset.label}</option>)}</select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Sides</b><select value={sides} onChange={(event) => { setSides(event.target.value as SidesChoice); setUnitPriceOverridden(false); }} style={inputStyle}><option value="">Choose sides</option><option value="single">Single sided</option><option value="double">Double sided</option></select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Width mm</b><input value={widthMm} onChange={(event) => { setWidthMm(event.target.value); setUnitPriceOverridden(false); }} placeholder={flowType === "plan_printing" ? "eg 841" : "eg 600"} type="number" min="0" step="1" style={inputStyle} /></label>
                <label style={{ display: "grid", gap: 6 }}><b>Height mm</b><input value={heightMm} onChange={(event) => { setHeightMm(event.target.value); setUnitPriceOverridden(false); }} placeholder={flowType === "plan_printing" ? "eg 1189" : "eg 900"} type="number" min="0" step="1" style={inputStyle} /></label>
                <label style={{ display: "grid", gap: 6 }}><b>Print colour</b><select value={smallPrintColour} onChange={(event) => { setSmallPrintColour(event.target.value as SmallPrintColour); setUnitPriceOverridden(false); }} style={inputStyle}><option value="">Choose print colour</option><option value="mono">Mono</option><option value="cmyk">CMYK</option><option value="special">CMYK + special</option></select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Coating / laminate</b><select value={smallCoatingId} onChange={(event) => { setSmallCoatingId(event.target.value); setUnitPriceOverridden(false); }} style={inputStyle}><option value="">Choose coating</option><option value="none">No coating</option>{laminateMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
              </div>
            ) : null}


            {flowType === "small_format" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}><b>Product type</b><select value={smallType} onChange={(event) => setSmallType(event.target.value as SmallFormatType)} style={inputStyle}><option value="">Choose product type</option>{smallFormatTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Material / stock</b><select value={smallStockId} onChange={(event) => { setCustomSmallStockEnabled(false); setSmallStockId(event.target.value); }} style={inputStyle}><option value="">Choose stock</option>{smallStocks.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Finished size</b><select value={sizePresetValue} onChange={(event) => { const preset = currentPresets.find((item) => item.value === event.target.value); if (preset) setPresetSize(preset.width, preset.height, "artwork"); }} style={inputStyle}><option value="">Choose preset or type custom</option>{currentPresets.map((preset) => <option key={preset.label} value={preset.value}>{preset.label}</option>)}</select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Sides</b><select value={sides} onChange={(event) => setSides(event.target.value as SidesChoice)} style={inputStyle}><option value="">Choose sides</option><option value="single">Single sided</option><option value="double">Double sided</option></select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Width mm</b><input value={widthMm} onChange={(event) => setWidthMm(event.target.value)} placeholder="eg 90" type="number" min="0" step="1" style={inputStyle} /></label>
                <label style={{ display: "grid", gap: 6 }}><b>Height mm</b><input value={heightMm} onChange={(event) => setHeightMm(event.target.value)} placeholder="eg 55" type="number" min="0" step="1" style={inputStyle} /></label>
                <label style={{ display: "grid", gap: 6 }}><b>Print colour</b><select value={smallPrintColour} onChange={(event) => setSmallPrintColour(event.target.value as SmallPrintColour)} style={inputStyle}><option value="">Choose print colour</option><option value="mono">Mono</option><option value="cmyk">CMYK</option><option value="special">CMYK + special</option></select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Coating / laminate</b><select value={smallCoatingId} onChange={(event) => setSmallCoatingId(event.target.value)} style={inputStyle}><option value="">Choose coating</option><option value="none">No coating</option>{laminateMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
              </div>
            ) : null}

            {flowType === "signage" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <strong>Finishing</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                  {finishingOptions.map((item) => <button key={item.key} type="button" onClick={() => toggleFinishing(item.key)} style={cardButtonStyle(finishings.includes(item.key), "#0f766e")}><span style={{ fontSize: 26 }}>{item.icon}</span><strong>{item.label}</strong><span style={{ color: "#64748b", fontSize: 13 }}>{item.description}</span></button>)}
                </div>
                <SelectedLabourMinutes options={finishingOptions.filter((item) => item.key !== "eyelets")} selected={finishings} values={finishingMinutes} onChange={setFinishingMinutes} labourRate={labourRate} />
                {finishings.includes("eyelets") ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label style={{ display: "grid", gap: 6 }}><b>Eyelet placement</b><select value={eyeletPresetLabel} onChange={(event) => setEyeletPresetLabel(event.target.value)} style={inputStyle}>{eyeletPresets.map((preset) => <option key={preset.label} value={preset.label}>{preset.label}</option>)}</select></label>{eyeletPresets.find((preset) => preset.label === eyeletPresetLabel)?.qty === 0 ? <label style={{ display: "grid", gap: 6 }}><b>Custom eyelet qty</b><input value={customEyeletQty} onChange={(event) => setCustomEyeletQty(event.target.value)} type="number" min="0" step="1" style={inputStyle} /></label> : null}</div> : null}
              </div>
            ) : null}

            {(flowType === "small_format" || isPrintDepartment) && !isDuplicateBook ? (
              <div style={{ display: "grid", gap: 10 }}>
                <strong>Finishing</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                  {smallFinishingOptions.map((item) => <button key={item.key} type="button" onClick={() => toggleSmallFinishing(item.key)} style={cardButtonStyle(smallFinishings.includes(item.key), "#7c3aed")}><span style={{ fontSize: 26 }}>{item.icon}</span><strong>{item.label}</strong><span style={{ color: "#64748b", fontSize: 13 }}>{item.description}</span></button>)}
                </div>
                <SelectedLabourMinutes options={smallFinishingOptions} selected={smallFinishings} values={smallFinishingMinutes} onChange={setSmallFinishingMinutes} labourRate={labourRate} />
              </div>
            ) : null}

            {flowType !== "service" && flowType !== "component" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <strong>How will print-ready artwork be supplied?</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <button type="button" onClick={() => { setArtworkChoice("client_supplied"); setArtworkMinutes(""); }} style={cardButtonStyle(artworkChoice === "client_supplied", "#65a30d")}><span style={{ fontSize: 30 }}>✓</span><strong>Customer supplied</strong><span style={{ color: "#64748b" }}>No artwork charge added.</span></button>
                  <button type="button" onClick={() => setArtworkChoice("required")} style={cardButtonStyle(artworkChoice === "required", "#e11d48")}><span style={{ fontSize: 30 }}>✎</span><strong>Artwork required</strong><span style={{ color: "#64748b" }}>Add artwork/design labour.</span></button>
                </div>
                {artworkChoice === "required" ? <label style={{ display: "grid", gap: 6 }}><b>Artwork minutes (optional)</b><input value={artworkMinutes} onChange={(event) => setArtworkMinutes(event.target.value)} placeholder="Optional, eg 30" type="number" min="0" step="1" style={inputStyle} /><small style={{ color: "#64748b" }}>Leave blank or enter 0 for no artwork labour charge.</small></label> : null}
              </div>
            ) : null}

            {flowType === "service" ? renderDispatchSection(true) : flowType !== "component" ? renderDispatchSection() : null}

            <label style={{ display: "grid", gap: 6 }}><b>Line notes</b><textarea name="notes" value={lineNotes} onChange={(event) => setLineNotes(event.target.value)} placeholder="Optional notes for this line" style={textareaStyle} /></label>

            <button type="submit" disabled={!canSave} style={{ ...primaryButton, minHeight: 58, justifySelf: "center", minWidth: 240, fontSize: 18, background: "#65a30d", opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}>{canSave ? editingLine ? "Update quote line" : "Add item to quote" : "Complete required fields"}</button>
          </section>

          <aside style={{ position: "sticky", top: 18, display: "grid", gap: 14 }}>
            <div style={{ border: "1px solid #dfe7f2", borderRadius: 22, padding: 16, background: "#fff", display: "grid", gap: 10 }}>
              <strong>Current item</strong>
              <SummaryRow label="Type" value={flowType === "service" && serviceType === "install" ? "Install only — client-supplied signage" : flowTypeLabel(flowType)} />
              {flowType === "signage" ? <SummaryRow label="Material" value={selectedMainMaterial?.name} /> : null}
              {flowType === "signage" && sheetUseLabel ? <SummaryRow label="Sheet use" value={sheetUseLabel} /> : null}
              {flowType === "signage" && rollUseLabel ? <SummaryRow label="Roll use" value={rollUseLabel} /> : null}
              {flowType === "signage" && inkUseLabel ? <SummaryRow label="Ink use" value={inkUseLabel} /> : null}
              {flowType === "small_format" || isPrintDepartment ? <SummaryRow label="Material" value={selectedSmallStock?.name} /> : null}
              <SummaryRow label="Size" value={width > 0 && height > 0 ? `${dimensionMm(width)} × ${dimensionMm(height)}mm` : undefined} />
              <SummaryRow label="Artwork" value={artworkChoice === "required" ? numberValue(artworkMinutes, 0) > 0 ? `${minutesLabel(artworkMinutes)} required` : "Artwork required" : artworkChoice === "client_supplied" ? "Customer supplied" : undefined} />
              <SummaryRow label="Dispatch" value={dispatchSummary || undefined} />
            </div>
            <div style={{ border: "1px solid #bbf7d0", borderRadius: 22, padding: 16, background: "#f0fdf4", display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 950, color: "#067647", textTransform: "uppercase" }}>Item price</span>
              <strong style={{ fontSize: 28 }}>{money(unitPrice)}</strong>
              <span style={{ color: "#475467", fontSize: 13 }}>Qty {usage(quantityNumber)} · line total {money(lineTotal)}</span>
            </div>
            {shouldCreateDispatchLine ? (
              <div style={{ border: "1px solid #fed7aa", borderRadius: 22, padding: 16, background: "#fff7ed", display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 950, color: "#c2410c", textTransform: "uppercase" }}>Extra service line</span>
                <strong style={{ fontSize: 22 }}>{serviceType === "install" ? "Sign Install" : "Delivery"}</strong>
                <span style={{ color: "#475467", fontSize: 13 }}>{dispatchSummary}</span>
                <strong>{money(dispatchUnitPrice)}</strong>
              </div>
            ) : null}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 14, background: "#f8fafc", display: "grid", gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 950, color: "#344054", textTransform: "uppercase", letterSpacing: "0.05em" }}>Summary</span>
              <span style={{ color: optionSummary ? "#111827" : "#667085", lineHeight: 1.5 }}>{optionSummary || "Complete the fields to build this quote line."}</span>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  function renderSavedProductLayout() {
    return (
      <div style={{ border: "1px solid #dbeafe", borderRadius: 28, overflow: "hidden", background: "#ffffff", display: "grid" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #dfe7f2" }}>
          <button type="button" onClick={() => setBuilderMode("quick")} style={{ border: "none", background: "#f3f4f6", minHeight: 58, fontWeight: 950, fontSize: 16, color: "#1f2937", cursor: "pointer" }}>Build a quick quote item</button>
          <button type="button" onClick={() => setBuilderMode("saved")} style={{ border: "none", borderTop: "4px solid #65a30d", borderLeft: "1px solid #dfe7f2", background: "#ffffff", minHeight: 58, fontWeight: 950, fontSize: 16, color: "#65a30d", cursor: "pointer" }}>Use saved product</button>
        </div>

        <div style={{ padding: 22, display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12, fontWeight: 950, color: "#65a30d" }}>Saved product picker</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 28, letterSpacing: "-0.04em" }}>Pick a pre-built product, set the options, then add it to the quote.</h3>
              <p style={{ margin: "6px 0 0", color: "#667085", lineHeight: 1.55 }}>Use this for standard products that have already been configured on the Products page. It keeps quoting fast without opening the old step-by-step builder.</p>
            </div>
            <span style={{ borderRadius: 999, background: "#ecfccb", color: "#3f6212", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{savedProducts.length} saved product{savedProducts.length === 1 ? "" : "s"}</span>
          </div>

          <QuoteLineBuilder
            quoteId={quoteId}
            products={savedProducts}
            materials={materialPool}
            pricingSettings={{
              markupMultiplier: pricingSettings?.markupMultiplier,
              profitMultiplier: pricingSettings?.profitMultiplier
            }}
          />
        </div>
      </div>
    );
  }

  function renderStep() {
    if (activeStep === "dispatch") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="→" title="How can we get this order to the client?" text="Choose pickup, delivery or install. Install asks for crew, minutes and fixings so it can become a separate install quote line." />
          {renderDispatchSection()}
          <button type="button" onClick={() => setActiveStep("review")} disabled={!dispatchComplete} style={{ ...primaryButton, opacity: dispatchComplete ? 1 : 0.45, justifySelf: "start" }}>Continue to review</button>
        </div>
      );
    }

    if (activeStep === "flow") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="1" title="What are you quoting?" text="Choose the correct flow first. Signage and small format share the same pricing engine, but the screens stay separate." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <button type="button" onClick={() => chooseFlow("signage")} style={cardButtonStyle(flowType === "signage", "#155eef")}>
              <span style={{ fontSize: 38 }}>▣</span>
              <strong style={{ fontSize: 22 }}>Large format / signage</strong>
              <span style={{ color: "#64748b", lineHeight: 1.5 }}>Acrylic, ACM, corflute, PVC, banner, roll media, ink, laminate and finishing.</span>
            </button>
            <button type="button" onClick={() => chooseFlow("small_format")} style={cardButtonStyle(flowType === "small_format", "#7c3aed")}>
              <span style={{ fontSize: 38 }}>▤</span>
              <strong style={{ fontSize: 22 }}>Small format / print</strong>
              <span style={{ color: "#64748b", lineHeight: 1.5 }}>Cards, flyers, brochures, booklets, duplicate books, paper stock, cello and bindery.</span>
            </button>
            <button type="button" onClick={() => chooseFlow("service")} style={cardButtonStyle(flowType === "service", "#059669")}>
              <span style={{ fontSize: 38 }}>⚒</span>
              <strong style={{ fontSize: 22 }}>Pickup / delivery / install</strong>
              <span style={{ color: "#64748b", lineHeight: 1.5 }}>Pickup notes, delivery charges, install crew time and fixing consumables.</span>
            </button>
            <button type="button" onClick={() => chooseFlow("component")} style={cardButtonStyle(flowType === "component", "#f97316")}>
              <span style={{ fontSize: 38 }}>▦</span>
              <strong style={{ fontSize: 22 }}>Custom component / assembly</strong>
              <span style={{ color: "#64748b", lineHeight: 1.5 }}>Frames, special builds, panels with parts A+B+C, hardware and assembly labour.</span>
            </button>
          </div>
        </div>
      );
    }

    if (activeStep === "component_details") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="▦" title="Name the custom component" text="Use this when the quote line is an assembly made from multiple parts, like a frame, bracket set, special build or one-off fabrication." />
          <div style={{ border: "1px solid #fed7aa", borderRadius: 20, padding: 16, background: "#fff7ed", display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <b>Component name</b>
              <input value={componentName} onChange={(event) => setComponentName(event.target.value)} placeholder="eg Aluminium frame" style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <b>Description / internal note</b>
              <textarea value={componentDescription} onChange={(event) => setComponentDescription(event.target.value)} placeholder="eg Frame made from 25mm tube, brackets, screws and assembly labour" style={textareaStyle} />
            </label>
            <button type="button" onClick={() => setActiveStep("component_parts")} disabled={!componentName.trim()} style={{ ...primaryButton, opacity: componentName.trim() ? 1 : 0.45 }}>Continue to parts</button>
          </div>
        </div>
      );
    }

    if (activeStep === "component_parts") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="3" title="Add parts used" text="Add each part that makes up the component. Pick an existing material or type a custom part. Quantity × cost is added to the quote line." />
          <div style={{ display: "grid", gap: 12 }}>
            {componentParts.map((part, index) => {
              const selectedPartMaterial = materialPool.find((item) => item.id === part.materialId);
              const suggested = rateForComponentUnit(selectedPartMaterial, part.unit);
              const shownRate = part.unitCost.trim() ? numberValue(part.unitCost, 0) : suggested.rate;
              return (
                <div key={part.id} style={{ border: "1px solid #fed7aa", borderRadius: 20, padding: 14, background: "#fffaf0", display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <strong>Part {index + 1}</strong>
                    <button type="button" onClick={() => removeComponentPart(part.id)} style={{ ...ghostButton, color: "#b42318" }}>Remove</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <b>From material library</b>
                      <select value={part.materialId} onChange={(event) => {
                        const material = materialPool.find((item) => item.id === event.target.value);
                        updateComponentPart(part.id, {
                          materialId: event.target.value,
                          name: part.name.trim() || material?.name || "",
                          unit: material ? (isRollMaterial(material) ? "lm" : isSheetMaterial(material) ? "sheet" : "each") : part.unit,
                          unitCost: part.unitCost
                        });
                      }} style={inputStyle}>
                        <option value="">Custom / not in materials</option>
                        {materialPool.map((material) => <option key={material.id} value={material.id}>{material.name}{material.supplierName ? ` · ${material.supplierName}` : ""}</option>)}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <b>Part name</b>
                      <input value={part.name} onChange={(event) => updateComponentPart(part.id, { name: event.target.value })} placeholder="eg 25mm aluminium tube" style={inputStyle} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <b>Quantity</b>
                      <input value={part.qty} onChange={(event) => updateComponentPart(part.id, { qty: event.target.value })} placeholder="eg 4" type="number" min="0" step="0.01" style={inputStyle} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <b>Unit</b>
                      <select value={part.unit} onChange={(event) => updateComponentPart(part.id, { unit: event.target.value, unitCost: part.unitCost })} style={inputStyle}>
                        <option value="each">each</option>
                        <option value="lm">lm</option>
                        <option value="sheet">sheet</option>
                        <option value="sqm">sqm</option>
                        <option value="pack">pack</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <b>Cost per unit</b>
                      <input value={part.unitCost} onChange={(event) => updateComponentPart(part.id, { unitCost: event.target.value })} placeholder={selectedPartMaterial && suggested.rate > 0 ? `${money(suggested.rate)} from material` : "eg 12.50"} type="number" min="0" step="0.01" style={inputStyle} />
                    </label>
                  </div>
                  <label style={{ display: "grid", gap: 6 }}>
                    <b>Part note</b>
                    <input value={part.note} onChange={(event) => updateComponentPart(part.id, { note: event.target.value })} placeholder="optional, eg left and right uprights" style={inputStyle} />
                  </label>
                  <span style={{ color: "#9a3412", fontSize: 13, fontWeight: 800 }}>
                    {numberValue(part.qty, 0) > 0 && shownRate > 0 ? `${usage(numberValue(part.qty, 0))} ${part.unit} × ${money(shownRate)} = ${money(numberValue(part.qty, 0) * shownRate)}` : "Enter a quantity and cost, or pick a material with a usable cost."}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={addComponentPart} style={ghostButton}>+ Add another part</button>
            <button type="button" onClick={() => setActiveStep("component_labour")} disabled={pricedComponentParts.length === 0} style={{ ...primaryButton, opacity: pricedComponentParts.length > 0 ? 1 : 0.45 }}>Continue to labour</button>
          </div>
        </div>
      );
    }

    if (activeStep === "component_labour") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="4" title="Add assembly labour" text="Add the time to cut, assemble, weld, screw, tape, pack or prepare this component. Leave minutes blank if the parts only need to be charged." />
          <div style={{ border: "1px solid #fed7aa", borderRadius: 20, padding: 16, background: "#fff7ed", display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <b>Labour label</b>
                <input value={componentLabourLabel} onChange={(event) => setComponentLabourLabel(event.target.value)} placeholder="eg Frame assembly labour" style={inputStyle} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <b>Minutes</b>
                <input value={componentLabourMinutes} onChange={(event) => { setComponentLabourMinutes(event.target.value); setUnitPriceOverridden(false); }} placeholder="eg 45" type="number" min="0" step="1" style={inputStyle} />
              </label>
            </div>
            <span style={{ color: "#9a3412", fontSize: 13 }}>Charged at {money(labourRate)}/hr before global markup and profit.</span>
            <button type="button" onClick={() => setActiveStep("review")} style={primaryButton}>Review component line</button>
          </div>
        </div>
      );
    }

    if (activeStep === "service_type") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="2" title="Choose service line type" text="Use this for non-production quote lines like pickup, delivery, installation and onsite consumables." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
            {serviceTypes.map((item) => (
              <button key={item.key} type="button" onClick={() => { setServiceType(item.key); setActiveStep("service_details"); }} style={cardButtonStyle(serviceType === item.key, "#059669")}>
                <span style={{ fontSize: 34 }}>{item.icon}</span>
                <strong style={{ fontSize: 20 }}>{item.label}</strong>
                <span style={{ color: "#64748b", lineHeight: 1.45 }}>{item.description}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeStep === "service_details") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="3" title={serviceType === "install" ? "Set install crew and time" : serviceType === "delivery" ? "Set delivery charge" : "Pickup details"} text={serviceType === "install" ? "Install labour is calculated from people × minutes, converted internally to hours against the global labour rate, then markup/profit are applied." : serviceType === "delivery" ? "Enter the delivery/courier charge as a cost price. Markup and profit are applied on the review step." : "Pickup can be saved as a no-charge line if you want it visible on the quote."} />
          {serviceType === "pickup" ? (
            <div style={{ border: "1px solid #bbf7d0", borderRadius: 20, padding: 16, background: "#f0fdf4", display: "grid", gap: 10 }}>
              <strong>Pickup / client collection</strong>
              <span style={{ color: "#475467" }}>No charge is added unless you override the unit sell price on review.</span>
              <button type="button" onClick={() => setActiveStep("review")} style={primaryButton}>Review pickup line</button>
            </div>
          ) : null}
          {serviceType === "delivery" ? (
            <div style={{ border: "1px solid #dbeafe", borderRadius: 20, padding: 16, background: "#f8fbff", display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}><b>Delivery charge / courier cost</b><input value={deliveryCharge} onChange={(event) => { setDeliveryCharge(event.target.value); setUnitPriceOverridden(false); }} placeholder="eg 45" type="number" min="0" step="0.01" style={inputStyle} /></label>
              <span style={{ color: "#475467", fontSize: 13 }}>Enter the cost price. The quote sell price applies global markup × profit.</span>
              <button type="button" onClick={() => setActiveStep("review")} style={primaryButton}>Review delivery line</button>
            </div>
          ) : null}
          {serviceType === "install" ? (
            <div style={{ border: "1px solid #bbf7d0", borderRadius: 20, padding: 16, background: "#f0fdf4", display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}><b>Installers</b><select value={installCrewSize} onChange={(event) => { setInstallCrewSize(event.target.value); setUnitPriceOverridden(false); }} style={inputStyle}>{["1", "2", "3", "4"].map((count) => <option key={count} value={count}>{count} {count === "1" ? "person" : "people"}</option>)}</select></label>
                <label style={{ display: "grid", gap: 6 }}><b>Install minutes</b><input value={installMinutes} onChange={(event) => { setInstallMinutes(event.target.value); setUnitPriceOverridden(false); }} placeholder="eg 120" type="number" min="0" step="1" style={inputStyle} /></label>
                <label style={{ display: "grid", gap: 6 }}><b>Travel / call-out cost</b><input value={travelCharge} onChange={(event) => { setTravelCharge(event.target.value); setUnitPriceOverridden(false); }} placeholder="optional" type="number" min="0" step="0.01" style={inputStyle} /></label>
              </div>
              <span style={{ color: "#475467", fontSize: 13 }}>Labour cost: installers × minutes, converted at {money(labourRate)}/hr.</span>
              <button type="button" onClick={() => setActiveStep("service_fixings")} disabled={numberValue(installMinutes, 0) <= 0} style={{ ...primaryButton, opacity: numberValue(installMinutes, 0) > 0 ? 1 : 0.45 }}>Continue to fixings</button>
            </div>
          ) : null}
        </div>
      );
    }

    if (activeStep === "service_fixings") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="4" title="Add fixings / consumables" text="Tick what the install needs, then enter quantity and cost. Leave everything unticked if there are no extras." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {fixingOptions.map((item) => (
              <button key={item.key} type="button" onClick={() => toggleServiceFixing(item.key)} style={cardButtonStyle(serviceFixings.includes(item.key), "#059669")}>
                <span style={{ fontSize: 30 }}>{item.icon}</span>
                <strong>{item.label}</strong>
                <span style={{ color: "#64748b" }}>Charge by {item.unit}.</span>
              </button>
            ))}
          </div>
          {serviceFixings.length > 0 ? (
            <div style={{ border: "1px solid #dbeafe", borderRadius: 20, padding: 14, background: "#f8fbff", display: "grid", gap: 10 }}>
              <strong>Quantities and costs</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                {fixingOptions.filter((item) => serviceFixings.includes(item.key)).map((item) => (
                  <div key={item.key} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 12, background: "#fff", display: "grid", gap: 8 }}>
                    <b>{item.label}</b>
                    <label style={{ display: "grid", gap: 5 }}><span>Quantity ({item.unit})</span><input value={serviceFixingQty[item.key] ?? ""} onChange={(event) => { setServiceFixingQty({ ...serviceFixingQty, [item.key]: event.target.value }); setUnitPriceOverridden(false); }} placeholder={item.placeholderQty} type="number" min="0" step="0.01" style={inputStyle} /></label>
                    <label style={{ display: "grid", gap: 5 }}><span>Cost per {item.unit}</span><input value={serviceFixingRate[item.key] ?? ""} onChange={(event) => { setServiceFixingRate({ ...serviceFixingRate, [item.key]: event.target.value }); setUnitPriceOverridden(false); }} placeholder={item.placeholderRate} type="number" min="0" step="0.01" style={inputStyle} /></label>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <button type="button" onClick={() => setActiveStep("review")} style={primaryButton}>Review install line</button>
        </div>
      );
    }

    if (activeStep === "base") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="2" title="Start with the base material" text="No product setup first. Choose the material family for this quote line." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            <button type="button" onClick={chooseInstallOnly} style={cardButtonStyle(false, "#ea580c")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ width: 42, height: 42, borderRadius: 14, display: "grid", placeItems: "center", background: "#ea580c1a", color: "#ea580c", fontWeight: 950, fontSize: 22 }}>⚒</span>
                <span style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", padding: "4px 9px", fontSize: 12, fontWeight: 900 }}>No material</span>
              </div>
              <strong style={{ fontSize: 18 }}>Install only</strong>
              <span style={{ color: "#64748b", lineHeight: 1.45 }}>Install client-supplied signage. Add crew time, travel, fixings and onsite consumables only.</span>
            </button>
            {baseTypes.map((item) => {
              const count = materialPool.filter((material) => materialMatchesBase(material, item.key)).length;
              return (
                <button key={item.key} type="button" onClick={() => resetAfterBase(item.key)} style={cardButtonStyle(baseType === item.key, item.accent)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 42, height: 42, borderRadius: 14, display: "grid", placeItems: "center", background: `${item.accent}1a`, color: item.accent, fontWeight: 950, fontSize: 22 }}>{item.icon}</span>
                    <span style={{ borderRadius: 999, background: "#f1f5f9", padding: "4px 9px", fontSize: 12, fontWeight: 900 }}>{count} materials</span>
                  </div>
                  <strong style={{ fontSize: 18 }}>{item.label}</strong>
                  <span style={{ color: "#64748b", lineHeight: 1.45 }}>{item.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeStep === "thickness") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="3" title={`Choose ${selectedBase?.label ?? "material"} thickness`} text="These choices come from the materials you have already created." />
          {thicknessOptions.length === 0 ? <EmptyStep text="No matching materials found. Add the material first, then come back to quote." /> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            {thicknessOptions.map((option) => (
              <button key={option} type="button" onClick={() => { setThickness(option); setColour(""); setActiveStep("colour"); }} style={cardButtonStyle(thickness === option, "#7c3aed")}>
                <span style={{ fontSize: 30 }}>▥</span>
                <strong style={{ fontSize: 20 }}>{option}</strong>
                <span style={{ color: "#64748b" }}>{baseMaterials.filter((material) => thicknessFor(material) === option).length} matching material{baseMaterials.filter((material) => thicknessFor(material) === option).length === 1 ? "" : "s"}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeStep === "colour") {
      const materialPool = thickness ? baseMaterials.filter((material) => thicknessFor(material) === thickness) : baseMaterials;
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="4" title="Choose colour / finish" text="This picks the actual material sheet used for the quote line." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {colourOptions.map((option) => {
              const matched = materialPool.find((material) => colourFor(material) === option);
              return (
                <button key={option} type="button" onClick={() => { setColour(option); setActiveStep("size"); }} style={cardButtonStyle(colour === option, "#0891b2")}>
                  <span style={{ fontSize: 30 }}>{option.toLowerCase() === "clear" ? "◇" : "■"}</span>
                  <strong style={{ fontSize: 20 }}>{option}</strong>
                  <span style={{ color: "#64748b" }}>{matched ? materialCardMeta(matched) : "No matching material"}</span>
                  {matched ? <span style={{ color: "#0f172a", fontWeight: 900 }}>{money(numberValue(matched.purchaseCost, 0))}/{matched.purchaseUom || "unit"}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeStep === "size") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="5" title="Enter sign size" text="The finished size drives sheet usage, roll length, ink and laminate area." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            {signageSizePresets.map((preset) => {
              const selected = widthMm === preset.width && heightMm === preset.height;
              return (
                <button key={preset.label} type="button" onClick={() => setPresetSize(preset.width, preset.height, "artwork")} style={cardButtonStyle(selected, "#2563eb")}>
                  <span style={{ fontSize: 30 }}>▭</span>
                  <strong>{preset.label}</strong>
                  <span style={{ color: "#64748b" }}>{((numberValue(preset.width) / 1000) * (numberValue(preset.height) / 1000)).toFixed(2)}m²</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}><b>Custom width mm</b><input value={widthMm} onChange={(event) => setWidthMm(event.target.value)} placeholder="eg 600" style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 6 }}><b>Custom height mm</b><input value={heightMm} onChange={(event) => setHeightMm(event.target.value)} placeholder="eg 900" style={inputStyle} /></label>
            <button type="button" onClick={() => setActiveStep("artwork")} style={primaryButton}>Continue</button>
          </div>
        </div>
      );
    }

    if (activeStep === "artwork") return renderArtworkStep(flowType === "small_format" ? (isDuplicateBook ? "small_finishing" : "small_sides") : "print");

    if (activeStep === "print") {
      if (isRollStockBase) {
        return (
          <div style={{ display: "grid", gap: 16 }}>
            <StepIntro icon="7" title="Roll stock print setup" text="The selected product is already roll stock, so there is no separate print-method choice." />
            <LabourPrompt
              label="Print setup labour minutes"
              value={printSetupMinutes}
              onChange={(value) => { setPrintSetupMinutes(value); setUnitPriceOverridden(false); }}
              onContinue={() => setActiveStep("ink")}
              labourRate={labourRate}
            />
          </div>
        );
      }

      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="7" title="Is it printed?" text="Choose the print method for this quote line. No option is selected by default." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {printMethods.map((method) => (
              <button key={method.key} type="button" onClick={() => setPrint(method.key)} style={cardButtonStyle(printMethod === method.key, method.key === "no_print" ? "#64748b" : "#2563eb")}>
                <span style={{ fontSize: 32 }}>{method.icon}</span>
                <strong style={{ fontSize: 18 }}>{method.label}</strong>
                <span style={{ color: "#64748b", lineHeight: 1.45 }}>{method.description}</span>
              </button>
            ))}
          </div>
          {printed ? (
            <LabourPrompt
              label="Print setup labour minutes"
              value={printSetupMinutes}
              onChange={(value) => { setPrintSetupMinutes(value); setUnitPriceOverridden(false); }}
              onContinue={() => setActiveStep(nextStepAfterPrint(resolvedPrintMethod))}
              labourRate={labourRate}
            />
          ) : null}
        </div>
      );
    }

    if (activeStep === "media") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="8" title={resolvedPrintMethod === "cut_vinyl" ? "Choose cut vinyl" : "Choose roll stock"} text="Pick the actual roll material from Materials. Roll stock is shown as a linear metre cost where possible." />
          {rollMedia.length === 0 ? <EmptyStep text="No roll media found. Create roll stock in Materials first." /> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, maxHeight: 480, overflow: "auto", paddingRight: 4 }}>
            {rollMedia.map((material) => {
              const rate = rollRate(material);
              return (
                <button key={material.id} type="button" onClick={() => { setMediaId(material.id); setUnitPriceOverridden(false); setActiveStep(isRollStockBase ? "size" : resolvedPrintMethod === "cut_vinyl" ? "sides" : "ink"); }} style={cardButtonStyle(mediaId === material.id, "#ea580c")}>
                  <span style={{ fontSize: 28 }}>↻</span>
                  <strong>{material.name}</strong>
                  <span style={{ color: "#64748b" }}>{materialCardMeta(material)}</span>
                  <span style={{ color: "#0f172a", fontWeight: 950 }}>{money(rate.rate)}/lm</span>
                  {rate.note ? <small style={{ color: "#64748b" }}>{rate.note}</small> : null}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeStep === "ink") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="9" title="Choose ink" text="Ink is a sell charge per square metre, not a stock material." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {inkChoices.map((choice) => (
              <button key={choice.key} type="button" onClick={() => { setInk(choice.key); setActiveStep("sides"); }} style={cardButtonStyle(ink === choice.key, choice.key === "white" ? "#64748b" : "#f97316")}>
                <span style={{ fontSize: 34 }}>{choice.icon}</span>
                <strong>{choice.label}</strong>
                <span style={{ color: "#64748b" }}>{choice.description}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeStep === "sides") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="•" title={isClearAcrylic ? "Choose sides and print direction" : "Choose sides"} text={isClearAcrylic ? "Clear acrylic needs a positive/reverse print choice." : "Single or double sided printing affects ink, roll media and laminate usage."} />
          <SidesCards onComplete={() => isClearAcrylic ? undefined : setActiveStep("laminate")} sides={sides} setSides={setSides} />
          {isClearAcrylic ? (
            <div style={{ display: "grid", gap: 10 }}>
              <strong>Clear acrylic print direction</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {[{ key: "positive", label: "Positive print", note: "Print/read from the front." }, { key: "reverse", label: "Reverse print", note: "Reverse printed for viewing through clear acrylic." }].map((choice) => (
                  <button key={choice.key} type="button" onClick={() => { setPrintDirection(choice.key as PrintDirection); setActiveStep("laminate"); }} style={cardButtonStyle(printDirection === choice.key, "#7c3aed")}>
                    <span style={{ fontSize: 30 }}>{choice.key === "reverse" ? "⇄" : "→"}</span>
                    <strong>{choice.label}</strong>
                    <span style={{ color: "#64748b" }}>{choice.note}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    if (activeStep === "laminate") {
      const laminateSelected = Boolean(laminateId && laminateId !== "none");
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="•" title="Choose laminate" text="Choose None or select an actual laminate material from Materials. Laminate labour is optional and may be left blank or set to 0." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <button type="button" onClick={() => { setLaminateId("none"); setLaminateMinutes(""); setActiveStep("finishing"); }} style={cardButtonStyle(laminateId === "none", "#64748b")}>
              <span style={{ fontSize: 30 }}>—</span>
              <strong>None</strong>
              <span style={{ color: "#64748b" }}>No laminate added.</span>
            </button>
            {laminateMaterials.map((material) => {
              const rate = rollRate(material);
              return (
                <button key={material.id} type="button" onClick={() => { setLaminateId(material.id); setLaminateMinutes(""); }} style={cardButtonStyle(laminateId === material.id, "#16a34a")}>
                  <span style={{ fontSize: 30 }}>▱</span>
                  <strong>{material.name}</strong>
                  <span style={{ color: "#64748b" }}>{materialCardMeta(material)}</span>
                  <span style={{ fontWeight: 950 }}>{money(rate.rate)}/lm</span>
                </button>
              );
            })}
          </div>
          {laminateSelected ? (
            <LabourPrompt label="Laminate application minutes" value={laminateMinutes} onChange={setLaminateMinutes} onContinue={() => setActiveStep("finishing")} labourRate={labourRate} />
          ) : null}
        </div>
      );
    }

    if (activeStep === "finishing") {
      const eyeletsSelected = finishings.includes("eyelets");
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="•" title="Choose finishing" text="Tick all finishing processes required, then enter the labour time in minutes." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {finishingOptions.map((item) => (
              <button key={item.key} type="button" onClick={() => toggleFinishing(item.key)} style={cardButtonStyle(finishings.includes(item.key), "#f59e0b")}>
                <span style={{ fontSize: 30 }}>{item.icon}</span>
                <strong>{item.label}</strong>
                <span style={{ color: "#64748b" }}>{item.description}</span>
                <span style={{ fontWeight: 900 }}>Enter minutes when selected</span>
              </button>
            ))}
          </div>
          {eyeletsSelected ? (
            <div style={{ border: "1px solid #fde68a", borderRadius: 20, padding: 14, background: "#fffbeb", display: "grid", gap: 12 }}>
              <strong>Eyelet placement / quantity</strong>
              <select value={eyeletPresetLabel} onChange={(event) => setEyeletPresetLabel(event.target.value)} style={inputStyle}>
                {eyeletPresets.map((preset) => <option key={preset.label} value={preset.label}>{preset.label}{preset.qty > 0 ? ` (${preset.qty})` : ""}</option>)}
              </select>
              {eyeletPresets.find((preset) => preset.label === eyeletPresetLabel)?.qty === 0 ? <input value={customEyeletQty} onChange={(event) => setCustomEyeletQty(event.target.value)} placeholder="Custom eyelet quantity" type="number" min="0" step="1" style={inputStyle} /> : null}
            </div>
          ) : null}
          <SelectedLabourMinutes options={finishingOptions} selected={finishings} values={finishingMinutes} onChange={setFinishingMinutes} eachLabelFor="eyelets" labourRate={labourRate} />
          <button type="button" onClick={() => setActiveStep("review")} style={primaryButton}>Review quote line</button>
        </div>
      );
    }

    if (activeStep === "small_type") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="2" title="Choose small format item" text="Small format has its own flow and does not use signage material questions." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {smallFormatTypes.map((item) => (
              <button key={item.key} type="button" onClick={() => { setSmallType(item.key); setSmallStockId(""); setCustomSmallStockEnabled(false); setNcrCopies(""); setNcrSetsPerBook(""); setNcrCoverColour(""); setNcrTapeColour(""); setActiveStep(item.key === "duplicate_books" ? "ncr_details" : "small_stock"); }} style={cardButtonStyle(smallType === item.key, "#7c3aed")}>
                <span style={{ fontSize: 34 }}>{item.icon}</span>
                <strong>{item.label}</strong>
                <span style={{ color: "#64748b", lineHeight: 1.45 }}>{item.description}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeStep === "ncr_details") {
      const copyOptions = [
        { key: "duplicate", label: "Duplicate", detail: "2 parts: page 1 + page 2" },
        { key: "triplicate", label: "Triplicate", detail: "3 parts: page 1 + page 2 + page 3" },
        { key: "quadruplicate", label: "Quadruplicate", detail: "4 parts: page 1 + page 2 + page 3 + page 4" }
      ];
      const colourOptions = ["White", "Yellow", "Pink", "Blue", "Green", "Canary", "Custom"];
      const coverOptions = ["None", "White", "Yellow", "Pink", "Blue", "Green", "Manilla", "Custom"];
      const tapeOptions = ["Black", "White", "Red", "Blue", "Green", "Yellow", "Clear", "Custom"];
      const count = ncrCopyCount(ncrCopies);
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="3" title="Set up the carbon book" text="Choose duplicate/triplicate, page colours, cover colour and tape colour before choosing stock." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {copyOptions.map((option) => (
              <button key={option.key} type="button" onClick={() => setNcrCopies(option.key)} style={cardButtonStyle(ncrCopies === option.key, "#7c3aed")}>
                <span style={{ fontSize: 34 }}>▱</span>
                <strong>{option.label}</strong>
                <span style={{ color: "#64748b" }}>{option.detail}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}><b>Sets / pages per book</b><input value={ncrSetsPerBook} onChange={(event) => setNcrSetsPerBook(event.target.value)} placeholder="eg 50" type="number" min="1" step="1" style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 6 }}><b>Cover colour</b><select value={ncrCoverColour} onChange={(event) => setNcrCoverColour(event.target.value)} style={inputStyle}><option value="">Choose cover colour</option>{coverOptions.map((colourName) => <option key={colourName} value={colourName}>{colourName}</option>)}</select></label>
            <label style={{ display: "grid", gap: 6 }}><b>Tape colour</b><select value={ncrTapeColour} onChange={(event) => setNcrTapeColour(event.target.value)} style={inputStyle}><option value="">Choose tape colour</option>{tapeOptions.map((colourName) => <option key={colourName} value={colourName}>{colourName}</option>)}</select></label>
          </div>
          {count > 0 ? (
            <div style={{ border: "1px solid #e9d5ff", borderRadius: 20, padding: 14, background: "#faf5ff", display: "grid", gap: 10 }}>
              <strong>Page colours</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                {Array.from({ length: count }).map((_, index) => (
                  <label key={index} style={{ display: "grid", gap: 6 }}>
                    <b>Page {index + 1}</b>
                    <select value={ncrPageColours[index] ?? ""} onChange={(event) => setNcrPageColours((current) => current.map((colourName, colourIndex) => colourIndex === index ? event.target.value : colourName))} style={inputStyle}>
                      {colourOptions.map((colourName) => <option key={colourName} value={colourName}>{colourName}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <button type="button" onClick={() => setActiveStep("small_stock")} disabled={!ncrDetailsComplete} style={{ ...primaryButton, opacity: ncrDetailsComplete ? 1 : 0.45 }}>Continue to stock</button>
        </div>
      );
    }

    if (activeStep === "small_stock") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon={isDuplicateBook ? "4" : "3"} title={isDuplicateBook ? "Choose NCR / carbonless stock" : "Choose paper / card stock"} text="Only small-format stock is shown here. Signage sheets like ACM, acrylic and corflute are hidden from this step." />
          {smallStocks.length === 0 ? <EmptyStep text="No small-format paper/card/NCR stock found. Use Custom stock below or create a small-format material first." /> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, maxHeight: 420, overflow: "auto", paddingRight: 4 }}>
            {smallStocks.map((material) => {
              const rate = sheetUnitRate(material);
              return (
                <button key={material.id} type="button" onClick={() => { setCustomSmallStockEnabled(false); setSmallStockId(material.id); setActiveStep("small_size"); }} style={cardButtonStyle(!customSmallStockEnabled && smallStockId === material.id, "#7c3aed")}>
                  <span style={{ fontSize: 30 }}>▤</span>
                  <strong>{material.name}</strong>
                  <span style={{ color: "#64748b" }}>{materialCardMeta(material)}</span>
                  <span style={{ color: "#0f172a", fontWeight: 950 }}>{money(rate.rate)}/sheet</span>
                  {rate.note ? <small style={{ color: "#64748b" }}>{rate.note}</small> : null}
                </button>
              );
            })}
          </div>
          <div style={{ border: "1px solid #e9d5ff", borderRadius: 22, padding: 16, background: customSmallStockEnabled ? "#faf5ff" : "#fff", display: "grid", gap: 12 }}>
            <button type="button" onClick={() => { setCustomSmallStockEnabled(!customSmallStockEnabled); setSmallStockId(""); }} style={{ ...ghostButton, justifySelf: "start" }}>{customSmallStockEnabled ? "Hide custom stock" : "+ Use custom stock for this quote"}</button>
            {customSmallStockEnabled ? (
              <div style={{ display: "grid", gap: 12 }}>
                <p style={{ margin: 0, color: "#64748b" }}>Use this when the material is not in the library yet. It prices this quote line only.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}><b>Stock name</b><input value={customSmallStockName} onChange={(event) => setCustomSmallStockName(event.target.value)} placeholder="eg NCR White/Yellow/Pink" style={inputStyle} /></label>
                  <label style={{ display: "grid", gap: 6 }}><b>Supplier</b><input value={customSmallStockSupplier} onChange={(event) => setCustomSmallStockSupplier(event.target.value)} placeholder="eg Custom supplier" style={inputStyle} /></label>
                  <label style={{ display: "grid", gap: 6 }}><b>Cost per sheet</b><input value={customSmallStockCost} onChange={(event) => setCustomSmallStockCost(event.target.value)} placeholder="eg 0.18" type="number" min="0" step="0.01" style={inputStyle} /></label>
                  <label style={{ display: "grid", gap: 6 }}><b>Sheet width mm</b><input value={customSmallStockWidthMm} onChange={(event) => setCustomSmallStockWidthMm(event.target.value)} placeholder="eg 210" type="number" min="0" step="1" style={inputStyle} /></label>
                  <label style={{ display: "grid", gap: 6 }}><b>Sheet height mm</b><input value={customSmallStockLengthMm} onChange={(event) => setCustomSmallStockLengthMm(event.target.value)} placeholder="eg 297" type="number" min="0" step="1" style={inputStyle} /></label>
                  <label style={{ display: "grid", gap: 6 }}><b>GSM / thickness</b><input value={customSmallStockGsm} onChange={(event) => setCustomSmallStockGsm(event.target.value)} placeholder="eg 80gsm" style={inputStyle} /></label>
                </div>
                <button type="button" disabled={!customSmallStock} onClick={() => setActiveStep("small_size")} style={{ ...primaryButton, opacity: customSmallStock ? 1 : 0.45 }}>Use this custom stock</button>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    if (activeStep === "small_size") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon={isDuplicateBook ? "5" : "4"} title="Choose finished size" text={isDuplicateBook ? "Choose the finished form size. The book details decide how many copies/sheets are required." : "Finished size calculates paper/card usage and print area."} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            {smallSizePresets.map((preset) => {
              const selected = widthMm === preset.width && heightMm === preset.height;
              return (
                <button key={preset.label} type="button" onClick={() => setPresetSize(preset.width, preset.height, "artwork")} style={cardButtonStyle(selected, "#7c3aed")}>
                  <span style={{ fontSize: 30 }}>▭</span>
                  <strong>{preset.label}</strong>
                  <span style={{ color: "#64748b" }}>{((numberValue(preset.width) / 1000) * (numberValue(preset.height) / 1000)).toFixed(3)}m² each</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}><b>Custom width mm</b><input value={widthMm} onChange={(event) => setWidthMm(event.target.value)} placeholder="eg 90" style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 6 }}><b>Custom height mm</b><input value={heightMm} onChange={(event) => setHeightMm(event.target.value)} placeholder="eg 55" style={inputStyle} /></label>
            <button type="button" onClick={() => setActiveStep("artwork")} style={primaryButton}>Continue</button>
          </div>
        </div>
      );
    }

    if (activeStep === "small_sides") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="6" title="Choose sides" text="Single or double sided affects print and coating usage." />
          <SidesCards onComplete={() => setActiveStep("small_print")} sides={sides} setSides={setSides} />
        </div>
      );
    }

    if (activeStep === "small_print") {
      const choices: Array<{ key: SmallPrintColour; label: string; icon: string; description: string }> = [
        { key: "mono", label: "Mono", icon: "●", description: "Lower print charge for black-only work." },
        { key: "cmyk", label: "CMYK", icon: "◉", description: "Colour print charge." },
        { key: "special", label: "CMYK + special", icon: "◐", description: "Use for white/special ink or extra print pass." }
      ];
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="7" title="Choose print colour" text="This is separate from signage ink so small format doesn't feel like an add-on." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {choices.map((choice) => (
              <button key={choice.key} type="button" onClick={() => { setSmallPrintColour(choice.key); setActiveStep("small_coating"); }} style={cardButtonStyle(smallPrintColour === choice.key, "#7c3aed")}>
                <span style={{ fontSize: 34 }}>{choice.icon}</span>
                <strong>{choice.label}</strong>
                <span style={{ color: "#64748b" }}>{choice.description}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeStep === "small_coating") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="8" title="Choose cello / coating" text="Choose None or pick a cello/laminate material from Materials." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <button type="button" onClick={() => { setSmallCoatingId("none"); setActiveStep("small_finishing"); }} style={cardButtonStyle(smallCoatingId === "none", "#64748b")}>
              <span style={{ fontSize: 30 }}>—</span>
              <strong>None</strong>
              <span style={{ color: "#64748b" }}>No cello or coating.</span>
            </button>
            {laminateMaterials.map((material) => {
              const rate = isRollMaterial(material) ? rollRate(material) : sheetUnitRate(material);
              return (
                <button key={material.id} type="button" onClick={() => { setSmallCoatingId(material.id); setActiveStep("small_finishing"); }} style={cardButtonStyle(smallCoatingId === material.id, "#a855f7")}>
                  <span style={{ fontSize: 30 }}>▱</span>
                  <strong>{material.name}</strong>
                  <span style={{ color: "#64748b" }}>{materialCardMeta(material)}</span>
                  <span style={{ fontWeight: 950 }}>{money(rate.rate)}/{isRollMaterial(material) ? "lm" : "sheet"}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeStep === "small_finishing") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="9" title="Choose small format finishing" text="Tick all bindery/finishing processes required, then enter how long each takes." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {smallFinishingOptions.map((item) => (
              <button key={item.key} type="button" onClick={() => toggleSmallFinishing(item.key)} style={cardButtonStyle(smallFinishings.includes(item.key), "#7c3aed")}>
                <span style={{ fontSize: 30 }}>{item.icon}</span>
                <strong>{item.label}</strong>
                <span style={{ color: "#64748b" }}>{item.description}</span>
                <span style={{ fontWeight: 900 }}>Enter minutes when selected</span>
              </button>
            ))}
          </div>
          <SelectedLabourMinutes options={smallFinishingOptions} selected={smallFinishings} values={smallFinishingMinutes} onChange={setSmallFinishingMinutes} labourRate={labourRate} />
          <button type="button" onClick={() => setActiveStep("small_quantity")} style={primaryButton}>Continue to quantity</button>
        </div>
      );
    }

    if (activeStep === "small_quantity") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="10" title="Choose quantity" text="Quantity drives stock, print and coating usage for small format items." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            {["50", "100", "250", "500", "1000"].map((amount) => (
              <button key={amount} type="button" onClick={() => { setQuantity(amount); setActiveStep("review"); }} style={cardButtonStyle(quantity === amount, "#7c3aed")}>
                <span style={{ fontSize: 28 }}>#</span>
                <strong>{amount}</strong>
                <span style={{ color: "#64748b" }}>items</span>
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}><b>Custom quantity</b><input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="1" step="1" style={inputStyle} /></label>
            <button type="button" onClick={() => setActiveStep("review")} style={primaryButton}>Review</button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gap: 16 }}>
        <StepIntro icon="✓" title="Review and save" text="This is the current quote line. It is not saved until you press the button below." />
        <PricePanel rows={costs} rawCost={rawCost} markupMultiplier={markupMultiplier} profitMultiplier={profitMultiplier} clientDiscount={clientDiscount} unitPrice={unitPrice} lineTotal={lineTotal} quantity={quantityNumber} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>Quantity</b><input name="quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="1" step="any" style={inputStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><b>Unit sell price</b><input name="unitPrice" value={unitPriceOverridden ? manualUnitPrice : autoUnitPrice.toFixed(2)} onChange={(event) => { setManualUnitPrice(event.target.value); setUnitPriceOverridden(true); }} type="number" min="0" step="0.01" style={inputStyle} /></label>
        </div>
        {unitPriceOverridden ? <button type="button" onClick={() => setUnitPriceOverridden(false)} style={ghostButton}>Use calculated price</button> : null}
      </div>
    );
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
    if (!canSave || (builderMode !== "quick" && activeStep !== "review")) {
      event.preventDefault();
    }
  };

  if (builderMode === "saved") {
    return renderSavedProductLayout();
  }

  const headerGradient = flowType === "component"
    ? "linear-gradient(135deg, #7c2d12 0%, #f97316 58%, #fdba74 100%)"
    : flowType === "service"
    ? "linear-gradient(135deg, #064e3b 0%, #059669 58%, #34d399 100%)"
    : flowType === "small_format"
      ? "linear-gradient(135deg, #581c87 0%, #7c3aed 58%, #c084fc 100%)"
      : flowType === "plan_printing"
        ? "linear-gradient(135deg, #064e3b 0%, #0f766e 58%, #5eead4 100%)"
        : flowType === "poster_printing"
          ? "linear-gradient(135deg, #7f1d1d 0%, #dc2626 58%, #fca5a5 100%)"
          : "linear-gradient(135deg, #0f172a 0%, #172554 58%, #155eef 100%)";

  return (
    <form id="quote-builder" action={addQuoteLineAction} onSubmit={handleBuilderSubmit} onKeyDown={handleBuilderKeyDown} style={{ border: "1px solid #dbeafe", borderRadius: 28, overflow: "hidden", background: "#ffffff", display: "grid", scrollMarginTop: 18 }}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="editingLineId" value={editingLine?.id ?? ""} />
      <input type="hidden" name="configurationSnapshot" value={JSON.stringify(configurationSnapshot)} />
      <input type="hidden" name="productName" value={lineName} />
      <input type="hidden" name="optionSummary" value={optionSummary} />
      <input type="hidden" name="unitPrice" value={(unitPriceOverridden ? numberValue(manualUnitPrice, 0) : autoUnitPrice).toFixed(2)} />
      <input type="hidden" name="quantity" value={quantity} />
      {shouldCreateDispatchLine ? (
        <>
          <input type="hidden" name="serviceLineProductName" value={serviceType === "install" ? "Sign Install" : "Delivery"} />
          <input type="hidden" name="serviceLineOptionSummary" value={dispatchSummary} />
          <input type="hidden" name="serviceLineUnitPrice" value={dispatchUnitPrice.toFixed(2)} />
          <input type="hidden" name="serviceLineQuantity" value="1" />
          <input type="hidden" name="serviceLineConfigurationSnapshot" value={JSON.stringify(dispatchConfigurationSnapshot)} />
        </>
      ) : null}
      {editingLine ? (
        <section style={{ borderBottom: "1px solid #bfdbfe", background: initialSnapshot?.reconstructed ? "#fff7ed" : "#eff6ff", color: initialSnapshot?.reconstructed ? "#9a3412" : "#1d4ed8", padding: "14px 18px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 3 }}>
            <strong>{initialSnapshot?.reconstructed ? "Rebuilding an older quote line" : `Editing ${editingLine.productName}`}</strong>
            <span style={{ fontSize: 13 }}>{initialSnapshot?.reconstructed ? "Known values were reconstructed from the old summary. Check each selection before saving; the original line remains unchanged until you update it." : "This is the original structured configuration. Changing selections recalculates the price and updates the same quote line."}</span>
          </div>
          <a href={`/quotes?selected=${quoteId}#saved-lines`} style={{ minHeight: 38, borderRadius: 12, border: "1px solid currentColor", color: "inherit", background: "#fff", padding: "0 12px", display: "inline-flex", alignItems: "center", textDecoration: "none", fontWeight: 900 }}>Cancel edit</a>
        </section>
      ) : null}
      {builderMode === "quick" ? renderQuickQuoteLayout() : (
        <>
      <div style={{ background: headerGradient, color: "#fff", padding: 22, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12, fontWeight: 950, color: flowType === "small_format" ? "#f3e8ff" : "#bfdbfe" }}>Quote-side builder</p>
            <h3 style={{ margin: "6px 0 0", fontSize: 30, letterSpacing: "-0.04em" }}>{stepTitle()}</h3>
            <p style={{ margin: "6px 0 0", color: flowType === "small_format" ? "#f3e8ff" : "#dbeafe" }}>Build the quote line from materials, labour and real quoting choices.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ borderRadius: 999, background: "rgba(255,255,255,0.12)", padding: "9px 12px", fontSize: 12, fontWeight: 950 }}>{steps.filter((step) => step.complete).length}/{steps.length} steps</span>
            <span style={{ borderRadius: 999, background: "rgba(255,255,255,0.12)", padding: "9px 12px", fontSize: 12, fontWeight: 950 }}>Sell ×{usage(sellMultiplier)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {steps.map((step) => (
            <button key={step.key} type="button" onClick={() => setActiveStep(step.key)} style={{ border: step.key === activeStep ? "1px solid #fff" : "1px solid rgba(255,255,255,0.22)", borderRadius: 999, background: step.key === activeStep ? "#ffffff" : "rgba(255,255,255,0.1)", color: step.key === activeStep ? "#0f172a" : "#e0f2fe", padding: "8px 11px", fontWeight: 950, cursor: "pointer", fontSize: 12 }}>
              {step.complete ? "✓" : step.icon} {step.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "270px minmax(0, 1fr)", gap: 18, padding: 20, background: flowType === "component" ? "#fff7ed" : flowType === "service" ? "#f0fdf4" : flowType === "small_format" ? "#fbf7ff" : "#f8fbff" }}>
        <aside style={{ display: "grid", gap: 14, alignSelf: "start" }}>
          <div style={{ border: "1px solid #dfe7f2", borderRadius: 22, padding: 16, background: "#fff", display: "grid", gap: 10 }}>
            <strong>Current build</strong>
            <SummaryRow label="Flow" value={flowType ? flowTypeLabel(flowType) : undefined} />
            {flowType === "component" ? (
              <>
                <SummaryRow label="Component" value={componentName || undefined} />
                <SummaryRow label="Parts" value={pricedComponentParts.length ? `${pricedComponentParts.length} costed part${pricedComponentParts.length === 1 ? "" : "s"}` : undefined} />
                <SummaryRow label="Labour" value={componentLabourMinutes ? minutesLabel(componentLabourMinutes) : undefined} />
              </>
            ) : flowType === "service" ? (
              <>
                <SummaryRow label="Service" value={serviceLabel} />
                {serviceType === "delivery" ? <SummaryRow label="Delivery charge" value={deliveryCharge ? money(numberValue(deliveryCharge, 0)) : undefined} /> : null}
                {serviceType === "install" ? <SummaryRow label="Crew" value={`${installCrewSize || "1"} person${numberValue(installCrewSize, 1) === 1 ? "" : "s"}`} /> : null}
                {serviceType === "install" ? <SummaryRow label="Install time" value={installMinutes ? minutesLabel(installMinutes) : undefined} /> : null}
                {serviceType === "install" ? <SummaryRow label="Travel" value={travelCharge ? money(numberValue(travelCharge, 0)) : undefined} /> : null}
                {serviceType === "install" ? <SummaryRow label="Fixings" value={serviceFixings.length ? selectedKeys(fixingOptions, serviceFixings) : undefined} /> : null}
              </>
            ) : flowType === "small_format" ? (
              <>
                <SummaryRow label="Item" value={selectedSmallType?.label} />
                <SummaryRow label="Stock" value={selectedSmallStock?.name} />
                {isDuplicateBook ? <SummaryRow label="Book" value={ncrCopies ? `${ncrCopiesCount} part · ${ncrSetsPerBook || "?"} sets/book` : undefined} /> : null}
                {isDuplicateBook ? <SummaryRow label="Page colours" value={ncrCopiesCount ? pageColourSummary(ncrCopiesCount, ncrPageColours) : undefined} /> : null}
                {isDuplicateBook ? <SummaryRow label="Cover / tape" value={ncrCoverColour && ncrTapeColour ? `${ncrCoverColour} cover · ${ncrTapeColour} tape` : undefined} /> : null}
                <SummaryRow label="Size" value={width > 0 && height > 0 ? `${dimensionMm(width)} × ${dimensionMm(height)}mm` : undefined} />
                <SummaryRow label="Artwork" value={artworkChoice === "required" ? numberValue(artworkMinutes, 0) > 0 ? minutesLabel(artworkMinutes) : "Required" : artworkChoice === "client_supplied" ? "Client supplied" : undefined} />
                {!isDuplicateBook ? <SummaryRow label="Sides" value={sides ? `${sides === "double" ? "Double" : "Single"} sided` : undefined} /> : null}
                {!isDuplicateBook ? <SummaryRow label="Print" value={smallPrintColour ? smallPrintColour === "mono" ? "Mono" : smallPrintColour === "cmyk" ? "CMYK" : "CMYK + special" : undefined} /> : null}
                {!isDuplicateBook ? <SummaryRow label="Coating" value={selectedSmallCoatingName || undefined} /> : null}
                <SummaryRow label="Finishing" value={smallFinishingSummary || undefined} />
              </>
            ) : (
              <>
                <SummaryRow label="Base" value={selectedBase?.label} />
                <SummaryRow label="Material" value={selectedMainMaterial?.name} />
                <SummaryRow label="Sheet use" value={sheetUseLabel || undefined} />
                <SummaryRow label="Size" value={width > 0 && height > 0 ? `${dimensionMm(width)} × ${dimensionMm(height)}mm` : undefined} />
                <SummaryRow label="Artwork" value={artworkChoice === "required" ? numberValue(artworkMinutes, 0) > 0 ? minutesLabel(artworkMinutes) : "Required" : artworkChoice === "client_supplied" ? "Client supplied" : undefined} />
                {!isRollStockBase ? <SummaryRow label="Print" value={printMethods.find((item) => item.key === resolvedPrintMethod)?.label} /> : null}
                <SummaryRow label="Print setup" value={printed && printSetupMinutes ? minutesLabel(printSetupMinutes) : undefined} />
                {!isRollStockBase ? <SummaryRow label="Media" value={selectedMedia?.name} /> : null}
                <SummaryRow label="Ink" value={inkChoices.find((item) => item.key === ink)?.label} />
                <SummaryRow label="Laminate" value={selectedLaminateName || undefined} />
                <SummaryRow label="Finishing" value={finishingSummary || undefined} />
              </>
            )}
          </div>
          <div style={{ border: "1px solid #bbf7d0", borderRadius: 22, padding: 16, background: "#f0fdf4", display: "grid", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 950, color: "#067647", textTransform: "uppercase" }}>Live price</span>
            <strong style={{ fontSize: 26 }}>{money(unitPrice)}</strong>
            <span style={{ color: "#475467", fontSize: 13 }}>cost {money(rawCost)} × markup {usage(markupMultiplier)} × profit {usage(profitMultiplier)}{clientDiscount.percent ? ` - ${usage(clientDiscount.percent)}% ${clientDiscount.reason}` : ""}</span>
          </div>
        </aside>

        <section style={{ border: "1px solid #dfe7f2", borderRadius: 24, padding: 18, background: "#fff", minHeight: 520, display: "grid", gap: 16, alignContent: "start" }}>
          {renderStep()}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
            <button type="button" disabled={!previousStep} onClick={() => previousStep && setActiveStep(previousStep)} style={{ ...ghostButton, opacity: previousStep ? 1 : 0.45 }}>Back</button>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {activeStep !== "review" && nextStep ? <button type="button" onClick={() => setActiveStep(nextStep)} style={ghostButton}>Skip / next</button> : null}
              {activeStep === "review" ? (
                <button type="submit" disabled={!canSave} style={{ ...primaryButton, opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}>{canSave ? editingLine ? "Update quote line" : "Save quote line" : "Complete required cards"}</button>
              ) : <button type="button" onClick={() => setActiveStep("review")} style={primaryButton}>Review</button>}
            </div>
          </div>
        </section>
      </div>

      <div style={{ borderTop: "1px solid #e5e7eb", padding: 18, display: "grid", gap: 12, background: "#fff" }}>
        <label style={{ display: "grid", gap: 6 }}><b>Line notes</b><textarea name="notes" value={lineNotes} onChange={(event) => setLineNotes(event.target.value)} placeholder="Optional notes for this line" style={textareaStyle} /></label>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, background: "#f8fafc", display: "grid", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 950, color: "#344054", textTransform: "uppercase", letterSpacing: "0.05em" }}>Current unsaved line</span>
          <span style={{ color: optionSummary ? "#111827" : "#667085" }}>{optionSummary || "Complete the card flow above to build this quote line."}</span>
        </div>
        <button type="submit" disabled={!canSave || activeStep !== "review"} style={{ ...darkButton, opacity: canSave && activeStep === "review" ? 1 : 0.45, cursor: canSave && activeStep === "review" ? "pointer" : "not-allowed" }}>{activeStep === "review" ? canSave ? editingLine ? "Update quote line" : "Save quote line" : "Complete required cards before saving" : "Review before saving"}</button>
      </div>
        </>
      )}
    </form>
  );
}

function StepIntro({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "start" }}>
      <span style={{ width: 48, height: 48, borderRadius: 18, display: "grid", placeItems: "center", background: "#eff6ff", color: "#155eef", fontWeight: 950, fontSize: 20 }}>{icon}</span>
      <div>
        <h4 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.03em" }}>{title}</h4>
        <p style={{ margin: "5px 0 0", color: "#64748b", lineHeight: 1.55 }}>{text}</p>
      </div>
    </div>
  );
}

function EmptyStep({ text }: { text: string }) {
  return <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412", borderRadius: 18, padding: 14, fontWeight: 800 }}>{text}</div>;
}

function SummaryRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: "grid", gap: 2, padding: "8px 0", borderTop: "1px solid #eef2f7" }}>
      <span style={{ fontSize: 11, fontWeight: 950, color: "#64748b", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontWeight: 900, color: value ? "#0f172a" : "#94a3b8" }}>{value || "Choose later"}</span>
    </div>
  );
}

function LabourPrompt({ label, value, onChange, onContinue, labourRate }: { label: string; value: string; onChange: (value: string) => void; onContinue: () => void; labourRate: number }) {
  const enteredMinutes = numberValue(value, 0);
  const labourCost = enteredMinutes * (labourRate / 60);

  return (
    <div style={{ border: "1px solid #bbf7d0", borderRadius: 20, padding: 14, background: "#f0fdf4", display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6 }}><b>{label} (optional)</b><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Optional, eg 15" type="number" min="0" step="1" style={inputStyle} /></label>
      <span style={{ color: "#475467", fontSize: 13 }}>
        {enteredMinutes > 0 ? `${minutesLabel(enteredMinutes)} at ${money(labourRate)}/hr = ${money(labourCost)} labour` : "Leave blank or enter 0 to add no labour charge."}
      </span>
      <button type="button" onClick={onContinue} style={primaryButton}>Continue</button>
    </div>
  );
}

function SidesCards({ sides, setSides, onComplete }: { sides: SidesChoice; setSides: (value: SidesChoice) => void; onComplete: () => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
      {[{ key: "single", label: "Single sided", icon: "◧" }, { key: "double", label: "Double sided", icon: "◨" }].map((choice) => (
        <button key={choice.key} type="button" onClick={() => { setSides(choice.key as SidesChoice); onComplete(); }} style={cardButtonStyle(sides === choice.key, "#0ea5e9")}>
          <span style={{ fontSize: 34 }}>{choice.icon}</span>
          <strong>{choice.label}</strong>
          <span style={{ color: "#64748b" }}>{choice.key === "double" ? "Doubles print-related usage." : "One printed face."}</span>
        </button>
      ))}
    </div>
  );
}

function SelectedLabourMinutes<T extends { key: string; label: string }>({ options, selected, values, onChange, eachLabelFor, labourRate }: { options: T[]; selected: string[]; values: Record<string, string>; onChange: (value: Record<string, string>) => void; eachLabelFor?: string; labourRate: number }) {
  const chosen = options.filter((item) => selected.includes(item.key));
  if (chosen.length === 0) return null;
  return (
    <div style={{ border: "1px solid #dbeafe", borderRadius: 20, padding: 14, background: "#f8fbff", display: "grid", gap: 10 }}>
      <strong>Labour minutes for selected finishing</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {chosen.map((item) => (
          <label key={item.key} style={{ display: "grid", gap: 6 }}>
            <b>{item.label} {item.key === eachLabelFor ? "minutes each" : "minutes"}</b>
            <input value={values[item.key] ?? ""} onChange={(event) => onChange({ ...values, [item.key]: event.target.value })} placeholder={item.key === eachLabelFor ? "eg 2" : "eg 15"} type="number" min="0" step="1" style={inputStyle} />
          </label>
        ))}
      </div>
      <span style={{ color: "#475467", fontSize: 13 }}>Enter normal minutes. The system converts them to labour at {money(labourRate)}/hr before global markup and profit.</span>
    </div>
  );
}

function PricePanel({ rows, rawCost, markupMultiplier, profitMultiplier, clientDiscount, unitPrice, lineTotal, quantity }: { rows: CostRow[]; rawCost: number; markupMultiplier: number; profitMultiplier: number; clientDiscount: { percent: number; reason: string }; unitPrice: number; lineTotal: number; quantity: number }) {
  return (
    <div style={{ border: "1px solid #bbf7d0", borderRadius: 20, padding: 16, background: "#f0fdf4", display: "grid", gap: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 950, color: "#067647", textTransform: "uppercase", letterSpacing: "0.05em" }}>Calculated quote price</span>
      <strong style={{ fontSize: 22 }}>{money(unitPrice)} sell price per unit · {money(lineTotal)} line total at qty {usage(quantity)}</strong>
      <div style={{ color: "#344054", fontSize: 13, display: "grid", gap: 4 }}>
        <div><b>Raw cost:</b> {money(rawCost)}</div>
        <div><b>Global markup:</b> ×{usage(markupMultiplier)}</div>
        <div><b>Global profit:</b> ×{usage(profitMultiplier)}</div>
        {clientDiscount.percent > 0 ? <div><b>Client discount:</b> -{usage(clientDiscount.percent)}% {clientDiscount.reason ? `(${clientDiscount.reason})` : ""}</div> : null}
      </div>
      {rows.length > 0 ? (
        <div style={{ display: "grid", gap: 7 }}>
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} style={{ color: "#344054", fontSize: 13 }}>
              <b>{row.label}</b>: {row.detail} · {usage(row.amount)} {row.unit} × {money(row.rate)}/{row.unit} = <b>{money(row.cost)}</b>{row.note ? <span style={{ color: "#667085" }}> · {row.note}</span> : null}
            </div>
          ))}
        </div>
      ) : <span style={{ color: "#667085", fontSize: 13 }}>No cost yet. Complete the cards to see the live calculation.</span>}
    </div>
  );
}
