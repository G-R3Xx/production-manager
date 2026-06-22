"use client";

import { useMemo, useState } from "react";
import { addQuoteLineAction } from "./actions";

type QuoteMaterial = {
  id: string;
  name: string;
  materialType?: string | null;
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

type QuoteMaterialFlowBuilderProps = {
  quoteId: string;
  materials: QuoteMaterial[];
  pricingSettings?: PricingSettings;
};

type FlowType = "" | "signage" | "small_format" | "service" | "component";
type BaseType = "acrylic" | "acm" | "corflute" | "pvc" | "banner" | "other_sheet";
type SmallFormatType = "business_cards" | "flyers" | "brochures" | "booklets" | "duplicate_books" | "stickers";
type ServiceType = "" | "pickup" | "delivery" | "install";
type PrintMethod = "" | "no_print" | "direct_print" | "roll_stock" | "cut_vinyl";
type InkChoice = "" | "cmyk" | "white" | "both";
type SidesChoice = "" | "single" | "double";
type PrintDirection = "" | "positive" | "reverse";
type ArtworkChoice = "" | "required" | "client_supplied";
type SmallPrintColour = "" | "mono" | "cmyk" | "special";
type StepKey =
  | "flow"
  | "base"
  | "thickness"
  | "colour"
  | "size"
  | "artwork"
  | "print"
  | "media"
  | "ink"
  | "sides"
  | "laminate"
  | "finishing"
  | "small_type"
  | "ncr_details"
  | "small_stock"
  | "small_size"
  | "small_sides"
  | "small_print"
  | "small_coating"
  | "small_finishing"
  | "small_quantity"
  | "service_type"
  | "service_details"
  | "service_fixings"
  | "component_details"
  | "component_parts"
  | "component_labour"
  | "review";

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
  { key: "banner", label: "Banner / roll", icon: "▰", description: "Roll-stock banner style items.", accent: "#ea580c" },
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

const printMethods: Array<{ key: Exclude<PrintMethod, "">; label: string; icon: string; description: string }> = [
  { key: "no_print", label: "No print", icon: "—", description: "Material only. Skip ink and print media." },
  { key: "direct_print", label: "Direct print", icon: "◉", description: "Print directly to the base material." },
  { key: "roll_stock", label: "Roll stock", icon: "↻", description: "Pick SAV, print vinyl, banner media or similar roll stock." },
  { key: "cut_vinyl", label: "Cut vinyl", icon: "✂", description: "Pick a roll vinyl material but no ink charge is added." }
];


const finishingOptions = [
  { key: "jingwei", label: "Jingwei cutting", icon: "✦", description: "Add cutting/plotting labour." },
  { key: "router", label: "Router / CNC cut", icon: "⚙", description: "Add router or CNC cutting labour." },
  { key: "drill_holes", label: "Drill holes", icon: "●", description: "Add drilling labour." },
  { key: "eyelets", label: "Eyelets", icon: "◎", description: "Ask placement/quantity and charge per eyelet." }
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
  { key: "install", label: "Install", icon: "⚒", description: "Charge install time by crew size, hours and fixing consumables." }
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

function materialText(material: QuoteMaterial): string {
  return `${material.name} ${material.materialType ?? ""} ${material.gsm ?? ""} ${material.notes ?? ""}`.toLowerCase();
}

function isSheetMaterial(material: QuoteMaterial): boolean {
  const type = String(material.materialType ?? "").toLowerCase();
  const text = materialText(material);
  return type.includes("sheet") || type.includes("paper") || type.includes("card") || text.includes("acm") || text.includes("acrylic") || text.includes("corflute") || text.includes("pvc") || text.includes("foamboard");
}

function isSmallFormatStock(material: QuoteMaterial): boolean {
  const type = String(material.materialType ?? "").toLowerCase();
  const text = materialText(material);
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const signageWords = ["acm", "aluminium composite", "aluminum composite", "acrylic", "perspex", "pmma", "corflute", "correx", "pvc", "foamboard", "foam board", "banner", "sav", "vinyl", "laminate"];
  if (signageWords.some((word) => text.includes(word))) return false;
  return type.includes("paper") || type.includes("card") || type.includes("small") || text.includes("paper") || text.includes("card") || text.includes("gsm") || text.includes("ncr") || text.includes("carbon") || text.includes("bond") || purchaseUom.includes("ream");
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

function sheetUsageForItem(material: QuoteMaterial, pieceWidthMm: number, pieceHeightMm: number): { amount: number; note?: string } {
  const dimensions = bestSheetDimensions(material);
  if (!dimensions || pieceWidthMm <= 0 || pieceHeightMm <= 0) return { amount: 0, note: "sheet size missing" };

  const parentArea = (dimensions.width / 1000) * (dimensions.length / 1000);
  const itemArea = (pieceWidthMm / 1000) * (pieceHeightMm / 1000);
  const perSheet = piecesPerSheet(dimensions.width, dimensions.length, pieceWidthMm, pieceHeightMm);

  if (perSheet > 0) {
    return {
      amount: 1 / perSheet,
      note: `${perSheet} up per parent sheet · ${usage(parentArea)}sqm parent sheet`
    };
  }

  if (parentArea > 0 && itemArea > 0) {
    const fullSheets = Math.max(1, Math.ceil(itemArea / parentArea));
    return { amount: fullSheets, note: `does not fit one parent sheet; ${usage(parentArea)}sqm parent sheet` };
  }

  return { amount: 0, note: "sheet size missing" };
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
  if (purchaseUom.includes("roll") && stockQty > 0 && ["lm", "m", "metre", "meter"].includes(stockUom)) return { rate: purchaseCost / stockQty, note: `${usage(stockQty)}lm roll` };
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
  return { amount: Math.max(widthMm, heightMm) / 1000, note: "wider than roll; check paneling" };
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
    return { amount, unroundedAmount, note: [single.note, "wider than roll; check paneling", `${usage(unroundedAmount)}lm before whole-metre rounding`].filter(Boolean).join(" · ") };
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

export function QuoteMaterialFlowBuilder({ quoteId, materials, pricingSettings }: QuoteMaterialFlowBuilderProps) {
  const [activeStep, setActiveStep] = useState<StepKey>("flow");
  const [flowType, setFlowType] = useState<FlowType>("");

  const [baseType, setBaseType] = useState<BaseType | "">("");
  const [thickness, setThickness] = useState("");
  const [colour, setColour] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [artworkChoice, setArtworkChoice] = useState<ArtworkChoice>("");
  const [artworkHours, setArtworkHours] = useState("");
  const [printMethod, setPrintMethod] = useState<PrintMethod>("");
  const [mediaId, setMediaId] = useState("");
  const [ink, setInk] = useState<InkChoice>("");
  const [sides, setSides] = useState<SidesChoice>("");
  const [printDirection, setPrintDirection] = useState<PrintDirection>("");
  const [laminateId, setLaminateId] = useState("");
  const [laminateHours, setLaminateHours] = useState("");
  const [finishings, setFinishings] = useState<string[]>([]);
  const [finishingHours, setFinishingHours] = useState<Record<string, string>>({});
  const [eyeletPresetLabel, setEyeletPresetLabel] = useState(eyeletPresets[0]?.label ?? "");
  const [customEyeletQty, setCustomEyeletQty] = useState("");

  const [smallType, setSmallType] = useState<SmallFormatType | "">("");
  const [smallStockId, setSmallStockId] = useState("");
  const [customSmallStockEnabled, setCustomSmallStockEnabled] = useState(false);
  const [customSmallStockName, setCustomSmallStockName] = useState("");
  const [customSmallStockSupplier, setCustomSmallStockSupplier] = useState("");
  const [customSmallStockCost, setCustomSmallStockCost] = useState("");
  const [customSmallStockWidthMm, setCustomSmallStockWidthMm] = useState("");
  const [customSmallStockLengthMm, setCustomSmallStockLengthMm] = useState("");
  const [customSmallStockGsm, setCustomSmallStockGsm] = useState("");
  const [ncrCopies, setNcrCopies] = useState("");
  const [ncrSetsPerBook, setNcrSetsPerBook] = useState("");
  const [ncrPageColours, setNcrPageColours] = useState(["White", "Yellow", "Pink", "Blue"]);
  const [ncrCoverColour, setNcrCoverColour] = useState("");
  const [ncrTapeColour, setNcrTapeColour] = useState("");
  const [smallPrintColour, setSmallPrintColour] = useState<SmallPrintColour>("");
  const [smallCoatingId, setSmallCoatingId] = useState("");
  const [smallFinishings, setSmallFinishings] = useState<string[]>([]);
  const [smallFinishingHours, setSmallFinishingHours] = useState<Record<string, string>>({});

  const [serviceType, setServiceType] = useState<ServiceType>("");
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const [installCrewSize, setInstallCrewSize] = useState("1");
  const [installHours, setInstallHours] = useState("");
  const [travelCharge, setTravelCharge] = useState("");
  const [serviceFixings, setServiceFixings] = useState<string[]>([]);
  const [serviceFixingQty, setServiceFixingQty] = useState<Record<string, string>>({});
  const [serviceFixingRate, setServiceFixingRate] = useState<Record<string, string>>({});

  const [componentName, setComponentName] = useState("");
  const [componentDescription, setComponentDescription] = useState("");
  const [componentParts, setComponentParts] = useState<CustomComponentPart[]>(() => [createBlankComponentPart()]);
  const [componentLabourLabel, setComponentLabourLabel] = useState("Build / assembly labour");
  const [componentLabourHours, setComponentLabourHours] = useState("");

  const [quantity, setQuantity] = useState("1");
  const [unitPriceOverridden, setUnitPriceOverridden] = useState(false);
  const [manualUnitPrice, setManualUnitPrice] = useState("0.00");

  const markupMultiplier = multiplierValue(pricingSettings?.markupMultiplier, 1.5);
  const profitMultiplier = multiplierValue(pricingSettings?.profitMultiplier, 1.2);
  const sellMultiplier = markupMultiplier * profitMultiplier;
  const labourRate = numberValue(pricingSettings?.labourRate, defaultLabourRate);
  const inkRatePerSqm = numberValue(pricingSettings?.inkRatePerSqm, defaultInkRatePerSqm);
  const monoRatePerSqm = numberValue(pricingSettings?.monoRatePerSqm, defaultMonoRatePerSqm);
  const signageSizePresets = useMemo(() => normaliseSizePresets(pricingSettings?.signageSizePresets, defaultSignageSizePresets), [pricingSettings?.signageSizePresets]);
  const smallSizePresets = useMemo(() => normaliseSizePresets(pricingSettings?.smallSizePresets, defaultSmallSizePresets), [pricingSettings?.smallSizePresets]);
  const inkChoices = useMemo<Array<{ key: Exclude<InkChoice, "">; label: string; icon: string; description: string }>>(() => [
    { key: "cmyk", label: "CMYK", icon: "●", description: `${money(inkRatePerSqm)}/m² colour ink charge.` },
    { key: "white", label: "White", icon: "○", description: `${money(inkRatePerSqm)}/m² white ink charge.` },
    { key: "both", label: "CMYK + White", icon: "◐", description: `${money(inkRatePerSqm * 2)}/m² total ink charge.` }
  ], [inkRatePerSqm]);

  const baseMaterials = useMemo(() => {
    if (!baseType) return [];
    return materials.filter((material) => materialMatchesBase(material, baseType));
  }, [materials, baseType]);

  const thicknessOptions = useMemo(() => uniq(baseMaterials.map(thicknessFor)), [baseMaterials]);
  const colourOptions = useMemo(() => {
    const materialPool = thickness ? baseMaterials.filter((material) => thicknessFor(material) === thickness) : baseMaterials;
    return uniq(materialPool.map(colourFor));
  }, [baseMaterials, thickness]);

  const selectedMainMaterial = useMemo(() => {
    const materialPool = baseMaterials.filter((material) => {
      const thicknessOk = !thickness || thicknessFor(material) === thickness;
      const colourOk = !colour || colourFor(material) === colour;
      return thicknessOk && colourOk;
    });
    return materialPool[0];
  }, [baseMaterials, thickness, colour]);

  const rollMedia = useMemo(() => materials.filter(isPrintRollMaterial), [materials]);
  const laminateMaterials = useMemo(() => materials.filter(isLaminateMaterial), [materials]);
  const smallStocks = useMemo(() => materials.filter(isSmallFormatStock), [materials]);
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
  const selectedSmallStock = customSmallStockEnabled ? customSmallStock : smallStocks.find((material) => material.id === smallStockId);
  const selectedSmallCoating = laminateMaterials.find((material) => material.id === smallCoatingId);
  const eyeletMaterial = materials.find((material) => materialText(material).includes("eyelet")) ?? materials.find((material) => String(material.materialType ?? "").toLowerCase().includes("fix"));

  const selectedBase = baseTypes.find((item) => item.key === baseType);
  const selectedSmallType = smallFormatTypes.find((item) => item.key === smallType);
  const isDuplicateBook = smallType === "duplicate_books";
  const ncrCopiesCount = ncrCopyCount(ncrCopies);
  const ncrDetailsComplete = !isDuplicateBook || Boolean(ncrCopiesCount > 0 && numberValue(ncrSetsPerBook, 0) > 0 && ncrCoverColour && ncrTapeColour);
  const isClearAcrylic = baseType === "acrylic" && colour.toLowerCase() === "clear";
  const printed = printMethod !== "" && printMethod !== "no_print";
  const needsMediaStep = printMethod === "roll_stock" || printMethod === "cut_vinyl";
  const needsInkStep = printMethod === "direct_print" || printMethod === "roll_stock";
  const width = numberValue(widthMm, 0);
  const height = numberValue(heightMm, 0);
  const areaSqm = width > 0 && height > 0 ? (width / 1000) * (height / 1000) : 0;
  const sideMultiplier = sides === "double" ? 2 : 1;
  const quantityNumber = Math.max(1, numberValue(quantity, 1));
  const pricedComponentParts = componentParts.filter((part) => {
    const qty = numberValue(part.qty, 0);
    const material = materials.find((item) => item.id === part.materialId);
    const rate = part.unitCost.trim() ? numberValue(part.unitCost, 0) : rateForComponentUnit(material, part.unit).rate;
    return qty > 0 && rate > 0 && (part.name.trim() || material);
  });
  const componentHasCost = pricedComponentParts.length > 0 || numberValue(componentLabourHours, 0) > 0;

  const steps = useMemo(() => {
    const next: Array<{ key: StepKey; label: string; complete: boolean; icon: string }> = [
      { key: "flow", label: "Type", complete: Boolean(flowType), icon: "1" }
    ];

    if (flowType === "service") {
      next.push({ key: "service_type", label: "Service", complete: Boolean(serviceType), icon: "2" });
      next.push({ key: "service_details", label: serviceType === "install" ? "Crew / time" : serviceType === "delivery" ? "Charge" : "Details", complete: serviceType === "pickup" || (serviceType === "delivery" && numberValue(deliveryCharge, 0) >= 0) || (serviceType === "install" && numberValue(installCrewSize, 0) > 0 && numberValue(installHours, 0) > 0), icon: "3" });
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

    if (flowType === "small_format") {
      next.push({ key: "small_type", label: "Print item", complete: Boolean(smallType), icon: "2" });
      if (isDuplicateBook) next.push({ key: "ncr_details", label: "Book details", complete: ncrDetailsComplete, icon: "3" });
      next.push({ key: "small_stock", label: "Stock", complete: Boolean(selectedSmallStock), icon: isDuplicateBook ? "4" : "3" });
      next.push({ key: "small_size", label: "Size", complete: width > 0 && height > 0, icon: isDuplicateBook ? "5" : "4" });
      next.push({ key: "artwork", label: "Artwork", complete: artworkChoice === "client_supplied" || (artworkChoice === "required" && numberValue(artworkHours, 0) > 0), icon: isDuplicateBook ? "6" : "5" });
      if (!isDuplicateBook) {
        next.push({ key: "small_sides", label: "Sides", complete: Boolean(sides), icon: "6" });
        next.push({ key: "small_print", label: "Print colour", complete: Boolean(smallPrintColour), icon: "7" });
        next.push({ key: "small_coating", label: "Coating", complete: Boolean(smallCoatingId), icon: "8" });
      }
      next.push({ key: "small_finishing", label: "Finishing", complete: true, icon: isDuplicateBook ? "7" : "9" });
      next.push({ key: "small_quantity", label: "Quantity", complete: quantityNumber > 0, icon: isDuplicateBook ? "8" : "10" });
      next.push({ key: "review", label: "Review", complete: Boolean(smallType && ncrDetailsComplete && selectedSmallStock && width > 0 && height > 0 && artworkChoice && (isDuplicateBook || (sides && smallPrintColour && smallCoatingId))), icon: "✓" });
      return next;
    }

    if (flowType === "signage") {
      next.push({ key: "base", label: "Base material", complete: Boolean(baseType), icon: "2" });
      next.push({ key: "thickness", label: "Thickness", complete: Boolean(thickness), icon: "3" });
      next.push({ key: "colour", label: "Colour", complete: Boolean(colour && selectedMainMaterial), icon: "4" });
      next.push({ key: "size", label: "Size", complete: width > 0 && height > 0, icon: "5" });
      next.push({ key: "artwork", label: "Artwork", complete: artworkChoice === "client_supplied" || (artworkChoice === "required" && numberValue(artworkHours, 0) > 0), icon: "6" });
      next.push({ key: "print", label: "Print method", complete: Boolean(printMethod), icon: "7" });
      if (needsMediaStep) next.push({ key: "media", label: printMethod === "cut_vinyl" ? "Cut vinyl" : "Roll media", complete: Boolean(mediaId), icon: "8" });
      if (needsInkStep) next.push({ key: "ink", label: "Ink", complete: Boolean(ink), icon: "9" });
      if (printed) next.push({ key: "sides", label: isClearAcrylic ? "Sides / direction" : "Sides", complete: Boolean(sides && (!isClearAcrylic || printDirection)), icon: "•" });
      if (printed) next.push({ key: "laminate", label: "Laminate", complete: Boolean(laminateId && (laminateId === "none" || laminateHours.trim().length > 0)), icon: "•" });
      next.push({ key: "finishing", label: "Finishing", complete: true, icon: "•" });
      next.push({ key: "review", label: "Review", complete: Boolean(baseType && selectedMainMaterial && width > 0 && height > 0 && artworkChoice && printMethod), icon: "✓" });
    }

    return next;
  }, [flowType, componentName, pricedComponentParts.length, componentHasCost, smallType, isDuplicateBook, ncrDetailsComplete, selectedSmallStock, width, height, artworkChoice, artworkHours, sides, smallPrintColour, smallCoatingId, quantityNumber, baseType, thickness, colour, selectedMainMaterial, printMethod, needsMediaStep, needsInkStep, mediaId, ink, printed, isClearAcrylic, printDirection, laminateId, laminateHours, serviceType, deliveryCharge, installCrewSize, installHours]);

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
    setArtworkHours("");
    setPrintMethod("");
    setMediaId("");
    setInk("");
    setSides("");
    setPrintDirection("");
    setLaminateId("");
    setLaminateHours("");
    setSmallPrintColour("");
    setSmallCoatingId("");
    setFinishings([]);
    setSmallFinishings([]);
    setQuantity("1");
    setServiceType("");
    setDeliveryCharge("");
    setInstallCrewSize("1");
    setInstallHours("");
    setTravelCharge("");
    setServiceFixings([]);
    setServiceFixingQty({});
    setServiceFixingRate({});
    setComponentName("");
    setComponentDescription("");
    setComponentParts([createBlankComponentPart()]);
    setComponentLabourLabel("Build / assembly labour");
    setComponentLabourHours("");
    setUnitPriceOverridden(false);
    setActiveStep(nextFlow === "small_format" ? "small_type" : nextFlow === "service" ? "service_type" : nextFlow === "component" ? "component_details" : "base");
  }

  function resetAfterBase(nextBase: BaseType) {
    setBaseType(nextBase);
    setThickness("");
    setColour("");
    setWidthMm("");
    setHeightMm("");
    setArtworkChoice("");
    setArtworkHours("");
    setPrintMethod("");
    setMediaId("");
    setInk("");
    setSides("");
    setPrintDirection("");
    setLaminateId("");
    setLaminateHours("");
    setFinishings([]);
    setUnitPriceOverridden(false);
    setActiveStep("thickness");
  }

  function setPresetSize(widthValue: string, heightValue: string, next: StepKey) {
    setWidthMm(widthValue);
    setHeightMm(heightValue);
    setActiveStep(next);
  }

  function setPrint(nextMethod: Exclude<PrintMethod, "">) {
    setPrintMethod(nextMethod);
    setMediaId("");
    if (nextMethod === "no_print" || nextMethod === "cut_vinyl") setInk("");
    if (nextMethod === "no_print") {
      setSides("");
      setPrintDirection("");
      setLaminateId("none");
      setLaminateHours("");
    }
    setUnitPriceOverridden(false);
    setTimeout(() => setActiveStep(nextMethod === "roll_stock" || nextMethod === "cut_vinyl" ? "media" : nextMethod === "direct_print" ? "ink" : "finishing"), 0);
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
          const lm = linearMetres(width, height, selectedMainMaterial);
          const rate = rollRate(selectedMainMaterial);
          rows.push({ label: "Base material", detail: selectedMainMaterial.name, amount: lm.amount, unit: "lm", rate: rate.rate, cost: lm.amount * rate.rate, note: [lm.note, rate.note].filter(Boolean).join(" · ") || undefined });
        } else {
          const sheetUse = sheetUsageForItem(selectedMainMaterial, width, height);
          const rate = sheetUnitRate(selectedMainMaterial);
          rows.push({ label: "Base material", detail: selectedMainMaterial.name, amount: sheetUse.amount, unit: "sheet", rate: rate.rate, cost: sheetUse.amount * rate.rate, note: [sheetUse.note, rate.note].filter(Boolean).join(" · ") || undefined });
        }
      }

      if (artworkChoice === "required") {
        const hours = numberValue(artworkHours, 0);
        if (hours > 0) rows.push({ label: "Artwork", detail: "Artwork/design time", amount: hours, unit: "hr", rate: labourRate, cost: hours * labourRate });
      }

      if (selectedMedia && needsMediaStep && areaSqm > 0) {
        const lm = linearMetres(width, height, selectedMedia);
        const rate = rollRate(selectedMedia);
        const amount = lm.amount * sideMultiplier;
        rows.push({ label: printMethod === "cut_vinyl" ? "Cut vinyl" : "Roll print media", detail: selectedMedia.name, amount, unit: "lm", rate: rate.rate, cost: amount * rate.rate, note: [lm.note, sides === "double" ? "double sided" : null, rate.note].filter(Boolean).join(" · ") || undefined });
      }

      if (needsInkStep && ink && areaSqm > 0) {
        if (ink === "cmyk" || ink === "both") {
          const amount = areaSqm * sideMultiplier;
          rows.push({ label: "CMYK ink", detail: "Sell charge", amount, unit: "sqm", rate: inkRatePerSqm, cost: amount * inkRatePerSqm, note: sides === "double" ? "double sided" : undefined });
        }
        if (ink === "white" || ink === "both") {
          const amount = areaSqm * sideMultiplier;
          rows.push({ label: "White ink", detail: "Sell charge", amount, unit: "sqm", rate: inkRatePerSqm, cost: amount * inkRatePerSqm, note: sides === "double" ? "double sided" : undefined });
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
        const hours = numberValue(laminateHours, 0);
        if (hours > 0) rows.push({ label: "Laminate labour", detail: "Apply laminate", amount: hours, unit: "hr", rate: labourRate, cost: hours * labourRate });
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
          const eyeletHours = numberValue(finishingHours[item.key], 0);
          if (qty > 0 && eyeletHours > 0) rows.push({ label: "Eyelet labour", detail: `${eyeletPresetLabel} placement`, amount: qty * eyeletHours, unit: "hr", rate: labourRate, cost: qty * eyeletHours * labourRate, note: `${usage(eyeletHours)}hr each` });
          continue;
        }
        const hours = numberValue(finishingHours[item.key], 0);
        if (hours > 0) rows.push({ label: item.label, detail: "Factory labour", amount: hours, unit: "hr", rate: labourRate, cost: hours * labourRate });
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
        const hours = numberValue(artworkHours, 0);
        if (hours > 0) rows.push({ label: "Artwork", detail: "Artwork/design time", amount: hours, unit: "hr", rate: labourRate, cost: hours * labourRate });
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
        const hours = numberValue(smallFinishingHours[item.key], 0);
        if (hours > 0) rows.push({ label: item.label, detail: "Bindery / finishing labour", amount: hours, unit: "hr", rate: labourRate, cost: hours * labourRate });
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
        const hours = numberValue(installHours, 0);
        if (hours > 0) rows.push({ label: "Install labour", detail: `${usage(people)} installer${people === 1 ? "" : "s"}`, amount: people * hours, unit: "hr", rate: labourRate, cost: people * hours * labourRate, note: `${usage(hours)}hr on site` });
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
        const material = materials.find((item) => item.id === part.materialId);
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

      const hours = numberValue(componentLabourHours, 0);
      if (hours > 0) {
        rows.push({ label: componentLabourLabel.trim() || "Assembly labour", detail: componentName.trim() || "Custom component", amount: hours, unit: "hr", rate: labourRate, cost: hours * labourRate });
      }
    }

    return rows;
  }, [flowType, selectedMainMaterial, areaSqm, width, height, artworkChoice, artworkHours, selectedMedia, needsMediaStep, sideMultiplier, printMethod, needsInkStep, ink, selectedLaminate, laminateId, laminateHours, finishings, finishingHours, eyeletPresetLabel, customEyeletQty, eyeletMaterial, selectedSmallStock, quantityNumber, smallPrintColour, sides, selectedSmallCoating, smallCoatingId, smallFinishings, smallFinishingHours, isDuplicateBook, ncrSetsPerBook, ncrCopiesCount, ncrPageColours, serviceType, deliveryCharge, installCrewSize, installHours, travelCharge, serviceFixings, serviceFixingQty, serviceFixingRate, componentParts, componentLabourHours, componentLabourLabel, componentName, materials, labourRate]);

  const serviceLabel = serviceTypes.find((item) => item.key === serviceType)?.label;
  const rawCost = costs.reduce((total, row) => total + row.cost, 0);
  const lineProductTypes = flowType === "small_format"
    ? ["small_format", selectedSmallType?.label ?? ""]
    : flowType === "service"
      ? ["service", serviceLabel ?? ""]
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
  const selectedMediaName = selectedMedia?.name ?? "";
  const selectedLaminateName = laminateId === "none" ? "None" : selectedLaminate?.name ?? "";
  const selectedSmallCoatingName = smallCoatingId === "none" ? "None" : selectedSmallCoating?.name ?? "";
  const finishingSummary = selectedKeys(finishingOptions, finishings);
  const smallFinishingSummary = selectedKeys(smallFinishingOptions, smallFinishings);

  const componentPartSummary = pricedComponentParts.map((part) => {
    const material = materials.find((item) => item.id === part.materialId);
    return `${usage(numberValue(part.qty, 0))} ${part.unit || "each"} ${part.name.trim() || material?.name || "part"}`;
  }).join(", ");
  const lineName = flowType === "component"
    ? componentName.trim() || "Custom component"
    : flowType === "service"
    ? serviceLabel ?? "Service item"
    : flowType === "small_format"
      ? [selectedSmallType?.label ?? "Small format item", selectedSmallStock?.name].filter(Boolean).join(" - ")
      : [selectedBase?.label ?? "Material quote line", selectedMainMaterial?.name].filter(Boolean).join(" - ");

  const optionSummary = flowType === "component"
    ? [
      componentName.trim() || "Custom component",
      componentPartSummary ? `Parts: ${componentPartSummary}` : null,
      numberValue(componentLabourHours, 0) > 0 ? `${usage(numberValue(componentLabourHours, 0))}hr ${componentLabourLabel.trim() || "labour"}` : null,
      componentDescription.trim() || null,
      `Qty ${quantityNumber}`
    ].filter(Boolean).join(" · ")
    : flowType === "service"
    ? [
      serviceLabel,
      serviceType === "delivery" && deliveryCharge ? `Delivery charge ${money(numberValue(deliveryCharge, 0))}` : null,
      serviceType === "install" ? `${installCrewSize || "1"} installer${numberValue(installCrewSize, 1) === 1 ? "" : "s"}` : null,
      serviceType === "install" && installHours ? `${installHours}hr install` : null,
      serviceType === "install" && travelCharge ? `Travel ${money(numberValue(travelCharge, 0))}` : null,
      serviceFixings.length ? `Fixings: ${selectedKeys(fixingOptions, serviceFixings)}` : null
    ].filter(Boolean).join(" · ")
    : flowType === "small_format"
      ? [
      selectedSmallType?.label,
      selectedSmallStock?.name,
      isDuplicateBook && ncrCopies ? `${ncrCopiesCount} part book` : null,
      isDuplicateBook && ncrSetsPerBook ? `${ncrSetsPerBook} sets/book` : null,
      isDuplicateBook && ncrCopiesCount ? pageColourSummary(ncrCopiesCount, ncrPageColours) : null,
      isDuplicateBook && ncrCoverColour ? `Cover: ${ncrCoverColour}` : null,
      isDuplicateBook && ncrTapeColour ? `Tape: ${ncrTapeColour}` : null,
      width > 0 && height > 0 ? `${width} × ${height}mm` : null,
      artworkChoice === "required" ? `Artwork ${usage(numberValue(artworkHours, 0))}hr` : artworkChoice === "client_supplied" ? "Artwork supplied" : null,
      sides ? `${sides === "double" ? "Double" : "Single"} sided` : null,
      smallPrintColour ? smallPrintColour === "mono" ? "Mono" : smallPrintColour === "cmyk" ? "CMYK" : "CMYK + special" : null,
      selectedSmallCoatingName ? `Coating: ${selectedSmallCoatingName}` : null,
      smallFinishingSummary ? `Finishing: ${smallFinishingSummary}` : null,
      `Qty ${quantityNumber}`
    ].filter(Boolean).join(" · ")
    : [
      selectedBase?.label,
      selectedMainMaterial?.name,
      width > 0 && height > 0 ? `${width} × ${height}mm` : null,
      artworkChoice === "required" ? `Artwork ${usage(numberValue(artworkHours, 0))}hr` : artworkChoice === "client_supplied" ? "Artwork supplied" : null,
      printMethods.find((item) => item.key === printMethod)?.label,
      selectedMediaName || null,
      inkChoices.find((item) => item.key === ink)?.label,
      sides ? `${sides === "double" ? "Double" : "Single"} sided` : null,
      printDirection ? `${printDirection === "reverse" ? "Reverse" : "Positive"} print` : null,
      selectedLaminateName ? `Laminate: ${selectedLaminateName}` : null,
      finishingSummary ? `Finishing: ${finishingSummary}` : null
    ].filter(Boolean).join(" · ");

  const canSave = flowType === "component"
    ? Boolean(componentName.trim() && componentHasCost)
    : flowType === "service"
    ? Boolean(serviceType && (serviceType === "pickup" || serviceType === "delivery" || (numberValue(installCrewSize, 0) > 0 && numberValue(installHours, 0) > 0)))
    : flowType === "small_format"
      ? Boolean(smallType && ncrDetailsComplete && selectedSmallStock && width > 0 && height > 0 && artworkChoice && (artworkChoice === "client_supplied" || numberValue(artworkHours, 0) > 0) && (isDuplicateBook || (sides && smallPrintColour && smallCoatingId)) && quantityNumber > 0)
      : Boolean(baseType && selectedMainMaterial && width > 0 && height > 0 && artworkChoice && (artworkChoice === "client_supplied" || numberValue(artworkHours, 0) > 0) && printMethod && (!needsMediaStep || mediaId) && (!needsInkStep || ink) && (!printed || sides) && (!isClearAcrylic || !printed || printDirection) && (!printed || laminateId) && (laminateId === "none" || !laminateId || numberValue(laminateHours, 0) > 0));

  function stepTitle(): string {
    const current = steps.find((step) => step.key === activeStep);
    return current?.label ?? "Quote builder";
  }

  function renderArtworkStep(nextAfterChoice: StepKey) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <StepIntro icon="✎" title="Does this item need artwork?" text="Every quote line now asks this. Client-supplied artwork adds no labour; required artwork charges the hours you enter." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          <button type="button" onClick={() => { setArtworkChoice("client_supplied"); setArtworkHours(""); setActiveStep(nextAfterChoice); }} style={cardButtonStyle(artworkChoice === "client_supplied", "#64748b")}>
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
            <label style={{ display: "grid", gap: 6 }}><b>Artwork hours</b><input value={artworkHours} onChange={(event) => setArtworkHours(event.target.value)} placeholder="eg 0.5" type="number" min="0" step="0.05" style={inputStyle} /></label>
            <button type="button" onClick={() => setActiveStep(nextAfterChoice)} disabled={numberValue(artworkHours, 0) <= 0} style={{ ...primaryButton, opacity: numberValue(artworkHours, 0) > 0 ? 1 : 0.45 }}>Continue</button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderStep() {
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
              const selectedPartMaterial = materials.find((item) => item.id === part.materialId);
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
                        const material = materials.find((item) => item.id === event.target.value);
                        updateComponentPart(part.id, {
                          materialId: event.target.value,
                          name: part.name.trim() || material?.name || "",
                          unit: material ? (isRollMaterial(material) ? "lm" : isSheetMaterial(material) ? "sheet" : "each") : part.unit,
                          unitCost: part.unitCost
                        });
                      }} style={inputStyle}>
                        <option value="">Custom / not in materials</option>
                        {materials.map((material) => <option key={material.id} value={material.id}>{material.name}{material.supplierName ? ` · ${material.supplierName}` : ""}</option>)}
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
          <StepIntro icon="4" title="Add assembly labour" text="Add the time to cut, assemble, weld, screw, tape, pack or prepare this component. Leave hours blank if the parts only need to be charged." />
          <div style={{ border: "1px solid #fed7aa", borderRadius: 20, padding: 16, background: "#fff7ed", display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <b>Labour label</b>
                <input value={componentLabourLabel} onChange={(event) => setComponentLabourLabel(event.target.value)} placeholder="eg Frame assembly labour" style={inputStyle} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <b>Hours</b>
                <input value={componentLabourHours} onChange={(event) => { setComponentLabourHours(event.target.value); setUnitPriceOverridden(false); }} placeholder="eg 0.75" type="number" min="0" step="0.05" style={inputStyle} />
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
          <StepIntro icon="3" title={serviceType === "install" ? "Set install crew and time" : serviceType === "delivery" ? "Set delivery charge" : "Pickup details"} text={serviceType === "install" ? "Install labour is calculated as people × hours × the global labour rate, then markup/profit are applied." : serviceType === "delivery" ? "Enter the delivery/courier charge as a cost price. Markup and profit are applied on the review step." : "Pickup can be saved as a no-charge line if you want it visible on the quote."} />
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
                <label style={{ display: "grid", gap: 6 }}><b>Install hours</b><input value={installHours} onChange={(event) => { setInstallHours(event.target.value); setUnitPriceOverridden(false); }} placeholder="eg 2" type="number" min="0" step="0.25" style={inputStyle} /></label>
                <label style={{ display: "grid", gap: 6 }}><b>Travel / call-out cost</b><input value={travelCharge} onChange={(event) => { setTravelCharge(event.target.value); setUnitPriceOverridden(false); }} placeholder="optional" type="number" min="0" step="0.01" style={inputStyle} /></label>
              </div>
              <span style={{ color: "#475467", fontSize: 13 }}>Labour cost: installers × hours × {money(labourRate)}/hr.</span>
              <button type="button" onClick={() => setActiveStep("service_fixings")} disabled={numberValue(installHours, 0) <= 0} style={{ ...primaryButton, opacity: numberValue(installHours, 0) > 0 ? 1 : 0.45 }}>Continue to fixings</button>
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
            {baseTypes.map((item) => {
              const count = materials.filter((material) => materialMatchesBase(material, item.key)).length;
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
        </div>
      );
    }

    if (activeStep === "media") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="8" title={printMethod === "cut_vinyl" ? "Choose cut vinyl" : "Choose roll stock"} text="Pick the actual roll material from Materials. Roll stock is shown as a linear metre cost where possible." />
          {rollMedia.length === 0 ? <EmptyStep text="No roll media found. Create roll stock in Materials first." /> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, maxHeight: 480, overflow: "auto", paddingRight: 4 }}>
            {rollMedia.map((material) => {
              const rate = rollRate(material);
              return (
                <button key={material.id} type="button" onClick={() => { setMediaId(material.id); setActiveStep(printMethod === "cut_vinyl" ? "sides" : "ink"); }} style={cardButtonStyle(mediaId === material.id, "#ea580c")}>
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
          <StepIntro icon="•" title="Choose laminate" text="Choose None or select an actual laminate material from Materials. If laminate is selected, enter the labour time." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <button type="button" onClick={() => { setLaminateId("none"); setLaminateHours(""); setActiveStep("finishing"); }} style={cardButtonStyle(laminateId === "none", "#64748b")}>
              <span style={{ fontSize: 30 }}>—</span>
              <strong>None</strong>
              <span style={{ color: "#64748b" }}>No laminate added.</span>
            </button>
            {laminateMaterials.map((material) => {
              const rate = rollRate(material);
              return (
                <button key={material.id} type="button" onClick={() => { setLaminateId(material.id); setLaminateHours(""); }} style={cardButtonStyle(laminateId === material.id, "#16a34a")}>
                  <span style={{ fontSize: 30 }}>▱</span>
                  <strong>{material.name}</strong>
                  <span style={{ color: "#64748b" }}>{materialCardMeta(material)}</span>
                  <span style={{ fontWeight: 950 }}>{money(rate.rate)}/lm</span>
                </button>
              );
            })}
          </div>
          {laminateSelected ? (
            <LabourPrompt label="Laminate application hours" value={laminateHours} onChange={setLaminateHours} onContinue={() => setActiveStep("finishing")} labourRate={labourRate} />
          ) : null}
        </div>
      );
    }

    if (activeStep === "finishing") {
      const eyeletsSelected = finishings.includes("eyelets");
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="•" title="Choose finishing" text="Tick all finishing processes required, then enter the labour time for anything selected." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {finishingOptions.map((item) => (
              <button key={item.key} type="button" onClick={() => toggleFinishing(item.key)} style={cardButtonStyle(finishings.includes(item.key), "#f59e0b")}>
                <span style={{ fontSize: 30 }}>{item.icon}</span>
                <strong>{item.label}</strong>
                <span style={{ color: "#64748b" }}>{item.description}</span>
                <span style={{ fontWeight: 900 }}>Enter hours when selected</span>
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
          <SelectedLabourHours options={finishingOptions} selected={finishings} values={finishingHours} onChange={setFinishingHours} eachLabelFor="eyelets" labourRate={labourRate} />
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
                <span style={{ fontWeight: 900 }}>Enter hours when selected</span>
              </button>
            ))}
          </div>
          <SelectedLabourHours options={smallFinishingOptions} selected={smallFinishings} values={smallFinishingHours} onChange={setSmallFinishingHours} labourRate={labourRate} />
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

  const headerGradient = flowType === "component"
    ? "linear-gradient(135deg, #7c2d12 0%, #f97316 58%, #fdba74 100%)"
    : flowType === "service"
    ? "linear-gradient(135deg, #064e3b 0%, #059669 58%, #34d399 100%)"
    : flowType === "small_format"
      ? "linear-gradient(135deg, #581c87 0%, #7c3aed 58%, #c084fc 100%)"
      : "linear-gradient(135deg, #0f172a 0%, #172554 58%, #155eef 100%)";

  return (
    <form action={addQuoteLineAction} style={{ border: "1px solid #dbeafe", borderRadius: 28, overflow: "hidden", background: "#ffffff", display: "grid" }}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="productName" value={lineName} />
      <input type="hidden" name="optionSummary" value={optionSummary} />
      <input type="hidden" name="unitPrice" value={(unitPriceOverridden ? numberValue(manualUnitPrice, 0) : autoUnitPrice).toFixed(2)} />
      <input type="hidden" name="quantity" value={quantity} />
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
            <SummaryRow label="Flow" value={flowType === "component" ? "Custom component / assembly" : flowType === "service" ? "Pickup / delivery / install" : flowType === "small_format" ? "Small format" : flowType === "signage" ? "Signage" : undefined} />
            {flowType === "component" ? (
              <>
                <SummaryRow label="Component" value={componentName || undefined} />
                <SummaryRow label="Parts" value={pricedComponentParts.length ? `${pricedComponentParts.length} costed part${pricedComponentParts.length === 1 ? "" : "s"}` : undefined} />
                <SummaryRow label="Labour" value={componentLabourHours ? `${componentLabourHours}hr` : undefined} />
              </>
            ) : flowType === "service" ? (
              <>
                <SummaryRow label="Service" value={serviceLabel} />
                {serviceType === "delivery" ? <SummaryRow label="Delivery charge" value={deliveryCharge ? money(numberValue(deliveryCharge, 0)) : undefined} /> : null}
                {serviceType === "install" ? <SummaryRow label="Crew" value={`${installCrewSize || "1"} person${numberValue(installCrewSize, 1) === 1 ? "" : "s"}`} /> : null}
                {serviceType === "install" ? <SummaryRow label="Install time" value={installHours ? `${installHours}hr` : undefined} /> : null}
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
                <SummaryRow label="Size" value={width > 0 && height > 0 ? `${width} × ${height}mm` : undefined} />
                <SummaryRow label="Artwork" value={artworkChoice === "required" ? `${usage(numberValue(artworkHours, 0))}hr` : artworkChoice === "client_supplied" ? "Client supplied" : undefined} />
                {!isDuplicateBook ? <SummaryRow label="Sides" value={sides ? `${sides === "double" ? "Double" : "Single"} sided` : undefined} /> : null}
                {!isDuplicateBook ? <SummaryRow label="Print" value={smallPrintColour ? smallPrintColour === "mono" ? "Mono" : smallPrintColour === "cmyk" ? "CMYK" : "CMYK + special" : undefined} /> : null}
                {!isDuplicateBook ? <SummaryRow label="Coating" value={selectedSmallCoatingName || undefined} /> : null}
                <SummaryRow label="Finishing" value={smallFinishingSummary || undefined} />
              </>
            ) : (
              <>
                <SummaryRow label="Base" value={selectedBase?.label} />
                <SummaryRow label="Material" value={selectedMainMaterial?.name} />
                <SummaryRow label="Size" value={width > 0 && height > 0 ? `${width} × ${height}mm` : undefined} />
                <SummaryRow label="Artwork" value={artworkChoice === "required" ? `${usage(numberValue(artworkHours, 0))}hr` : artworkChoice === "client_supplied" ? "Client supplied" : undefined} />
                <SummaryRow label="Print" value={printMethods.find((item) => item.key === printMethod)?.label} />
                <SummaryRow label="Media" value={selectedMedia?.name} />
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
                <button type="submit" disabled={!canSave} style={{ ...primaryButton, opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}>{canSave ? "Save quote line" : "Complete required cards"}</button>
              ) : <button type="button" onClick={() => setActiveStep("review")} style={primaryButton}>Review</button>}
            </div>
          </div>
        </section>
      </div>

      <div style={{ borderTop: "1px solid #e5e7eb", padding: 18, display: "grid", gap: 12, background: "#fff" }}>
        <label style={{ display: "grid", gap: 6 }}><b>Line notes</b><textarea name="notes" placeholder="Optional notes for this line" style={textareaStyle} /></label>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, background: "#f8fafc", display: "grid", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 950, color: "#344054", textTransform: "uppercase", letterSpacing: "0.05em" }}>Current unsaved line</span>
          <span style={{ color: optionSummary ? "#111827" : "#667085" }}>{optionSummary || "Complete the card flow above to build this quote line."}</span>
        </div>
        <button type="submit" disabled={!canSave} style={{ ...darkButton, opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}>{canSave ? "Save quote line" : "Complete required cards before saving"}</button>
      </div>
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
  return (
    <div style={{ border: "1px solid #bbf7d0", borderRadius: 20, padding: 14, background: "#f0fdf4", display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6 }}><b>{label}</b><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="eg 0.25" type="number" min="0" step="0.05" style={inputStyle} /></label>
      <span style={{ color: "#475467", fontSize: 13 }}>Charged at {money(labourRate)}/hr.</span>
      <button type="button" onClick={onContinue} disabled={numberValue(value, 0) <= 0} style={{ ...primaryButton, opacity: numberValue(value, 0) > 0 ? 1 : 0.45 }}>Continue</button>
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

function SelectedLabourHours<T extends { key: string; label: string }>({ options, selected, values, onChange, eachLabelFor, labourRate }: { options: T[]; selected: string[]; values: Record<string, string>; onChange: (value: Record<string, string>) => void; eachLabelFor?: string; labourRate: number }) {
  const chosen = options.filter((item) => selected.includes(item.key));
  if (chosen.length === 0) return null;
  return (
    <div style={{ border: "1px solid #dbeafe", borderRadius: 20, padding: 14, background: "#f8fbff", display: "grid", gap: 10 }}>
      <strong>Labour time for selected finishing</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {chosen.map((item) => (
          <label key={item.key} style={{ display: "grid", gap: 6 }}>
            <b>{item.label} {item.key === eachLabelFor ? "hours each" : "hours"}</b>
            <input value={values[item.key] ?? ""} onChange={(event) => onChange({ ...values, [item.key]: event.target.value })} placeholder={item.key === eachLabelFor ? "eg 0.03" : "eg 0.25"} type="number" min="0" step="0.01" style={inputStyle} />
          </label>
        ))}
      </div>
      <span style={{ color: "#475467", fontSize: 13 }}>All labour is charged at {money(labourRate)}/hr before global markup and profit.</span>
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
