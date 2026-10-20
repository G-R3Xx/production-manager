"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { saveQuoteLineFastAction } from "./actions";
import { materialsFromSnapshot, readQuickQuoteSnapshot, type QuickQuoteFlowType, type QuickQuoteSnapshot, type QuickQuoteStep, type SnapshotMaterial } from "./quoteLineSnapshot";
import { labourCostingDetails, labourForProcess, labourRateForProcess, selectMachineForProcess, type MachineCostMetrics, type QuoteCostingResources } from "./quoteCostingResources";

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
  showAsInstallationOption?: boolean;
  supplierName?: string | null;
  sku?: string | null;
  stockUom?: string | null;
  purchaseUom?: string | null;
  stockQuantity?: string | null;
  purchaseCost?: string | null;
  wastagePercent?: string | null;
  widthMm?: string | null;
  lengthMm?: string | null;
  rollWidthMm?: string | null;
  gsm?: string | null;
  notes?: string | null;
  quoteImageUrl?: string | null;
  quoteVisualCategory?: string | null;
};

type QuoteSizePreset = {
  label: string;
  width: string;
  height: string;
};

export type PricingSettings = {
  markupMultiplier?: string | number | null;
  accessEquipmentMarkupMultiplier?: string | number | null;
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

export type MyobMatrixItem = {
  id: string;
  name: string;
  sku?: string | null;
  myobUid: string;
  myobPriceMatrix: Record<string, unknown>;
  myobPriceMatrixSyncedAt?: string | null;
};

type QuoteMaterialFlowBuilderProps = {
  quoteId: string;
  materials: QuoteMaterial[];
  myobMatrixItems?: MyobMatrixItem[];
  pricingSettings?: PricingSettings;
  editingLine?: EditableQuoteLine | null;
  canOverrideMarkup?: boolean;
  costingResources?: QuoteCostingResources;
  presentation?: "full" | "wizard";
  categoryImages?: Record<string, string | null | undefined>;
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
type PlanPricingMode = "myob_matrix" | "pm_calculated";

type CostRow = {
  label: string;
  detail: string;
  amount: number;
  unit: string;
  rate: number;
  cost: number;
  note?: string;
};

type AutomaticLabourCost = {
  name: string;
  lineMinutes: number;
  lineCost: number;
  unitMinutes: number;
  unitCost: number;
  hourlyRate: number;
  calculationBasis: string;
};

const processAliases = {
  print: ["direct print", "digital print", "small format print", "print", "print file setup"],
  laminate: ["laminate", "laminating", "cello", "coating"],
  eyelets: ["eyelets", "eyelet"],
  jingwei: ["jewei cut", "jingwei cut", "jewei cutting", "jingwei cutting", "jewei", "jingwei"],
  vinyl_cutting: ["vinyl cutting", "cut vinyl", "vinyl cut"],
  print_vinyl_application: ["mount apply", "mounting application", "mount apply vinyl", "vinyl application"],
  tape_hem_banner: ["tape hem banner", "banner hem", "hemming", "hem banner"],
  trim: ["trim cut", "guillotine", "trim", "cut"],
  fold: ["folding", "fold"],
  score: ["scoring", "creasing", "score", "crease"],
  staple: ["saddle stitch", "stapling", "staple", "stitch"],
  numbering: ["sequential numbering", "numbering", "number"],
  padding: ["padding", "book padding", "binding", "tape binding", "book edge tape", "edge tape", "book tape", "spiral binding", "coil binding"]
} as const;

const signageFinishingProcessAliases: Record<string, readonly string[]> = {
  jingwei: processAliases.jingwei,
  eyelets: processAliases.eyelets,
  vinyl_cutting: processAliases.vinyl_cutting,
  print_vinyl_application: processAliases.print_vinyl_application,
  tape_hem_banner: processAliases.tape_hem_banner
};

const smallFinishingProcessAliases: Record<string, readonly string[]> = {
  trim: processAliases.trim,
  fold: processAliases.fold,
  score: processAliases.score,
  staple: processAliases.staple,
  numbering: processAliases.numbering,
  padding: processAliases.padding
};

function automaticLabourForProcess(
  resources: QuoteCostingResources | undefined,
  aliases: readonly string[],
  department: string,
  metrics: MachineCostMetrics,
  quoteQuantity: number
): AutomaticLabourCost | null {
  const labour = labourForProcess(resources, [...aliases], department);
  const details = labourCostingDetails(labour, metrics);
  if (!labour || !details || details.hourlyRate <= 0 || details.lineMinutes <= 0) return null;
  const safeQuantity = Math.max(1, quoteQuantity);
  return {
    name: labour.name,
    lineMinutes: details.lineMinutes,
    lineCost: details.lineCost,
    unitMinutes: details.lineMinutes / safeQuantity,
    unitCost: details.lineCost / safeQuantity,
    hourlyRate: details.hourlyRate,
    calculationBasis: details.calculationBasis
  };
}

function operationConsumableAmount(
  labour: { consumableQuantity?: string | null; consumableBasis?: string | null } | null,
  metrics: MachineCostMetrics,
  quoteQuantity: number
): number {
  if (!labour) return 0;
  const configured = Math.max(0, numberValue(labour.consumableQuantity, 0));
  if (configured <= 0) return 0;
  const safeQuoteQty = Math.max(1, quoteQuantity);
  const basis = String(labour.consumableBasis ?? "per_operation_unit");
  if (basis === "per_finished_item") return configured;
  if (basis === "per_linear_metre") return configured * Math.max(0, metrics.linearMetresPerLine ?? 0) / safeQuoteQty;
  if (basis === "per_sqm") return configured * Math.max(0, metrics.areaSqmPerUnit) ;
  return configured * Math.max(1, metrics.quantity || safeQuoteQty) / safeQuoteQty;
}

function operationConsumableRate(material: QuoteMaterial, basis: string | null | undefined): { rate: number; unit: string; note?: string } {
  if (basis === "per_linear_metre") { const row = rollRate(material); return { ...row, unit: "lm" }; }
  if (basis === "per_sqm") { const row = rateForComponentUnit(material, "sqm"); return { ...row, unit: "sqm" }; }
  const row = eachRate(material); return { ...row, unit: "each" };
}

function automaticLabourNote(costing: AutomaticLabourCost): string {
  const basis = costing.calculationBasis === "per_sqm_hours"
    ? "area calculation"
    : costing.calculationBasis === "per_sheet_hours"
      ? "sheet calculation"
      : costing.calculationBasis === "per_linear_metre_hours"
        ? "linear-metre calculation"
        : costing.calculationBasis === "per_item_hours"
          ? "quantity calculation"
          : costing.calculationBasis === "guillotine_stacks"
            ? "stack/cut calculation"
            : "configured time";
  return `${minutesLabel(costing.lineMinutes)} automatically · ${basis} · ${money(costing.hourlyRate)}/hr from ${costing.name}`;
}

function automaticLabourRow(label: string, detail: string, costing: AutomaticLabourCost): CostRow {
  return {
    label,
    detail,
    amount: costing.unitMinutes,
    unit: "min",
    rate: costing.hourlyRate / 60,
    cost: costing.unitCost,
    note: automaticLabourNote(costing)
  };
}

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
  { key: "padding", label: "Padding / tape / binding", icon: "▥", description: "Add book padding, edge tape, spiral/coil binding or similar finishing." }
];

const serviceTypes: Array<{ key: Exclude<ServiceType, "">; label: string; icon: string; description: string }> = [
  { key: "pickup", label: "Pickup", icon: "↗", description: "Client collects the job. Usually no charge unless you add notes or a manual price." },
  { key: "delivery", label: "Delivery", icon: "▣", description: "Add a delivery charge as its own quote line." },
  { key: "install", label: "Install", icon: "⚒", description: "Charge install time by crew size, hours and standard fixing consumables." },
  { key: "access_equipment", label: "Access equipment", icon: "▦", description: "Hire equipment charged by day, with quote pricing applied automatically." }
];

const dispatchServiceTypes = serviceTypes.filter((item) => item.key !== "access_equipment");

type ServiceFixingOption = {
  key: string;
  label: string;
  unit: string;
  placeholderQty: string;
  placeholderRate: string;
  material?: QuoteMaterial;
  legacy?: boolean;
};

const customInstallationAllowance: ServiceFixingOption = {
  key: "other",
  label: "Custom allowance",
  unit: "allowance",
  placeholderQty: "eg 1",
  placeholderRate: "eg 15"
};

// Kept only so historical quote lines created before V26.09.21.03 can still be reopened accurately.
// New quote lines never populate these hard-coded choices.
const legacyFixingOptions: ServiceFixingOption[] = [
  { key: "silicone", label: "Silicone", unit: "tube", placeholderQty: "eg 1", placeholderRate: "eg 12", legacy: true },
  { key: "tape", label: "VHB / double-sided tape", unit: "lm", placeholderQty: "eg 3", placeholderRate: "eg 2.5", legacy: true },
  { key: "screws", label: "Screws / anchors", unit: "each", placeholderQty: "eg 12", placeholderRate: "eg 0.25", legacy: true },
  { key: "screws_custom", label: "Screws / special fixings", unit: "each", placeholderQty: "eg 4", placeholderRate: "eg 1", legacy: true },
  { key: "cable_ties", label: "Cable ties", unit: "each", placeholderQty: "eg 10", placeholderRate: "auto", legacy: true }
];

const legacyFixingMaterialTerms: Record<string, string[]> = {
  silicone: ["silicone", "silicon"],
  tape: ["vhb", "double sided tape", "double-sided tape"],
  screws: ["screw", "anchor", "fixing"],
  screws_custom: ["screw", "anchor", "fixing"],
  cable_ties: ["cable tie", "cable ties", "zip tie"]
};

function legacyStandardFixingMaterial(materials: QuoteMaterial[], key: string): QuoteMaterial | undefined {
  const terms = legacyFixingMaterialTerms[key] ?? [];
  if (!terms.length) return undefined;
  return materials.find((material) => {
    const text = `${material.name} ${material.customerFacingName ?? ""} ${material.materialType ?? ""}`.toLowerCase();
    return terms.some((term) => text.includes(term));
  });
}

function installationMaterialKey(material: QuoteMaterial): string {
  return `material:${material.id}`;
}

function installationUnit(material: QuoteMaterial): string {
  const stock = String(material.stockUom ?? "").trim().toLowerCase();
  if (["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(stock)) return "lm";
  if (stock.includes("sheet")) return "sheet";
  if (stock.includes("pack")) return "pack";
  if (stock.includes("box")) return "box";
  if (stock.includes("bag")) return "bag";
  if (stock.includes("roll")) return "roll";
  return stock || "each";
}

function installationMaterialRate(material: QuoteMaterial): { rate: number; note?: string } {
  const unit = installationUnit(material);
  if (unit === "lm") return rollRate(material);
  if (unit === "sheet") return sheetUnitRate(material);
  return eachRate(material);
}

function installationOptionForMaterial(material: QuoteMaterial): ServiceFixingOption {
  const unit = installationUnit(material);
  return {
    key: installationMaterialKey(material),
    label: material.name,
    unit,
    placeholderQty: unit === "lm" ? "eg 3" : "eg 1",
    placeholderRate: "auto",
    material
  };
}

function serviceFixingOptionForKey(key: string, materials: QuoteMaterial[]): ServiceFixingOption | undefined {
  if (key === customInstallationAllowance.key) return customInstallationAllowance;
  if (key.startsWith("material:")) {
    const materialId = key.slice("material:".length);
    const material = materials.find((item) => item.id === materialId);
    return material ? installationOptionForMaterial(material) : undefined;
  }
  return legacyFixingOptions.find((item) => item.key === key);
}

function serviceFixingMaterialForKey(key: string, materials: QuoteMaterial[]): QuoteMaterial | undefined {
  if (key.startsWith("material:")) return materials.find((item) => item.id === key.slice("material:".length));
  return legacyStandardFixingMaterial(materials, key);
}

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

function numberValue(value: unknown, fallback = 0): number {
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

function isStandoffMaterial(material: QuoteMaterial): boolean {
  const text = materialText(material);
  return /\b(standoffs?|stand[- ]?offs?|sign mounts?|mounting spacers?)\b/.test(text);
}

function isPrintRollMaterial(material: QuoteMaterial): boolean {
  return isRollMaterial(material) && !isLaminateMaterial(material);
}

function explicitQuoteVisualBase(material: QuoteMaterial): BaseType | null {
  const value = String(material.quoteVisualCategory ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "acrylic" || value === "acm" || value === "corflute" || value === "pvc" || value === "banner" || value === "other_sheet") return value;
  return null;
}

function materialMatchesSpecificBase(material: QuoteMaterial, baseType: Exclude<BaseType, "other_sheet">): boolean {
  const explicit = explicitQuoteVisualBase(material);
  if (explicit) return explicit === baseType;
  const text = materialText(material);
  if (baseType === "acrylic") return text.includes("acrylic") || text.includes("perspex") || text.includes("pmma");
  if (baseType === "acm") return text.includes("acm") || text.includes("aluminium composite") || text.includes("aluminum composite");
  if (baseType === "corflute") return text.includes("corflute") || text.includes("correx") || text.includes("corrugated");
  if (baseType === "pvc") return text.includes("pvc") || text.includes("foamboard") || text.includes("foam board") || text.includes("foam");
  return text.includes("banner") || (isRollMaterial(material) && !isLaminateMaterial(material));
}

function materialMatchesBase(material: QuoteMaterial, baseType: BaseType): boolean {
  const explicit = explicitQuoteVisualBase(material);
  if (explicit) return explicit === baseType;
  if (baseType !== "other_sheet") return materialMatchesSpecificBase(material, baseType);
  if (!isSheetMaterial(material)) return false;

  // "Other sheet" is deliberately the fallback bucket only. Anything that has
  // its own visual category must never be duplicated here.
  const dedicatedBases: Array<Exclude<BaseType, "other_sheet">> = ["acrylic", "acm", "corflute", "pvc", "banner"];
  return !dedicatedBases.some((category) => materialMatchesSpecificBase(material, category));
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

function thicknessSortValue(material: QuoteMaterial): number {
  const text = `${material.name} ${material.gsm ?? ""}`;
  const mm = text.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (mm) return Number(mm[1]);
  const gsm = text.match(/(\d+(?:\.\d+)?)\s*gsm/i);
  if (gsm) return 10000 + Number(gsm[1]);
  return Number.POSITIVE_INFINITY;
}

const MATERIAL_COLOUR_ORDER = [
  "Black", "Clear", "White", "Opal", "Red", "Blue", "Green", "Yellow", "Pink", "Standard"
] as const;

function colourSortValue(material: QuoteMaterial): number {
  const colour = colourFor(material);
  const index = MATERIAL_COLOUR_ORDER.indexOf(colour as (typeof MATERIAL_COLOUR_ORDER)[number]);
  return index >= 0 ? index : MATERIAL_COLOUR_ORDER.length;
}

function compareSubstrateMaterials(a: QuoteMaterial, b: QuoteMaterial): number {
  const thicknessDifference = thicknessSortValue(a) - thicknessSortValue(b);
  if (Number.isFinite(thicknessDifference) && thicknessDifference !== 0) return thicknessDifference;
  if (!Number.isFinite(thicknessSortValue(a)) && Number.isFinite(thicknessSortValue(b))) return 1;
  if (Number.isFinite(thicknessSortValue(a)) && !Number.isFinite(thicknessSortValue(b))) return -1;

  const colourDifference = colourSortValue(a) - colourSortValue(b);
  if (colourDifference !== 0) return colourDifference;

  const colourNameDifference = colourFor(a).localeCompare(colourFor(b), undefined, { sensitivity: "base" });
  if (colourNameDifference !== 0) return colourNameDifference;
  return materialText(a).localeCompare(materialText(b), undefined, { numeric: true, sensitivity: "base" });
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

function panelizedSheets(
  parentWidth: number,
  parentHeight: number,
  pieceWidth: number,
  pieceHeight: number
): { sheets: number; across: number; rows: number; rotated: boolean; panels: number; panelsPerSheet: number; panelWidth: number; panelHeight: number } | null {
  if (parentWidth <= 0 || parentHeight <= 0 || pieceWidth <= 0 || pieceHeight <= 0) return null;

  // Oversize signs are commonly made as multiple panels. The old calculation treated
  // every panel as if it needed its own parent sheet. That overstates stock when the
  // resulting panels can be nested together on one sheet (for example 4000 x 500mm ACM
  // becomes two 2000 x 500mm panels, both of which fit on one 2440 x 1220mm sheet).
  //
  // Keep the split conservative: only create the minimum equal panel grid needed to fit
  // the finished item within a parent-sheet orientation. We do not add extra seams just
  // to improve yield.
  const candidates = [
    { sheetWidth: parentWidth, sheetHeight: parentHeight, rotated: false },
    { sheetWidth: parentHeight, sheetHeight: parentWidth, rotated: true }
  ].map((orientation) => {
    const across = Math.max(1, Math.ceil((pieceWidth - 0.0000001) / orientation.sheetWidth));
    const rows = Math.max(1, Math.ceil((pieceHeight - 0.0000001) / orientation.sheetHeight));
    const panelWidth = pieceWidth / across;
    const panelHeight = pieceHeight / rows;
    const panels = across * rows;
    const panelsPerSheet = piecesPerSheet(parentWidth, parentHeight, panelWidth, panelHeight);
    if (panelsPerSheet <= 0) return null;
    return {
      sheets: panels / panelsPerSheet,
      across,
      rows,
      rotated: orientation.rotated,
      panels,
      panelsPerSheet,
      panelWidth,
      panelHeight
    };
  }).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  return candidates.sort((a, b) =>
    a.panels - b.panels ||
    a.sheets - b.sheets ||
    Number(a.rotated) - Number(b.rotated)
  )[0] ?? null;
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
    const totalPanels = panelized.panels * safeQuantity;
    const calculatedTotal = totalPanels / panelized.panelsPerSheet;
    const billableTotal = roundSheetUsage(calculatedTotal, billing.increment);
    const physicalSheets = Math.max(1, Math.ceil(calculatedTotal - 0.0000001));
    return {
      amount: billableTotal / safeQuantity,
      calculatedTotal,
      billableTotal,
      physicalSheets,
      note: [
        `panelled ${panelized.across} across × ${panelized.rows} high`,
        `${usage(panelized.panelWidth)} × ${usage(panelized.panelHeight)}mm nominal panels`,
        `${panelized.panelsPerSheet} panel${panelized.panelsPerSheet === 1 ? "" : "s"} up per parent sheet`,
        `calculated ${usage(calculatedTotal)} sheet${Math.abs(calculatedTotal - 1) < 0.0001 ? "" : "s"}`,
        `${physicalSheets} physical parent sheet${physicalSheets === 1 ? "" : "s"} opened`,
        panelized.rotated ? "rotated sheet orientation" : null,
        billing.label,
        `${usage(parentArea)}sqm parent sheet`
      ].filter(Boolean).join(" · ")
    };
  }

  return { amount: 0, calculatedTotal: 0, billableTotal: 0, physicalSheets: 0, note: "sheet size missing" };
}

function sheetUnitRate(material: QuoteMaterial): { rate: number; note?: string } {
  const wastePercent = Math.max(0, numberValue(material.wastagePercent, 0));
  const purchaseCost = numberValue(material.purchaseCost, 0) * (1 + wastePercent / 100);
  const wasteNote = wastePercent > 0 ? `${usage(wastePercent)}% stock wastage included` : undefined;
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const stockUom = String(material.stockUom ?? "").toLowerCase();
  const stockQty = numberValue(material.stockQuantity, 0);
  if ((purchaseUom.includes("1000") || purchaseUom.includes("thousand") || purchaseUom.includes("ream") || purchaseUom.includes("pack") || purchaseUom.includes("box")) && stockQty > 0 && (stockUom.includes("sheet") || stockUom.includes("each"))) {
    return { rate: purchaseCost / stockQty, note: [`${usage(stockQty)} sheets per ${purchaseUom}`, wasteNote].filter(Boolean).join(" · ") };
  }
  return { rate: purchaseCost, note: [purchaseUom && !purchaseUom.includes("sheet") ? `check ${purchaseUom} quantity` : undefined, wasteNote].filter(Boolean).join(" · ") || undefined };
}

function rollRate(material: QuoteMaterial): { rate: number; note?: string } {
  const wastePercent = Math.max(0, numberValue(material.wastagePercent, 0));
  const purchaseCost = numberValue(material.purchaseCost, 0) * (1 + wastePercent / 100);
  const wasteNote = wastePercent > 0 ? `${usage(wastePercent)}% stock wastage included` : undefined;
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const stockUom = String(material.stockUom ?? "").toLowerCase();
  const stockQty = numberValue(material.stockQuantity, 0);
  if (["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(purchaseUom)) return { rate: purchaseCost, note: wasteNote };
  if (purchaseUom.includes("roll") && stockQty > 0) return { rate: purchaseCost / stockQty, note: [`${usage(stockQty)}lm saved roll length`, wasteNote].filter(Boolean).join(" · ") };
  if (stockQty > 0 && ["lm", "m", "metre", "meter"].includes(stockUom)) return { rate: purchaseCost / stockQty, note: [`${usage(stockQty)}lm stock length`, wasteNote].filter(Boolean).join(" · ") };
  return { rate: purchaseCost, note: ["check roll length", wasteNote].filter(Boolean).join(" · ") };
}

function eachRate(material: QuoteMaterial): { rate: number; note?: string } {
  const wastePercent = Math.max(0, numberValue(material.wastagePercent, 0));
  const purchaseCost = numberValue(material.purchaseCost, 0) * (1 + wastePercent / 100);
  const wasteNote = wastePercent > 0 ? `${usage(wastePercent)}% wastage included` : undefined;
  const stockQty = numberValue(material.stockQuantity, 0);
  const purchaseUom = String(material.purchaseUom ?? "").trim().toLowerCase();
  const stockUom = String(material.stockUom ?? "").trim().toLowerCase();
  if (stockQty > 0 && purchaseUom && stockUom && purchaseUom !== stockUom) {
    return { rate: purchaseCost / stockQty, note: [`${usage(stockQty)} ${stockUom} per ${purchaseUom}`, wasteNote].filter(Boolean).join(" · ") };
  }
  return { rate: purchaseCost, note: wasteNote };
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
    showAsInstallationOption: material.showAsInstallationOption === true,
    supplierName: material.supplierName ?? null,
    sku: material.sku ?? null,
    stockUom: material.stockUom ?? null,
    purchaseUom: material.purchaseUom ?? null,
    stockQuantity: material.stockQuantity ?? null,
    purchaseCost: material.purchaseCost ?? null,
    wastagePercent: material.wastagePercent ?? null,
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

type MyobMatrixPrice = { unitPrice: number; quantityOver: number; levelKey: string };

function myobMatrixPrice(matrix: Record<string, unknown> | null | undefined, priceLevelCode: string | null | undefined, quantity: number): MyobMatrixPrice | null {
  if (!matrix) return null;
  const levelMatch = String(priceLevelCode ?? "Level A").match(/^Level\s+([A-F])$/i);
  const levelKey = `Level${(levelMatch?.[1] ?? "A").toUpperCase()}`;
  const sellingPrices = Array.isArray(matrix.SellingPrices) ? matrix.SellingPrices : [];
  const eligible = sellingPrices
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
    .map((row) => ({ row, quantityOver: Math.max(0, numberValue(row.QuantityOver, 0)) }))
    .filter(({ quantityOver }) => quantityOver === 0 || Math.max(0, quantity) > quantityOver)
    .sort((a, b) => b.quantityOver - a.quantityOver);

  for (const candidate of eligible) {
    const levels = candidate.row.Levels;
    if (!levels || typeof levels !== "object" || Array.isArray(levels)) continue;
    const parsed = Number((levels as Record<string, unknown>)[levelKey]);
    if (Number.isFinite(parsed) && parsed >= 0) return { unitPrice: parsed, quantityOver: candidate.quantityOver, levelKey };
  }
  return null;
}

function myobMatrixTierLabel(matrix: Record<string, unknown> | null | undefined, quantityOver: number): string {
  if (!matrix) return quantityOver > 0 ? `Qty ${quantityOver + 1}+` : "Base quantity tier";
  const thresholds = (Array.isArray(matrix.SellingPrices) ? matrix.SellingPrices : [])
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
    .map((row) => Math.max(0, numberValue(row.QuantityOver, 0)))
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((a, b) => a - b);
  const next = thresholds.find((value) => value > quantityOver);
  const start = quantityOver + 1;
  return next == null ? `Qty ${start}+` : `Qty ${start}–${next}`;
}

function planSizeCode(widthMm: number, heightMm: number): string {
  const w = Math.round(Math.min(widthMm, heightMm));
  const h = Math.round(Math.max(widthMm, heightMm));
  const sizes: Array<[string, number, number]> = [
    ["A4", 210, 297],
    ["A3", 297, 420],
    ["A2", 420, 594],
    ["A1", 594, 841],
    ["A0", 841, 1189]
  ];
  return sizes.find(([, sw, sh]) => Math.abs(w - sw) <= 3 && Math.abs(h - sh) <= 3)?.[0] ?? "";
}

function planMatrixItemScore(item: MyobMatrixItem, sizeCode: string, printColour: SmallPrintColour): number {
  const text = `${item.sku ?? ""} ${item.name}`.toLowerCase();
  let score = /\b(plan|plans|plot|plotting|drawing|drawings|cad|blueprint)\b/.test(text) ? 2 : 0;
  if (sizeCode && new RegExp(`\\b${sizeCode.toLowerCase()}\\b`, "i").test(text)) score += 6;
  if (printColour === "mono" && /\b(mono|monochrome|b\s*&?\s*w|black\s*(?:&|and)?\s*white|greyscale|grayscale)\b/.test(text)) score += 5;
  if ((printColour === "cmyk" || printColour === "special") && /\b(colou?r|cmyk|full\s*colou?r)\b/.test(text)) score += 5;
  return score;
}

function matrixItemLabel(item: MyobMatrixItem): string {
  const sku = String(item.sku ?? "").trim();
  return sku ? `${sku} · ${item.name}` : item.name;
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
  if (widthMm <= 0 || heightMm <= 0) return materials[0];
  return [...materials].sort((a, b) => {
    const aUse = roundedRollMetresForQuantity(widthMm, heightMm, a, pieces);
    const bUse = roundedRollMetresForQuantity(widthMm, heightMm, b, pieces);
    const aRate = rollRate(a).rate;
    const bRate = rollRate(b).rate;
    const aMissingPrice = aRate <= 0;
    const bMissingPrice = bRate <= 0;
    if (aMissingPrice !== bMissingPrice) return aMissingPrice ? 1 : -1;
    const aCost = aUse.amount * aRate;
    const bCost = bUse.amount * bRate;
    if (Math.abs(aCost - bCost) > 0.000001) return aCost - bCost;
    if (Math.abs(aUse.amount - bUse.amount) > 0.000001) return aUse.amount - bUse.amount;
    return numberValue(a.rollWidthMm, 0) - numberValue(b.rollWidthMm, 0);
  })[0];
}

type MainMaterialChoiceGroup = {
  key: string;
  label: string;
  materials: QuoteMaterial[];
  representative: QuoteMaterial;
};

function mainMaterialChoiceGroups(materials: QuoteMaterial[]): MainMaterialChoiceGroup[] {
  const groups = new Map<string, QuoteMaterial[]>();
  for (const material of materials) {
    const label = customerMaterialName(material) || material.name || material.id;
    const key = label.trim().toLowerCase();
    const current = groups.get(key) ?? [];
    current.push(material);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([key, groupedMaterials]) => {
      const sorted = [...groupedMaterials].sort(compareSubstrateMaterials);
      const representative = sorted.find((material) => Boolean(material.quoteImageUrl)) ?? sorted[0];
      return {
        key,
        label: customerMaterialName(representative) || representative.name,
        materials: sorted,
        representative
      };
    })
    .sort((a, b) => compareSubstrateMaterials(a.representative, b.representative) || a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
}

function sheetGroupDescription(group: MainMaterialChoiceGroup): string {
  const sizes = Array.from(new Set(group.materials
    .map((material) => bestSheetDimensions(material))
    .filter((dimensions): dimensions is NonNullable<ReturnType<typeof bestSheetDimensions>> => Boolean(dimensions))
    .map((dimensions) => `${dimensionMm(dimensions.width)} × ${dimensionMm(dimensions.length)}`)));
  if (sizes.length > 1) return `Auto-selects ${sizes.join(" / ")}mm parent sheets by fit, nesting and cost`;
  if (sizes.length === 1) return `${sizes[0]}mm parent sheet`;
  return group.materials.length > 1 ? `Auto-selects from ${group.materials.length} linked stock items` : "Parent sheet size not set";
}

function rollGroupDescription(group: MainMaterialChoiceGroup): string {
  const widths = Array.from(new Set(group.materials
    .map((material) => numberValue(material.rollWidthMm, 0))
    .filter((width) => width > 0)))
    .sort((a, b) => a - b);
  if (widths.length > 1) return `Auto-selects ${widths.map((width) => dimensionMm(width)).join(" / ")}mm roll widths by fit, nesting and cost`;
  if (widths.length === 1) return `${dimensionMm(widths[0])}mm roll`;
  return group.materials.length > 1 ? `Auto-selects from ${group.materials.length} linked stock items` : "Roll width not set";
}

function bestSheetMaterialForGroup(materials: QuoteMaterial[], widthMm: number, heightMm: number, pieces: number): QuoteMaterial | undefined {
  if (!materials.length) return undefined;
  if (widthMm <= 0 || heightMm <= 0 || pieces <= 0) return materials[0];

  const candidates = materials.map((material) => {
    const sheetUse = sheetUsageForQuoteLine(material, widthMm, heightMm, pieces);
    const rate = sheetUnitRate(material).rate;
    const dimensions = bestSheetDimensions(material);
    return {
      material,
      sheetUse,
      rate,
      valid: sheetUse.billableTotal > 0 && Boolean(dimensions),
      directFit: dimensions ? piecesPerSheet(dimensions.width, dimensions.length, widthMm, heightMm) > 0 : false,
      hasPrice: rate > 0,
      totalCost: sheetUse.billableTotal * rate,
      sheetArea: dimensions ? dimensions.width * dimensions.length : Number.POSITIVE_INFINITY
    };
  }).filter((candidate) => candidate.valid);

  if (!candidates.length) return materials[0];
  const directFitCandidates = candidates.filter((candidate) => candidate.directFit);
  const fitEligible = directFitCandidates.length ? directFitCandidates : candidates;
  const hasAnyPrice = fitEligible.some((candidate) => candidate.hasPrice);
  const eligible = hasAnyPrice ? fitEligible.filter((candidate) => candidate.hasPrice) : fitEligible;
  return eligible.sort((a, b) =>
    a.totalCost - b.totalCost
    || a.sheetUse.billableTotal - b.sheetUse.billableTotal
    || a.sheetUse.physicalSheets - b.sheetUse.physicalSheets
    || a.sheetUse.calculatedTotal - b.sheetUse.calculatedTotal
    || a.sheetArea - b.sheetArea
    || a.material.name.localeCompare(b.material.name, undefined, { numeric: true, sensitivity: "base" })
  )[0]?.material ?? materials[0];
}

export function QuoteMaterialFlowBuilder({ quoteId, materials, myobMatrixItems = [], pricingSettings, editingLine = null, canOverrideMarkup = false, costingResources, presentation = "full", categoryImages = {} }: QuoteMaterialFlowBuilderProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [, startRefresh] = useTransition();
  const initialSnapshot = useMemo(() => readQuickQuoteSnapshot(editingLine?.configurationSnapshot), [editingLine?.configurationSnapshot]);
  const [wizardIndex, setWizardIndex] = useState(0);
  const standardMarkupMultiplier = multiplierValue(pricingSettings?.markupMultiplier, 1.5);
  const standardAccessEquipmentMarkupMultiplier = multiplierValue(pricingSettings?.accessEquipmentMarkupMultiplier, standardMarkupMultiplier);
  const initialStandardMarkupMultiplier = initialSnapshot?.flowType === "service" && initialSnapshot?.serviceType === "access_equipment"
    ? standardAccessEquipmentMarkupMultiplier
    : standardMarkupMultiplier;
  const initialSavedMarkupMultiplier = multiplierValue(initialSnapshot?.pricingSnapshot?.markupMultiplier, initialStandardMarkupMultiplier);
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
  const [mainMaterialChoiceId, setMainMaterialChoiceId] = useState(initialSnapshot?.materialSnapshots?.main?.id ?? "");
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
  const [standoffMaterialId, setStandoffMaterialId] = useState(snapshotString(initialSnapshot, "standoffMaterialId"));
  const [standoffQtyPerItem, setStandoffQtyPerItem] = useState(snapshotString(initialSnapshot, "standoffQtyPerItem", "4"));

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
  const [planPricingMode, setPlanPricingMode] = useState<PlanPricingMode>(() => {
    const saved = snapshotString(initialSnapshot, "planPricingMode") as PlanPricingMode;
    if (saved === "myob_matrix" || saved === "pm_calculated") return saved;
    if (editingLine) return "pm_calculated";
    return myobMatrixItems.length ? "myob_matrix" : "pm_calculated";
  });
  const [planMyobItemId, setPlanMyobItemId] = useState(snapshotString(initialSnapshot, "myobMatrixItemId"));
  const [planMatrixSelectionTouched, setPlanMatrixSelectionTouched] = useState(false);
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
  const [otherConsumableTitle, setOtherConsumableTitle] = useState(snapshotString(initialSnapshot, "otherConsumableTitle"));

  const [componentName, setComponentName] = useState(snapshotString(initialSnapshot, "componentName"));
  const [componentDescription, setComponentDescription] = useState(snapshotString(initialSnapshot, "componentDescription"));
  const [componentParts, setComponentParts] = useState<CustomComponentPart[]>(initialComponentParts);
  const [componentLabourLabel, setComponentLabourLabel] = useState(snapshotString(initialSnapshot, "componentLabourLabel", "Build / assembly labour"));
  const [componentLabourMinutes, setComponentLabourMinutes] = useState(snapshotString(initialSnapshot, "componentLabourMinutes"));

  const [quantity, setQuantity] = useState(
    editingLine?.quantity ?? snapshotString(initialSnapshot, "quantity", presentation === "wizard" ? "" : "1")
  );
  const [lineMarkupInput, setLineMarkupInput] = useState(() => initialSavedMarkupMultiplier.toFixed(2));
  const [markupTouched, setMarkupTouched] = useState(Boolean(editingLine && Math.abs(initialSavedMarkupMultiplier - initialStandardMarkupMultiplier) > 0.000001));
  const [unitPriceOverridden, setUnitPriceOverridden] = useState(Boolean(initialSnapshot?.unitPriceOverridden));
  const [manualUnitPrice, setManualUnitPrice] = useState(editingLine?.unitPrice ?? snapshotString(initialSnapshot, "manualUnitPrice", "0.00"));
  const [lineNotes, setLineNotes] = useState(editingLine?.notes ?? snapshotString(initialSnapshot, "notes"));

  const lineStandardMarkupMultiplier = flowType === "service" && serviceType === "access_equipment"
    ? standardAccessEquipmentMarkupMultiplier
    : standardMarkupMultiplier;
  const lineMarkupMultiplier = canOverrideMarkup
    ? multiplierValue(lineMarkupInput, lineStandardMarkupMultiplier)
    : initialSnapshot?.pricingSnapshot?.markupMultiplier != null
      ? multiplierValue(initialSnapshot.pricingSnapshot.markupMultiplier, lineStandardMarkupMultiplier)
      : lineStandardMarkupMultiplier;
  const profitMultiplier = multiplierValue(pricingSettings?.profitMultiplier, 1.2);
  const sellMultiplier = lineMarkupMultiplier * profitMultiplier;
  useEffect(() => {
    if (!canOverrideMarkup || editingLine || markupTouched) return;
    setLineMarkupInput(lineStandardMarkupMultiplier.toFixed(2));
  }, [canOverrideMarkup, editingLine, markupTouched, lineStandardMarkupMultiplier]);
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
  const savedMyobPriceMatrix = initialSnapshot?.myobPriceMatrixSnapshot && typeof initialSnapshot.myobPriceMatrixSnapshot === "object" && !Array.isArray(initialSnapshot.myobPriceMatrixSnapshot)
    ? initialSnapshot.myobPriceMatrixSnapshot
    : null;
  const savedMyobMatrixItem = savedMyobPriceMatrix && initialSnapshot?.myobMatrixItemUid
    ? {
        id: initialSnapshot.myobMatrixItemId || `saved-${initialSnapshot.myobMatrixItemUid}`,
        name: initialSnapshot.myobMatrixItemName || "Saved MYOB price item",
        sku: initialSnapshot.myobMatrixItemSku || null,
        myobUid: initialSnapshot.myobMatrixItemUid,
        myobPriceMatrix: savedMyobPriceMatrix,
        myobPriceMatrixSyncedAt: initialSnapshot.myobPriceMatrixSyncedAt || null
      } satisfies MyobMatrixItem
    : null;
  const planMatrixItemPool = useMemo(() => {
    const combined = savedMyobMatrixItem ? [...myobMatrixItems, savedMyobMatrixItem] : [...myobMatrixItems];
    const seen = new Set<string>();
    return combined.filter((item) => {
      const key = item.id || item.myobUid;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [myobMatrixItems, savedMyobMatrixItem]);
  const currentPlanSizeCode = planSizeCode(numberValue(widthMm, 0), numberValue(heightMm, 0));
  const sortedPlanMatrixItems = useMemo(() => [...planMatrixItemPool].sort((a, b) => {
    const scoreDiff = planMatrixItemScore(b, currentPlanSizeCode, smallPrintColour) - planMatrixItemScore(a, currentPlanSizeCode, smallPrintColour);
    if (scoreDiff !== 0) return scoreDiff;
    return matrixItemLabel(a).localeCompare(matrixItemLabel(b));
  }), [planMatrixItemPool, currentPlanSizeCode, smallPrintColour]);

  useEffect(() => {
    if (editingLine || flowType !== "plan_printing" || planPricingMode !== "myob_matrix" || planMatrixSelectionTouched || !sortedPlanMatrixItems.length) return;
    const first = sortedPlanMatrixItems[0];
    const firstScore = first ? planMatrixItemScore(first, currentPlanSizeCode, smallPrintColour) : 0;
    const secondScore = sortedPlanMatrixItems[1] ? planMatrixItemScore(sortedPlanMatrixItems[1], currentPlanSizeCode, smallPrintColour) : -1;
    const automaticItemId = first && firstScore >= 7 && firstScore > secondScore ? first.id : "";
    if (automaticItemId !== planMyobItemId) setPlanMyobItemId(automaticItemId);
  }, [editingLine, flowType, planPricingMode, planMatrixSelectionTouched, planMyobItemId, sortedPlanMatrixItems, currentPlanSizeCode, smallPrintColour]);
  const inkChoices = useMemo<Array<{ key: Exclude<InkChoice, "">; label: string; icon: string; description: string }>>(() => [
    { key: "none", label: "No print", icon: "—", description: "Use the selected stock without printing or ink charges." },
    { key: "cmyk", label: "CMYK", icon: "●", description: `${money(inkRatePerSqm)}/m² colour ink charge.` },
    { key: "white", label: "White", icon: "○", description: `${money(inkRatePerSqm)}/m² white ink charge.` },
    { key: "both", label: "CMYK + White", icon: "◐", description: `${money(inkRatePerSqm * 2)}/m² total ink charge.` }
  ], [inkRatePerSqm]);

  const baseMaterials = useMemo(() => {
    if (!baseType) return [];
    return materialPool
      .filter((material) => isSignageStock(material) && materialMatchesBase(material, baseType))
      .slice()
      .sort(compareSubstrateMaterials);
  }, [materialPool, baseType]);

  const baseMaterialGroups = useMemo(() => mainMaterialChoiceGroups(baseMaterials), [baseMaterials]);
  const isRollStockBase = baseType === "banner";
  const selectedMainMaterialGroup = useMemo(() => {
    const selectedById = baseMaterialGroups.find((group) => group.materials.some((material) => material.id === mainMaterialChoiceId));
    if (selectedById) return selectedById;

    // Compatibility for older quote snapshots that only stored thickness/colour.
    if (thickness || colour) {
      return baseMaterialGroups.find((group) => group.materials.some((material) => {
        const thicknessOk = !thickness || thicknessFor(material) === thickness;
        const colourOk = !colour || colourFor(material) === colour;
        return thicknessOk && colourOk;
      }));
    }
    return undefined;
  }, [baseMaterialGroups, mainMaterialChoiceId, thickness, colour]);

  const selectedMainMaterial = useMemo(() => {
    if (!selectedMainMaterialGroup) return undefined;
    const spacing = Math.max(0, numberValue(bleedSpacingMm, 0));
    const finishedWidth = numberValue(widthMm, 0);
    const finishedHeight = numberValue(heightMm, 0);
    const selectionWidth = finishedWidth > 0 ? finishedWidth + spacing * 2 : 0;
    const selectionHeight = finishedHeight > 0 ? finishedHeight + spacing * 2 : 0;
    const selectionQuantity = Math.max(1, numberValue(quantity, 1));

    if (isRollStockBase) {
      return bestRollMaterialForGroup(selectedMainMaterialGroup.materials, selectionWidth, selectionHeight, selectionQuantity)
        ?? selectedMainMaterialGroup.representative;
    }
    return bestSheetMaterialForGroup(selectedMainMaterialGroup.materials, selectionWidth, selectionHeight, selectionQuantity)
      ?? selectedMainMaterialGroup.representative;
  }, [selectedMainMaterialGroup, bleedSpacingMm, widthMm, heightMm, quantity, isRollStockBase]);

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
  const eyeletMaterial = materialPool.find((material) => materialText(material).includes("eyelet"));
  const standoffMaterials = useMemo(() => materialPool.filter(isStandoffMaterial), [materialPool]);
  const selectedStandoffMaterial = standoffMaterials.find((material) => material.id === standoffMaterialId);
  const installationMaterials = useMemo(() => materialPool
    .filter((material) => material.showAsInstallationOption === true)
    .sort((a, b) => a.name.localeCompare(b.name)), [materialPool]);
  const visibleServiceFixingOptions = useMemo(() => {
    const options: ServiceFixingOption[] = installationMaterials.map(installationOptionForMaterial);
    options.push(customInstallationAllowance);
    for (const key of serviceFixings) {
      if (options.some((item) => item.key === key)) continue;
      const legacy = legacyFixingOptions.find((item) => item.key === key);
      if (legacy) options.push(legacy);
    }
    return options;
  }, [installationMaterials, serviceFixings]);
  const resolvedServiceFixingRate = (key: string): number => {
    const manual = numberValue(serviceFixingRate[key], 0);
    if (manual > 0) return manual;
    const material = serviceFixingMaterialForKey(key, materialPool);
    return material ? installationMaterialRate(material).rate : 0;
  };
  const serviceFixingLabel = (key: string, fallback: string): string => key === "other" && otherConsumableTitle.trim() ? otherConsumableTitle.trim() : fallback;

  const selectedBase = baseTypes.find((item) => item.key === baseType);
  const selectedSmallType = smallFormatTypes.find((item) => item.key === smallType);
  const panelStandoffsApplicable = flowType === "signage" && Boolean(selectedMainMaterial) && !isRollMaterial(selectedMainMaterial as QuoteMaterial);
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
  const quoteQuantityEntered = flowType === "service" && serviceType === "access_equipment"
    ? numberValue(accessEquipmentDays, 0) > 0
    : numberValue(quantity, 0) > 0;
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

  const costingDepartment = flowType === "small_format"
    ? "small_format"
    : flowType === "plan_printing"
      ? "plan_printing"
      : flowType === "poster_printing"
        ? "poster_printing"
        : flowType === "signage"
          ? "signage"
          : "general";

  const signagePrintSheetUse = flowType === "signage" && selectedMainMaterial && !isRollMaterial(selectedMainMaterial) && width > 0 && height > 0
    ? sheetUsageForQuoteLine(selectedMainMaterial, usageWidth, usageHeight, Math.max(1, Math.ceil(quantityNumber * sideMultiplier)))
    : null;
  const signagePrintRollUse = flowType === "signage" && needsInkStep && activeRollMaterial && width > 0 && height > 0
    ? roundedRollMetresForQuantity(usageWidth, usageHeight, activeRollMaterial, Math.max(1, Math.ceil(quantityNumber * sideMultiplier)), effectiveDropDirection, safeDropOverlapMm)
    : null;
  const smallStockDimensionsForMachine = selectedSmallStock ? bestSheetDimensions(selectedSmallStock) : null;
  const smallPiecesPerSheetForMachine = smallStockDimensionsForMachine && width > 0 && height > 0
    ? piecesPerSheet(smallStockDimensionsForMachine.width, smallStockDimensionsForMachine.length, usageWidth, usageHeight)
    : 0;
  const smallRequiredPiecesForMachine = flowType === "small_format" && isDuplicateBook
    ? quantityNumber * Math.max(1, numberValue(ncrSetsPerBook, 1)) * Math.max(1, ncrCopiesCount || 1)
    : quantityNumber;
  const smallSheetsForMachine = selectedSmallStock && !isRollMaterial(selectedSmallStock)
    ? (smallPiecesPerSheetForMachine > 0 ? Math.ceil(smallRequiredPiecesForMachine / smallPiecesPerSheetForMachine) : smallRequiredPiecesForMachine)
    : 0;
  const smallRollUseForMachine = selectedSmallStock && isRollMaterial(selectedSmallStock) && width > 0 && height > 0
    ? roundedRollMetresForQuantity(usageWidth, usageHeight, selectedSmallStock, Math.max(1, Math.ceil(quantityNumber * sideMultiplier)))
    : null;

  const printRequiredWidthMm = flowType === "signage"
    ? (numberValue(activeRollMaterial?.rollWidthMm, 0) || (() => { const d = selectedMainMaterial ? bestSheetDimensions(selectedMainMaterial) : null; return d ? Math.min(d.width, d.length) : Math.min(width, height); })())
    : (numberValue(selectedSmallStock?.rollWidthMm, 0) || (smallStockDimensionsForMachine ? Math.min(smallStockDimensionsForMachine.width, smallStockDimensionsForMachine.length) : Math.min(width, height)));
  const printMachineMetrics = {
    quantity: quantityNumber,
    areaSqmPerUnit: flowType === "small_format" && isDuplicateBook
      ? areaSqm * Math.max(1, numberValue(ncrSetsPerBook, 1)) * Math.max(1, ncrCopiesCount || 1)
      : areaSqm * sideMultiplier,
    sheetsPerLine: flowType === "signage" ? signagePrintSheetUse?.physicalSheets ?? 0 : smallSheetsForMachine,
    linearMetresPerLine: flowType === "signage" ? signagePrintRollUse?.unroundedAmount ?? 0 : smallRollUseForMachine?.unroundedAmount ?? 0,
    requiredWidthMm: printRequiredWidthMm,
    sides: sideMultiplier,
    a4FacesPerParentSheet: flowType === "small_format" ? 2 : undefined
  };
  const printMachineSelection = (flowType === "signage" ? needsInkStep && printed : isPrintDepartment || flowType === "small_format" ? Boolean(smallPrintColour) : false)
    ? selectMachineForProcess(costingResources, ["direct print", "print"], printMachineMetrics, costingDepartment)
    : null;

  const laminateRollUseForMachine = selectedLaminate && width > 0 && height > 0
    ? roundedRollMetresForQuantity(usageWidth, usageHeight, selectedLaminate, Math.max(1, Math.ceil(quantityNumber * sideMultiplier)), effectiveDropDirection, safeDropOverlapMm, dropLayoutPreview)
    : null;
  const laminateMachineMetrics: MachineCostMetrics = {
    quantity: quantityNumber,
    areaSqmPerUnit: areaSqm * sideMultiplier,
    linearMetresPerLine: laminateRollUseForMachine?.unroundedAmount ?? 0,
    requiredWidthMm: numberValue((selectedLaminate ?? selectedSmallCoating)?.rollWidthMm, 0) || Math.min(width, height)
  };
  const laminateMachineSelection = ((flowType === "signage" && selectedLaminate && laminateId !== "none") || ((flowType === "small_format" || isPrintDepartment) && selectedSmallCoating && smallCoatingId !== "none"))
    ? selectMachineForProcess(costingResources, [...processAliases.laminate], laminateMachineMetrics, costingDepartment)
    : null;

  const signageParentDimensionsForMachine = selectedMainMaterial && !isRollMaterial(selectedMainMaterial)
    ? bestSheetDimensions(selectedMainMaterial)
    : null;
  const signageProcessWidthMm = numberValue(activeRollMaterial?.rollWidthMm, 0)
    || (signageParentDimensionsForMachine ? Math.min(signageParentDimensionsForMachine.width, signageParentDimensionsForMachine.length) : 0)
    || Math.min(width, height);
  const jingweiMachineSelection = flowType === "signage" && finishings.includes("jingwei")
    ? selectMachineForProcess(costingResources, ["jewei cut", "jingwei cut", "jewei", "jingwei"], {
        quantity: quantityNumber,
        areaSqmPerUnit: areaSqm,
        sheetsPerLine: signagePrintSheetUse?.physicalSheets ?? quantityNumber,
        requiredWidthMm: signageProcessWidthMm
      }, costingDepartment)
    : null;
  const eyeletMachineSelection = flowType === "signage" && finishings.includes("eyelets")
    ? selectMachineForProcess(costingResources, ["eyelets", "eyelet"], {
        quantity: quantityNumber,
        areaSqmPerUnit: areaSqm,
        linearMetresPerLine: Math.max(0, 2 * ((width + height) / 1000) * quantityNumber),
        requiredWidthMm: 0
      }, costingDepartment)
    : null;
  const mountMachineSelection = flowType === "signage" && finishings.includes("print_vinyl_application")
    ? selectMachineForProcess(costingResources, ["mount apply", "mounting application", "mount apply vinyl"], {
        quantity: quantityNumber,
        areaSqmPerUnit: areaSqm,
        requiredWidthMm: signageProcessWidthMm
      }, costingDepartment)
    : null;
  const trimLabour = labourForProcess(costingResources, [...processAliases.trim], costingDepartment);
  const trimMachineMetrics: MachineCostMetrics = {
    quantity: quantityNumber,
    areaSqmPerUnit: areaSqm,
    sheetsPerLine: smallSheetsForMachine,
    requiredWidthMm: numberValue(selectedSmallStock?.rollWidthMm, 0)
      || (smallStockDimensionsForMachine ? Math.min(smallStockDimensionsForMachine.width, smallStockDimensionsForMachine.length) : Math.min(width, height)),
    guillotineCutsPerStack: numberValue(trimLabour?.calculationValue, 0)
  };
  const trimMachineSelection = (flowType === "small_format" || isPrintDepartment) && smallFinishings.includes("trim")
    ? selectMachineForProcess(costingResources, [...processAliases.trim], trimMachineMetrics, costingDepartment)
    : null;

  const printLabourRate = labourRateForProcess(costingResources, [...processAliases.print], costingDepartment, labourRate);
  const laminateLabourRate = labourRateForProcess(costingResources, [...processAliases.laminate], costingDepartment, labourRate);
  const eyeletOperation = labourForProcess(costingResources, [...processAliases.eyelets], costingDepartment);
  const configuredEyeletMaterial = eyeletOperation?.consumableMaterialId ? materialPool.find((material) => material.id === eyeletOperation.consumableMaterialId) : undefined;
  const effectiveEyeletMaterial = configuredEyeletMaterial ?? eyeletMaterial;
  const eyeletLabourRate = labourRateForProcess(costingResources, [...processAliases.eyelets], costingDepartment, labourRate);
  const jingweiLabourRate = labourRateForProcess(costingResources, [...processAliases.jingwei], costingDepartment, labourRate);
  const mountLabourRate = labourRateForProcess(costingResources, [...processAliases.print_vinyl_application], costingDepartment, labourRate);
  const trimLabourRate = labourRateForProcess(costingResources, [...processAliases.trim], costingDepartment, labourRate);
  const selectedEyeletPreset = eyeletPresets.find((option) => option.label === eyeletPresetLabel);
  const eyeletsPerItem = selectedEyeletPreset?.qty === 0 ? numberValue(customEyeletQty, 0) : selectedEyeletPreset?.qty ?? 0;
  const printAutomaticLabour = (flowType === "signage" ? printed : Boolean(smallPrintColour))
    ? automaticLabourForProcess(costingResources, processAliases.print, costingDepartment, printMachineMetrics, quantityNumber)
    : null;
  const laminateAutomaticLabour = ((flowType === "signage" && selectedLaminate && laminateId !== "none") || ((flowType === "small_format" || isPrintDepartment) && selectedSmallCoating && smallCoatingId !== "none"))
    ? automaticLabourForProcess(costingResources, processAliases.laminate, costingDepartment, laminateMachineMetrics, quantityNumber)
    : null;
  const operationConsumableRow = (aliases: readonly string[], metrics: MachineCostMetrics, label: string): CostRow | null => {
    const operation = labourForProcess(costingResources, [...aliases], costingDepartment);
    if (!operation?.consumableMaterialId) return null;
    const material = materialPool.find((item) => item.id === operation.consumableMaterialId);
    if (!material) return null;
    const amount = operationConsumableAmount(operation, metrics, quantityNumber);
    if (amount <= 0) return null;
    const pricing = operationConsumableRate(material, operation.consumableBasis);
    return { label: `${label} material`, detail: material.name, amount, unit: pricing.unit, rate: pricing.rate, cost: amount * pricing.rate, note: ["linked from shop operation", pricing.note].filter(Boolean).join(" · ") || undefined };
  };

  const signageFinishingAutomaticLabour = Object.fromEntries(finishings.map((key) => {
    const aliases = signageFinishingProcessAliases[key];
    if (!aliases) return [key, null];
    const metrics: MachineCostMetrics = key === "eyelets"
      ? {
          quantity: quantityNumber * Math.max(0, eyeletsPerItem),
          areaSqmPerUnit: 0,
          linearMetresPerLine: Math.max(0, 2 * ((width + height) / 1000) * quantityNumber)
        }
      : {
          quantity: quantityNumber,
          areaSqmPerUnit: areaSqm,
          sheetsPerLine: signagePrintSheetUse?.physicalSheets ?? quantityNumber,
          linearMetresPerLine: signagePrintRollUse?.unroundedAmount ?? 0,
          requiredWidthMm: signageProcessWidthMm
        };
    return [key, automaticLabourForProcess(costingResources, aliases, costingDepartment, metrics, quantityNumber)];
  })) as Record<string, AutomaticLabourCost | null>;
  const signageFinishingLabourRates = Object.fromEntries(finishingOptions.map((item) => {
    const aliases = signageFinishingProcessAliases[item.key];
    return [item.key, aliases ? labourRateForProcess(costingResources, [...aliases], costingDepartment, labourRate) : labourRate];
  })) as Record<string, number>;
  const trimAutomaticMetrics: MachineCostMetrics = {
    ...trimMachineMetrics,
    guillotineMaxStackSheets: numberValue(trimMachineSelection?.machine?.maxStackSheets, 0),
    guillotineCutsPerMinute: trimMachineSelection?.machine?.speedUom === "cuts_per_minute" ? numberValue(trimMachineSelection.machine.speedValue, 0) : 0,
    guillotineSetupMinutes: numberValue(trimMachineSelection?.machine?.setupMinutes, 0)
  };
  const smallFinishingAutomaticLabour = Object.fromEntries(smallFinishings.map((key) => {
    const aliases = smallFinishingProcessAliases[key];
    if (!aliases) return [key, null];
    const metrics = key === "trim" ? trimAutomaticMetrics : {
      quantity: quantityNumber,
      areaSqmPerUnit: areaSqm,
      sheetsPerLine: smallSheetsForMachine,
      linearMetresPerLine: smallRollUseForMachine?.unroundedAmount ?? 0,
      requiredWidthMm: trimMachineMetrics.requiredWidthMm
    } satisfies MachineCostMetrics;
    return [key, automaticLabourForProcess(costingResources, aliases, costingDepartment, metrics, quantityNumber)];
  })) as Record<string, AutomaticLabourCost | null>;
  const smallFinishingLabourRates = Object.fromEntries(smallFinishingOptions.map((item) => {
    const aliases = smallFinishingProcessAliases[item.key];
    return [item.key, aliases ? labourRateForProcess(costingResources, [...aliases], costingDepartment, labourRate) : labourRate];
  })) as Record<string, number>;
  const printInkRatePerSqm = printMachineSelection?.machine
    ? (numberValue(printMachineSelection.machine.inkCostPerSqm, 0) > 0 ? numberValue(printMachineSelection.machine.inkCostPerSqm, 0) : inkRatePerSqm)
    : inkRatePerSqm;

  const machineCompatibilityIssues = [
    printMachineSelection && !printMachineSelection.machine && printMachineSelection.incompatibleMachines.length
      ? `Print job requires ${dimensionMm(printRequiredWidthMm)}mm machine width; ${printMachineSelection.incompatibleMachines.map((machine) => `${machine.name} max ${dimensionMm(numberValue(machine.maxWidthMm, 0))}mm`).join(", ")}.`
      : null,
    laminateMachineSelection && !laminateMachineSelection.machine && laminateMachineSelection.incompatibleMachines.length
      ? `Laminate/coating width exceeds the configured machine maximum (${laminateMachineSelection.incompatibleMachines.map((machine) => `${machine.name} ${dimensionMm(numberValue(machine.maxWidthMm, 0))}mm`).join(", ")}).`
      : null,
    jingweiMachineSelection && !jingweiMachineSelection.machine && jingweiMachineSelection.incompatibleMachines.length
      ? `Jingwei cutting width exceeds the configured machine maximum (${jingweiMachineSelection.incompatibleMachines.map((machine) => `${machine.name} ${dimensionMm(numberValue(machine.maxWidthMm, 0))}mm`).join(", ")}).`
      : null,
    mountMachineSelection && !mountMachineSelection.machine && mountMachineSelection.incompatibleMachines.length
      ? `Mount / apply width exceeds the configured machine maximum (${mountMachineSelection.incompatibleMachines.map((machine) => `${machine.name} ${dimensionMm(numberValue(machine.maxWidthMm, 0))}mm`).join(", ")}).`
      : null,
    trimMachineSelection && !trimMachineSelection.machine && trimMachineSelection.incompatibleMachines.length
      ? `Trim/cut width exceeds the configured machine maximum (${trimMachineSelection.incompatibleMachines.map((machine) => `${machine.name} ${dimensionMm(numberValue(machine.maxWidthMm, 0))}mm`).join(", ")}).`
      : null
  ].filter((message): message is string => Boolean(message));

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
          const rate = printLabourRate / 60;
          rows.push({
            label: "Print setup labour",
            detail: methodLabel,
            amount,
            unit: "min",
            rate,
            cost: amount * rate,
            note: labourChargeNote(minutes, printSetupLabourBasis, printLabourRate)
          });
        } else if (printAutomaticLabour) {
          rows.push(automaticLabourRow("Print labour", methodLabel, printAutomaticLabour));
        }
      }

      if (printMachineSelection?.machine && printMachineSelection.machineCostPerUnit > 0) {
        rows.push({
          label: "Print machine",
          detail: printMachineSelection.machine.name,
          amount: 1,
          unit: "item",
          rate: printMachineSelection.machineCostPerUnit,
          cost: printMachineSelection.machineCostPerUnit,
          note: `${printMachineSelection.machine.speedValue} ${printMachineSelection.machine.speedUom.replaceAll("_", " ")} · ${minutesLabel(printMachineSelection.machine.setupMinutes)} machine setup · ${money(numberValue(printMachineSelection.machine.hourlyCost, 0))}/hr`
        });
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
          rows.push({ label: "CMYK ink", detail: printMachineSelection?.machine?.name ?? "Print", amount: inkUse.amount, unit: "sqm", rate: printInkRatePerSqm, cost: inkUse.amount * printInkRatePerSqm, note: [inkNote, printMachineSelection?.machine ? "ink rate from machine settings" : "fallback quote ink rate"].filter(Boolean).join(" · ") || undefined });
        }
        if (ink === "white" || ink === "both") {
          rows.push({ label: "White ink", detail: printMachineSelection?.machine?.name ?? "Print", amount: inkUse.amount, unit: "sqm", rate: printInkRatePerSqm, cost: inkUse.amount * printInkRatePerSqm, note: [inkNote, printMachineSelection?.machine ? "ink rate from machine settings" : "fallback quote ink rate"].filter(Boolean).join(" · ") || undefined });
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
        if (laminateMachineSelection?.machine && laminateMachineSelection.machineCostPerUnit > 0) {
          rows.push({ label: "Laminate machine", detail: laminateMachineSelection.machine.name, amount: 1, unit: "item", rate: laminateMachineSelection.machineCostPerUnit, cost: laminateMachineSelection.machineCostPerUnit, note: `Machine settings · ${money(numberValue(laminateMachineSelection.machine.hourlyCost, 0))}/hr` });
        }
        const minutes = numberValue(laminateMinutes, 0);
        if (minutes > 0) {
          const amount = labourMinutesPerUnit(minutes, laminateLabourBasis, quantityNumber);
          const rate = laminateLabourRate / 60;
          rows.push({ label: "Laminate labour", detail: "Apply laminate", amount, unit: "min", rate, cost: amount * rate, note: labourChargeNote(minutes, laminateLabourBasis, laminateLabourRate) });
        } else if (laminateAutomaticLabour) {
          rows.push(automaticLabourRow("Laminate labour", "Apply laminate", laminateAutomaticLabour));
        }
      }

      for (const item of finishingOptions) {
        if (!finishings.includes(item.key)) continue;
        if (item.key === "eyelets") {
          const preset = eyeletPresets.find((option) => option.label === eyeletPresetLabel);
          const qty = preset?.qty === 0 ? numberValue(customEyeletQty, 0) : preset?.qty ?? 0;
          if (qty > 0 && effectiveEyeletMaterial) {
            const configuredQty = eyeletOperation?.consumableMaterialId ? Math.max(0, numberValue(eyeletOperation.consumableQuantity, 1)) : 1;
            const amount = qty * (configuredQty || 1);
            const rate = eachRate(effectiveEyeletMaterial);
            rows.push({ label: "Eyelets", detail: effectiveEyeletMaterial.name, amount, unit: "each", rate: rate.rate, cost: amount * rate.rate, note: [eyeletPresetLabel, configuredEyeletMaterial ? "linked from Eyelet operation" : null, rate.note].filter(Boolean).join(" · ") || undefined });
          }
          if (eyeletMachineSelection?.machine && eyeletMachineSelection.machineCostPerUnit > 0) {
            rows.push({ label: "Eyelet machine", detail: eyeletMachineSelection.machine.name, amount: 1, unit: "item", rate: eyeletMachineSelection.machineCostPerUnit, cost: eyeletMachineSelection.machineCostPerUnit, note: "Machine cost from Machines settings" });
          }
          const eyeletMinutes = numberValue(finishingMinutes[item.key], 0);
          if (qty > 0 && eyeletMinutes > 0) {
            const basis = finishingLabourBasis[item.key] ?? "per_item";
            const amount = basis === "per_item"
              ? qty * eyeletMinutes
              : labourMinutesPerUnit(eyeletMinutes, "line_total", quantityNumber);
            const operationRate = signageFinishingLabourRates[item.key] ?? eyeletLabourRate;
            const rate = operationRate / 60;
            rows.push({ label: "Eyelet labour", detail: `${eyeletPresetLabel} placement`, amount, unit: "min", rate, cost: amount * rate, note: labourChargeNote(eyeletMinutes, basis, operationRate, "per eyelet") });
          } else if (qty > 0 && signageFinishingAutomaticLabour[item.key]) {
            rows.push(automaticLabourRow("Eyelet labour", `${eyeletPresetLabel} placement`, signageFinishingAutomaticLabour[item.key]!));
          }
          continue;
        }
        const processMachine = item.key === "jingwei" ? jingweiMachineSelection : item.key === "print_vinyl_application" ? mountMachineSelection : null;
        if (processMachine?.machine && processMachine.machineCostPerUnit > 0) {
          rows.push({ label: `${item.label} machine`, detail: processMachine.machine.name, amount: 1, unit: "item", rate: processMachine.machineCostPerUnit, cost: processMachine.machineCostPerUnit, note: "Machine cost from Machines settings" });
        }
        const aliases = signageFinishingProcessAliases[item.key];
        if (aliases) {
          const materialRow = operationConsumableRow(aliases, { quantity: quantityNumber, areaSqmPerUnit: areaSqm, sheetsPerLine: signagePrintSheetUse?.physicalSheets ?? quantityNumber, linearMetresPerLine: signagePrintRollUse?.unroundedAmount ?? 0, requiredWidthMm: signageProcessWidthMm }, item.label);
          if (materialRow) rows.push(materialRow);
        }
        const minutes = numberValue(finishingMinutes[item.key], 0);
        if (minutes > 0) {
          const basis = finishingLabourBasis[item.key] ?? "line_total";
          const amount = labourMinutesPerUnit(minutes, basis, quantityNumber);
          const operationRate = signageFinishingLabourRates[item.key] ?? (item.key === "jingwei" ? jingweiLabourRate : item.key === "print_vinyl_application" ? mountLabourRate : labourRate);
          const rate = operationRate / 60;
          rows.push({ label: item.label, detail: "Factory labour", amount, unit: "min", rate, cost: amount * rate, note: labourChargeNote(minutes, basis, operationRate) });
        } else if (signageFinishingAutomaticLabour[item.key]) {
          rows.push(automaticLabourRow(item.label, "Factory labour", signageFinishingAutomaticLabour[item.key]!));
        }
      }

      if (panelStandoffsApplicable && selectedStandoffMaterial) {
        const qtyPerItem = Math.max(0, numberValue(standoffQtyPerItem, 0));
        if (qtyPerItem > 0) {
          const rate = eachRate(selectedStandoffMaterial);
          rows.push({
            label: "Standoffs",
            detail: selectedStandoffMaterial.name,
            amount: qtyPerItem,
            unit: "each",
            rate: rate.rate,
            cost: qtyPerItem * rate.rate,
            note: [
              `${usage(qtyPerItem)} per finished item`,
              quantityNumber > 1 ? `${usage(qtyPerItem * quantityNumber)} total for quote qty ${usage(quantityNumber)}` : null,
              rate.note
            ].filter(Boolean).join(" · ") || undefined
          });
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

      if (smallPrintColour) {
        const minutes = numberValue(printSetupMinutes, 0);
        if (minutes > 0) {
          const amount = labourMinutesPerUnit(minutes, printSetupLabourBasis, quantityNumber);
          const rate = printLabourRate / 60;
          rows.push({ label: "Print labour", detail: flowDepartmentProductName(flowType), amount, unit: "min", rate, cost: amount * rate, note: `Manual override · ${labourChargeNote(minutes, printSetupLabourBasis, printLabourRate)}` });
        } else if (printAutomaticLabour) {
          rows.push(automaticLabourRow("Print labour", flowDepartmentProductName(flowType), printAutomaticLabour));
        }
      }

      if (printMachineSelection?.machine && printMachineSelection.machineCostPerUnit > 0) {
        rows.push({ label: "Print machine", detail: printMachineSelection.machine.name, amount: 1, unit: "item", rate: printMachineSelection.machineCostPerUnit, cost: printMachineSelection.machineCostPerUnit, note: `${printMachineSelection.machine.speedValue} ${printMachineSelection.machine.speedUom.replaceAll("_", " ")} · ${money(numberValue(printMachineSelection.machine.hourlyCost, 0))}/hr` });
      }

      if (smallPrintColour && itemArea > 0) {
        const printedArea = itemArea * sideMultiplier;
        if (smallPrintColour === "mono") rows.push({ label: "Mono print", detail: flowDepartmentProductName(flowType), amount: printedArea, unit: "sqm", rate: monoRatePerSqm, cost: printedArea * monoRatePerSqm, note: sides === "double" ? "double sided" : undefined });
        if (smallPrintColour === "cmyk") rows.push({ label: "CMYK print", detail: printMachineSelection?.machine?.name ?? flowDepartmentProductName(flowType), amount: printedArea, unit: "sqm", rate: printInkRatePerSqm, cost: printedArea * printInkRatePerSqm, note: [sides === "double" ? "double sided" : null, printMachineSelection?.machine ? "ink rate from machine settings" : "fallback quote ink rate"].filter(Boolean).join(" · ") || undefined });
        if (smallPrintColour === "special") rows.push({ label: "CMYK + special print", detail: printMachineSelection?.machine?.name ?? flowDepartmentProductName(flowType), amount: printedArea, unit: "sqm", rate: printInkRatePerSqm * 2, cost: printedArea * printInkRatePerSqm * 2, note: [sides === "double" ? "double sided" : null, printMachineSelection?.machine ? "ink rate from machine settings" : "fallback quote ink rate"].filter(Boolean).join(" · ") || undefined });
      }

      if (selectedSmallCoating && smallCoatingId !== "none" && itemArea > 0) {
        const rate = isRollMaterial(selectedSmallCoating) ? rollRate(selectedSmallCoating) : sheetUnitRate(selectedSmallCoating);
        const amount = itemArea * sideMultiplier;
        rows.push({ label: "Coating / laminate", detail: selectedSmallCoating.name, amount, unit: "sqm", rate: rate.rate, cost: amount * rate.rate, note: [sides === "double" ? "double sided" : null, rate.note].filter(Boolean).join(" · ") || undefined });
        if (laminateMachineSelection?.machine && laminateMachineSelection.machineCostPerUnit > 0) {
          rows.push({ label: "Coating machine", detail: laminateMachineSelection.machine.name, amount: 1, unit: "item", rate: laminateMachineSelection.machineCostPerUnit, cost: laminateMachineSelection.machineCostPerUnit, note: "Machine cost from Machines settings" });
        }
        const minutes = numberValue(laminateMinutes, 0);
        if (minutes > 0) {
          const amount = labourMinutesPerUnit(minutes, laminateLabourBasis, quantityNumber);
          const rate = laminateLabourRate / 60;
          rows.push({ label: "Coating labour", detail: selectedSmallCoating.name, amount, unit: "min", rate, cost: amount * rate, note: `Manual override · ${labourChargeNote(minutes, laminateLabourBasis, laminateLabourRate)}` });
        } else if (laminateAutomaticLabour) {
          rows.push(automaticLabourRow("Coating labour", selectedSmallCoating.name, laminateAutomaticLabour));
        }
      }

      for (const item of smallFinishingOptions) {
        if (!smallFinishings.includes(item.key)) continue;
        if (item.key === "trim" && trimMachineSelection?.machine && trimMachineSelection.machineCostPerUnit > 0) {
          rows.push({ label: "Trim / cut machine", detail: trimMachineSelection.machine.name, amount: 1, unit: "item", rate: trimMachineSelection.machineCostPerUnit, cost: trimMachineSelection.machineCostPerUnit, note: "Machine cost from Machines settings" });
        }
        const aliases = smallFinishingProcessAliases[item.key];
        if (aliases) {
          const materialRow = operationConsumableRow(aliases, { quantity: quantityNumber, areaSqmPerUnit: areaSqm, sheetsPerLine: smallSheetsForMachine, linearMetresPerLine: smallRollUseForMachine?.unroundedAmount ?? 0, requiredWidthMm: trimMachineMetrics.requiredWidthMm }, item.label);
          if (materialRow) rows.push(materialRow);
        }
        const minutes = numberValue(smallFinishingMinutes[item.key], 0);
        if (minutes > 0) {
          const basis = smallFinishingLabourBasis[item.key] ?? smallFinishingDefaultBasis;
          const amount = labourMinutesPerUnit(minutes, basis, quantityNumber);
          const operationRate = smallFinishingLabourRates[item.key] ?? (item.key === "trim" ? trimLabourRate : labourRate);
          const rate = operationRate / 60;
          rows.push({ label: item.label, detail: "Finishing labour", amount, unit: "min", rate, cost: amount * rate, note: labourChargeNote(minutes, basis, operationRate) });
        } else if (smallFinishingAutomaticLabour[item.key]) {
          rows.push(automaticLabourRow(item.label, "Finishing labour", smallFinishingAutomaticLabour[item.key]!));
        }
      }
    }

    if (flowType === "small_format") {
      // `costs` is a PER-FINISHED-ITEM costing model. `unitPrice` is calculated from
      // rawCost and the quote quantity is applied once, later, when `lineTotal` is
      // calculated. Small-format used to put whole-line stock/print/coating costs in
      // this array and then multiply them by quantity a second time, which made runs
      // such as 500 business cards hundreds of times too expensive.
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
        const sheetsPerFinishedItem = sheets / quantityNumber;
        rows.push({
          label: isDuplicateBook ? "Carbon/NCR stock" : "Paper / card stock",
          detail: selectedSmallStock.name,
          amount: sheetsPerFinishedItem,
          unit: "sheet",
          rate: rate.rate,
          cost: sheetsPerFinishedItem * rate.rate,
          note: [
            spacingUsageNote || null,
            isDuplicateBook
              ? `${usage(quantityNumber)} books × ${usage(setsPerBook)} sets × ${copiesPerSet} copies · ${perSheet > 0 ? `${perSheet} up per parent sheet · ${sheets} sheets total` : "parent sheet size missing"}`
              : perSheet > 0
                ? `${perSheet} up per parent sheet · ${sheets} sheets total for qty ${usage(quantityNumber)}`
                : rate.note ?? "parent sheet size missing"
          ].filter(Boolean).join(" · ")
        });
      }

      if (artworkChoice === "required") {
        const minutes = numberValue(artworkMinutes, 0);
        if (minutes > 0) {
          const rate = labourRate / 60;
          const minutesPerFinishedItem = minutes / quantityNumber;
          rows.push({
            label: "Artwork",
            detail: "Artwork/design time",
            amount: minutesPerFinishedItem,
            unit: "min",
            rate,
            cost: minutesPerFinishedItem * rate,
            note: `${minutesLabel(minutes)} once per quote line · ${money(labourRate)}/hr`
          });
        }
      }

      if (smallPrintColour) {
        const minutes = numberValue(printSetupMinutes, 0);
        if (minutes > 0) {
          const amount = labourMinutesPerUnit(minutes, printSetupLabourBasis, quantityNumber);
          const rate = printLabourRate / 60;
          rows.push({ label: "Print labour", detail: "Small-format print", amount, unit: "min", rate, cost: amount * rate, note: `Manual override · ${labourChargeNote(minutes, printSetupLabourBasis, printLabourRate)}` });
        } else if (printAutomaticLabour) {
          rows.push(automaticLabourRow("Print labour", "Small-format print", printAutomaticLabour));
        }
      }

      if (isDuplicateBook && itemArea > 0 && quantityNumber > 0) {
        const setsPerBook = Math.max(1, numberValue(ncrSetsPerBook, 1));
        const copiesPerSet = Math.max(1, ncrCopiesCount || 1);
        const printedAreaPerBook = itemArea * setsPerBook * copiesPerSet;
        rows.push({ label: "Carbon book print", detail: pageColourSummary(copiesPerSet, ncrPageColours), amount: printedAreaPerBook, unit: "sqm", rate: monoRatePerSqm, cost: printedAreaPerBook * monoRatePerSqm, note: `${usage(quantityNumber)} books × ${usage(setsPerBook)} sets × ${copiesPerSet} copies` });
      }

      if (printMachineSelection?.machine && printMachineSelection.machineCostPerUnit > 0) {
        rows.push({ label: "Print machine", detail: printMachineSelection.machine.name, amount: 1, unit: "item", rate: printMachineSelection.machineCostPerUnit, cost: printMachineSelection.machineCostPerUnit, note: `${printMachineSelection.machine.speedValue} ${printMachineSelection.machine.speedUom.replaceAll("_", " ")} · ${money(numberValue(printMachineSelection.machine.hourlyCost, 0))}/hr` });
      }

      if (smallPrintColour && itemArea > 0 && quantityNumber > 0) {
        const printedAreaPerFinishedItem = itemArea * sideMultiplier;
        if (smallPrintColour === "mono") rows.push({ label: "Mono print", detail: "Small-format print charge", amount: printedAreaPerFinishedItem, unit: "sqm", rate: monoRatePerSqm, cost: printedAreaPerFinishedItem * monoRatePerSqm, note: sides === "double" ? "double sided" : undefined });
        if (smallPrintColour === "cmyk") rows.push({ label: "CMYK print", detail: printMachineSelection?.machine?.name ?? "Small-format print", amount: printedAreaPerFinishedItem, unit: "sqm", rate: printInkRatePerSqm, cost: printedAreaPerFinishedItem * printInkRatePerSqm, note: [sides === "double" ? "double sided" : null, printMachineSelection?.machine ? "ink rate from machine settings" : "fallback quote ink rate"].filter(Boolean).join(" · ") || undefined });
        if (smallPrintColour === "special") rows.push({ label: "CMYK + special print", detail: printMachineSelection?.machine?.name ?? "Small-format print", amount: printedAreaPerFinishedItem, unit: "sqm", rate: printInkRatePerSqm * 2, cost: printedAreaPerFinishedItem * printInkRatePerSqm * 2, note: [sides === "double" ? "double sided" : null, printMachineSelection?.machine ? "ink rate from machine settings" : "fallback quote ink rate"].filter(Boolean).join(" · ") || undefined });
      }

      if (selectedSmallCoating && smallCoatingId !== "none" && itemArea > 0 && quantityNumber > 0) {
        const rate = isRollMaterial(selectedSmallCoating) ? rollRate(selectedSmallCoating) : sheetUnitRate(selectedSmallCoating);
        const amountPerFinishedItem = itemArea * sideMultiplier;
        rows.push({ label: "Cello / coating", detail: selectedSmallCoating.name, amount: amountPerFinishedItem, unit: "sqm", rate: rate.rate, cost: amountPerFinishedItem * rate.rate, note: [sides === "double" ? "double sided" : null, rate.note].filter(Boolean).join(" · ") || undefined });
        if (laminateMachineSelection?.machine && laminateMachineSelection.machineCostPerUnit > 0) {
          rows.push({ label: "Coating machine", detail: laminateMachineSelection.machine.name, amount: 1, unit: "item", rate: laminateMachineSelection.machineCostPerUnit, cost: laminateMachineSelection.machineCostPerUnit, note: "Machine cost from Machines settings" });
        }
        const minutes = numberValue(laminateMinutes, 0);
        if (minutes > 0) {
          const amount = labourMinutesPerUnit(minutes, laminateLabourBasis, quantityNumber);
          const rate = laminateLabourRate / 60;
          rows.push({ label: "Coating labour", detail: selectedSmallCoating.name, amount, unit: "min", rate, cost: amount * rate, note: `Manual override · ${labourChargeNote(minutes, laminateLabourBasis, laminateLabourRate)}` });
        } else if (laminateAutomaticLabour) {
          rows.push(automaticLabourRow("Coating labour", selectedSmallCoating.name, laminateAutomaticLabour));
        }
      }

      for (const item of smallFinishingOptions) {
        if (!smallFinishings.includes(item.key)) continue;
        if (item.key === "trim" && trimMachineSelection?.machine && trimMachineSelection.machineCostPerUnit > 0) {
          rows.push({ label: "Trim / cut machine", detail: trimMachineSelection.machine.name, amount: 1, unit: "item", rate: trimMachineSelection.machineCostPerUnit, cost: trimMachineSelection.machineCostPerUnit, note: "Machine cost from Machines settings" });
        }
        const aliases = smallFinishingProcessAliases[item.key];
        if (aliases) {
          const materialRow = operationConsumableRow(aliases, { quantity: quantityNumber, areaSqmPerUnit: areaSqm, sheetsPerLine: smallSheetsForMachine, linearMetresPerLine: smallRollUseForMachine?.unroundedAmount ?? 0, requiredWidthMm: trimMachineMetrics.requiredWidthMm }, item.label);
          if (materialRow) rows.push(materialRow);
        }
        const minutes = numberValue(smallFinishingMinutes[item.key], 0);
        if (minutes > 0) {
          const basis = smallFinishingLabourBasis[item.key] ?? smallFinishingDefaultBasis;
          const amount = labourMinutesPerUnit(minutes, basis, quantityNumber);
          const operationRate = smallFinishingLabourRates[item.key] ?? (item.key === "trim" ? trimLabourRate : labourRate);
          const rate = operationRate / 60;
          rows.push({ label: item.label, detail: "Bindery / finishing labour", amount, unit: "min", rate, cost: amount * rate, note: labourChargeNote(minutes, basis, operationRate) });
        } else if (smallFinishingAutomaticLabour[item.key]) {
          rows.push(automaticLabourRow(item.label, "Bindery / finishing labour", smallFinishingAutomaticLabour[item.key]!));
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
        for (const key of serviceFixings) {
          const item = serviceFixingOptionForKey(key, materialPool);
          if (!item) continue;
          const qty = numberValue(serviceFixingQty[key], 0);
          const rate = resolvedServiceFixingRate(key);
          if (qty > 0 && rate > 0) rows.push({ label: serviceFixingLabel(key, item.label), detail: "Install fixing / consumable total", amount: qty / Math.max(1, quantityNumber), unit: item.unit, rate, cost: (qty * rate) / Math.max(1, quantityNumber), note: `${usage(qty)} ${item.unit} total for the quote line` });
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
  }, [flowType, selectedMainMaterial, areaSqm, width, height, usageWidth, usageHeight, spacingUsageNote, artworkChoice, artworkMinutes, printed, printSetupMinutes, printSetupLabourBasis, printAutomaticLabour, selectedMedia, needsAdditionalMediaCost, sideMultiplier, resolvedPrintMethod, needsInkStep, ink, backingApplicable, selectedBacking, backingId, selectedBackingGroup, selectedLaminate, laminateId, laminateMinutes, laminateLabourBasis, laminateAutomaticLabour, finishings, finishingMinutes, finishingLabourBasis, signageFinishingAutomaticLabour, signageFinishingLabourRates, eyeletPresetLabel, customEyeletQty, eyeletMaterial, effectiveEyeletMaterial, eyeletOperation, panelStandoffsApplicable, selectedStandoffMaterial, standoffQtyPerItem, selectedSmallStock, quantityNumber, smallPrintColour, sides, selectedSmallCoating, smallCoatingId, smallFinishings, smallFinishingMinutes, smallFinishingLabourBasis, smallFinishingDefaultBasis, smallFinishingAutomaticLabour, smallFinishingLabourRates, isDuplicateBook, ncrSetsPerBook, ncrCopiesCount, ncrPageColours, serviceType, deliveryCharge, installCrewSize, installMinutes, installLabourBasis, travelCharge, accessEquipmentDailyCharge, accessEquipmentType, serviceFixings, serviceFixingQty, serviceFixingRate, materialPool, otherConsumableTitle, componentParts, componentLabourMinutes, componentLabourLabel, componentName, labourRate, monoRatePerSqm, inkRatePerSqm, inkBillingIncrementSqm, isPrintDepartment, effectiveDropDirection, safeDropOverlapMm, dropLayoutPreview]);

  const serviceLabel = serviceTypes.find((item) => item.key === serviceType)?.label;
  const rawCost = costs.reduce((total, row) => total + row.cost, 0);
  const priceLevelFactor = Math.max(0, numberValue(pricingSettings?.priceLevelFactor, 1));
  const manualQuoteDiscountPercent = discountPercentValue(pricingSettings?.manualQuoteDiscountPercent);
  const manualQuoteDiscountMultiplier = Math.max(0, 1 - manualQuoteDiscountPercent / 100);
  const pricingMultiplier = sellMultiplier * priceLevelFactor * manualQuoteDiscountMultiplier;
  const standardPricingMultiplier = standardMarkupMultiplier * profitMultiplier * priceLevelFactor * manualQuoteDiscountMultiplier;
  const standardAccessEquipmentPricingMultiplier = standardAccessEquipmentMarkupMultiplier * profitMultiplier * priceLevelFactor * manualQuoteDiscountMultiplier;
  const effectivePricingMultiplier = pricingMultiplier;
  const selectedPlanMatrixItem = planMatrixItemPool.find((item) => item.id === planMyobItemId) ?? null;
  const preserveSavedPlanMatrix = Boolean(
    !planMatrixSelectionTouched
    && savedMyobPriceMatrix
    && initialSnapshot?.myobMatrixItemId
    && initialSnapshot.myobMatrixItemId === planMyobItemId
  );
  const activePlanPriceMatrix = preserveSavedPlanMatrix ? savedMyobPriceMatrix : selectedPlanMatrixItem?.myobPriceMatrix ?? null;
  const useMyobPlanPricing = flowType === "plan_printing" && planPricingMode === "myob_matrix";
  const selectedPlanMatrixPrice = useMyobPlanPricing
    ? myobMatrixPrice(activePlanPriceMatrix, pricingSettings?.priceLevelCode, quantityNumber)
    : null;
  const myobPlanUnitPrice = selectedPlanMatrixPrice ? selectedPlanMatrixPrice.unitPrice * manualQuoteDiscountMultiplier : null;
  const autoUnitPrice = useMyobPlanPricing ? (myobPlanUnitPrice ?? 0) : (rawCost * effectivePricingMultiplier);
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
      for (const key of serviceFixings) {
        const item = serviceFixingOptionForKey(key, materialPool);
        if (!item) continue;
        const qty = numberValue(serviceFixingQty[key], 0);
        const rate = resolvedServiceFixingRate(key);
        if (qty > 0 && rate > 0) rows.push({ label: serviceFixingLabel(key, item.label), detail: "Install fixing / consumable total", amount: qty / dispatchLineQuantity, unit: item.unit, rate, cost: (qty * rate) / dispatchLineQuantity, note: `${usage(qty)} ${item.unit} total for the quote line` });
      }
    }

    return rows;
  }, [serviceType, deliveryCharge, installCrewSize, installMinutes, installLabourBasis, travelCharge, serviceFixings, serviceFixingQty, serviceFixingRate, materialPool, otherConsumableTitle, labourRate, dispatchLineQuantity]);
  const dispatchRawCost = dispatchCosts.reduce((total, row) => total + row.cost, 0);
  const dispatchUnitPrice = dispatchRawCost * standardPricingMultiplier;
  const dispatchLineTotal = dispatchUnitPrice * dispatchLineQuantity;
  const fixingAllowanceSummary = serviceFixings.map((key) => {
    const item = serviceFixingOptionForKey(key, materialPool);
    if (!item) return "";
    const qty = numberValue(serviceFixingQty[key], 0);
    if (qty <= 0) return item.label;
    const pluralUnit = item.unit === "tube" && Math.abs(qty - 1) > 0.0001
      ? "tubes"
      : item.unit === "allowance" && Math.abs(qty - 1) > 0.0001
        ? "allowances"
        : item.unit;
    const unitText = pluralUnit === "lm" ? `${usage(qty)}lm` : `${usage(qty)} ${pluralUnit}`;
    return `${serviceFixingLabel(item.key, item.label)} — ${unitText}`;
  }).filter(Boolean).join(", ");
  const dispatchSummary = serviceType === "pickup"
    ? "Pickup"
    : serviceType === "delivery"
      ? `Delivery${deliveryCharge ? ` · allowance ${money(numberValue(deliveryCharge, 0))}` : ""}`
      : serviceType === "install"
        ? ["Install", installCrewSize ? `${installCrewSize} installer${numberValue(installCrewSize, 1) === 1 ? "" : "s"}` : null, installMinutes ? `${usage(numberValue(installMinutes, 0) / 60)} hr ${installLabourBasis === "per_item" ? "per item" : "total line item"}` : null, travelCharge ? `${money(numberValue(travelCharge, 0))} travel / call-out total` : null, fixingAllowanceSummary ? `Fixings allowance: ${fixingAllowanceSummary}` : null].filter(Boolean).join(" · ")
        : "";
  const shouldCreateDispatchLine = flowType !== "service" && (serviceType === "delivery" || serviceType === "install") && dispatchUnitPrice > 0;
  const accessEquipmentDaysNumber = Math.max(1, numberValue(accessEquipmentDays, 1));
  const accessEquipmentRawDailyCharge = numberValue(accessEquipmentDailyCharge, 0);
  const accessEquipmentDailySellPrice = accessEquipmentRawDailyCharge * standardAccessEquipmentPricingMultiplier;
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

  const standoffQtyPerItemNumber = Math.max(0, numberValue(standoffQtyPerItem, 0));
  const standoffSummary = panelStandoffsApplicable && selectedStandoffMaterial && standoffQtyPerItemNumber > 0
    ? `Standoffs: ${customerMaterialName(selectedStandoffMaterial)} × ${usage(standoffQtyPerItemNumber)}`
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
      serviceType === "install" && installMinutes ? `${usage(numberValue(installMinutes, 0) / 60)} hr install ${installLabourBasis === "per_item" ? "per item" : "total line item"}` : null,
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
      standoffSummary || null,
      finishingSummary ? `Finishing: ${finishingSummary}` : null,
      serviceType !== "install" && dispatchSummary ? `Dispatch: ${dispatchSummary}` : null,
      `Qty ${quantityNumber}`
    ].filter(Boolean).join(" · ");

  const accessEquipmentSelectionComplete = !accessEquipmentRequired || accessEquipmentDetailsComplete;
  const dispatchComplete = serviceType === "pickup"
    || (serviceType === "delivery" && numberValue(deliveryCharge, 0) > 0)
    || (serviceType === "install" && numberValue(installCrewSize, 0) > 0 && numberValue(installMinutes, 0) > 0 && accessEquipmentSelectionComplete);

  const planMatrixPricingReady = flowType !== "plan_printing" || planPricingMode === "pm_calculated" || Boolean(selectedPlanMatrixItem && selectedPlanMatrixPrice);

  const canSaveBase = flowType === "component"
    ? Boolean(componentName.trim() && componentHasCost && quoteQuantityEntered)
    : flowType === "service"
    ? Boolean(serviceType && quoteQuantityEntered && (
      serviceType === "pickup"
      || (serviceType === "delivery" && numberValue(deliveryCharge, 0) > 0)
      || (serviceType === "install" && numberValue(installCrewSize, 0) > 0 && numberValue(installMinutes, 0) > 0 && accessEquipmentSelectionComplete)
      || (serviceType === "access_equipment" && accessEquipmentDetailsComplete)
    ))
    : isPrintDepartment
      ? Boolean(selectedSmallStock && width > 0 && height > 0 && artworkChoice && sides && smallPrintColour && smallCoatingId && quoteQuantityEntered && dispatchComplete && planMatrixPricingReady)
      : flowType === "small_format"
        ? Boolean(smallType && ncrDetailsComplete && selectedSmallStock && width > 0 && height > 0 && artworkChoice && (isDuplicateBook || (sides && smallPrintColour && smallCoatingId)) && quoteQuantityEntered && dispatchComplete)
        : Boolean(baseType && selectedMainMaterial && width > 0 && height > 0 && quoteQuantityEntered && artworkChoice && resolvedPrintMethod && (!needsMediaStep || mediaId) && (!needsInkStep || ink) && (!printed || sides) && (!canChooseReversePrint || !printed || printDirection) && (!backingApplicable || Boolean(backingId)) && (!printed || Boolean(laminateId)) && dispatchComplete);
  const canSave = canSaveBase && machineCompatibilityIssues.length === 0;

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
    mediaId: isRollStockBase ? selectedMainMaterial?.id ?? mediaId : mediaId,
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
    standoffMaterialId: panelStandoffsApplicable ? standoffMaterialId : "",
    standoffQtyPerItem: panelStandoffsApplicable ? standoffQtyPerItem : "",
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
    planPricingMode: flowType === "plan_printing" ? planPricingMode : undefined,
    myobMatrixItemId: flowType === "plan_printing" && planPricingMode === "myob_matrix" ? selectedPlanMatrixItem?.id ?? planMyobItemId : undefined,
    myobMatrixItemUid: flowType === "plan_printing" && planPricingMode === "myob_matrix" ? selectedPlanMatrixItem?.myobUid ?? initialSnapshot?.myobMatrixItemUid : undefined,
    myobMatrixItemName: flowType === "plan_printing" && planPricingMode === "myob_matrix" ? selectedPlanMatrixItem?.name ?? initialSnapshot?.myobMatrixItemName : undefined,
    myobMatrixItemSku: flowType === "plan_printing" && planPricingMode === "myob_matrix" ? String(selectedPlanMatrixItem?.sku ?? initialSnapshot?.myobMatrixItemSku ?? "") : undefined,
    myobPriceMatrixSnapshot: flowType === "plan_printing" && planPricingMode === "myob_matrix" && activePlanPriceMatrix ? activePlanPriceMatrix : undefined,
    myobPriceMatrixSyncedAt: flowType === "plan_printing" && planPricingMode === "myob_matrix" ? selectedPlanMatrixItem?.myobPriceMatrixSyncedAt ?? initialSnapshot?.myobPriceMatrixSyncedAt : undefined,
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
    otherConsumableTitle,
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
      eyelet: snapshotMaterialForSave(effectiveEyeletMaterial),
      standoff: snapshotMaterialForSave(panelStandoffsApplicable ? selectedStandoffMaterial : undefined),
      componentParts: Array.from(new Map(componentParts
        .map((part) => materialPool.find((material) => material.id === part.materialId))
        .filter((material): material is QuoteMaterial => Boolean(material))
        .map((material) => [material.id, snapshotMaterialForSave(material) as SnapshotMaterial])).values()),
      installation: Array.from(new Map(serviceFixings
        .map((key) => serviceFixingMaterialForKey(key, materialPool))
        .filter((material): material is QuoteMaterial => Boolean(material))
        .map((material) => [material.id, snapshotMaterialForSave(material) as SnapshotMaterial])).values())
    },
    pricingSnapshot: {
      markupMultiplier: lineMarkupMultiplier,
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
      pricingSource: flowType === "plan_printing" && planPricingMode === "myob_matrix" && selectedPlanMatrixPrice ? "myob_item_matrix" : "pm_calculated",
      myobMatrixItemUid: selectedPlanMatrixPrice ? selectedPlanMatrixItem?.myobUid ?? initialSnapshot?.myobMatrixItemUid : undefined,
      myobMatrixItemName: selectedPlanMatrixPrice ? selectedPlanMatrixItem?.name ?? initialSnapshot?.myobMatrixItemName : undefined,
      myobMatrixItemSku: selectedPlanMatrixPrice ? String(selectedPlanMatrixItem?.sku ?? initialSnapshot?.myobMatrixItemSku ?? "") : undefined,
      myobMatrixUnitPrice: selectedPlanMatrixPrice?.unitPrice,
      myobMatrixQuantityOver: selectedPlanMatrixPrice?.quantityOver,
      myobMatrixLevelKey: selectedPlanMatrixPrice?.levelKey,
      pricingBreakdown: costs.map((row) => ({ ...row })),
      machineCosting: {
        printMachineId: printMachineSelection?.machine?.id ?? null,
        printMachineName: printMachineSelection?.machine?.name ?? null,
        laminateMachineId: laminateMachineSelection?.machine?.id ?? null,
        laminateMachineName: laminateMachineSelection?.machine?.name ?? null,
        jingweiMachineId: jingweiMachineSelection?.machine?.id ?? null,
        jingweiMachineName: jingweiMachineSelection?.machine?.name ?? null,
        eyeletMachineId: eyeletMachineSelection?.machine?.id ?? null,
        eyeletMachineName: eyeletMachineSelection?.machine?.name ?? null,
        trimMachineId: trimMachineSelection?.machine?.id ?? null,
        trimMachineName: trimMachineSelection?.machine?.name ?? null
      }
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
    otherConsumableTitle,
    quantity: String(dispatchLineQuantity),
    unitPriceOverridden: false,
    manualUnitPrice: dispatchUnitPrice.toFixed(2),
    notes: "",
    materialSnapshots: { componentParts: [], installation: Array.from(new Map(serviceFixings.map((key) => serviceFixingMaterialForKey(key, materialPool)).filter((material): material is QuoteMaterial => Boolean(material)).map((material) => [material.id, snapshotMaterialForSave(material) as SnapshotMaterial])).values()) },
    pricingSnapshot: {
      markupMultiplier: standardMarkupMultiplier,
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
      markupMultiplier: standardAccessEquipmentMarkupMultiplier,
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
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Base product</b><select value={baseType} onChange={(event) => { setBaseType(event.target.value as BaseType); setThickness(""); setColour(""); setMainMaterialChoiceId(""); setMediaId(""); changed(); }} style={inputStyle}><option value="">Choose base</option>{baseTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>;
    }

    if (compactStep === "thickness" || compactStep === "colour") {
      const selectedId = selectedMainMaterialGroup?.representative.id ?? "";
      return <div style={compactPanel}>
        <label style={{ display: "grid", gap: 6 }}><b>Material / substrate</b><select value={selectedId} onChange={(event) => { const group = baseMaterialGroups.find((item) => item.representative.id === event.target.value); const material = group?.representative; setMainMaterialChoiceId(material?.id ?? ""); if (baseType === "banner") setMediaId(material?.id ?? ""); setThickness(material ? thicknessFor(material) : ""); setColour(material ? colourFor(material) : ""); changed(); }} style={inputStyle}><option value="">Choose material</option>{baseMaterialGroups.map((group) => <option key={group.key} value={group.representative.id}>{group.label} — {isRollStockBase ? rollGroupDescription(group) : sheetGroupDescription(group)}</option>)}</select></label>
        {selectedMainMaterialGroup ? <small style={{ color: "#0f766e", fontWeight: 800 }}>{selectedMainMaterialGroup.materials.length > 1 ? `${selectedMainMaterialGroup.materials.length} interchangeable stock sizes · ` : ""}{isRollStockBase ? rollGroupDescription(selectedMainMaterialGroup) : sheetGroupDescription(selectedMainMaterialGroup)}</small> : null}
        {selectedMainMaterial && width > 0 && height > 0 ? <small style={{ color: "#64748b" }}>PM selected stock: {materialCardMeta(selectedMainMaterial)}</small> : null}
      </div>;
    }

    if (compactStep === "size" || compactStep === "small_size") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Preset finished size</b><select value={activeSizePresetValue} onChange={(event) => { const preset = activeSizePresets.find((item) => `${item.width}x${item.height}` === event.target.value); if (preset) { setWidthMm(preset.width); setHeightMm(preset.height); changed(); } }} style={inputStyle}><option value="">Custom size</option>{activeSizePresets.map((preset) => <option key={`${preset.label}-${preset.width}-${preset.height}`} value={`${preset.width}x${preset.height}`}>{preset.label}</option>)}</select></label><label style={{ display: "grid", gap: 6 }}><b>Width mm</b><input value={widthMm} onChange={(event) => { setWidthMm(event.target.value); changed(); }} type="number" min="0" step="1" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Height mm</b><input value={heightMm} onChange={(event) => { setHeightMm(event.target.value); changed(); }} type="number" min="0" step="1" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Bleed / spacing per side mm</b><input value={bleedSpacingMm} onChange={(event) => { setBleedSpacingMm(event.target.value); changed(); }} type="number" min="0" step="0.01" style={inputStyle} /></label></div>{nestingFootprintLabel ? <small style={{ color: "#64748b" }}>Material yield uses {nestingFootprintLabel}; client-facing finished size stays unchanged.</small> : null}{compactStep === "size" && isRollStockBase ? renderDropLayoutControls(true) : null}</div>;
    }

    if (compactStep === "artwork") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Artwork</b><select value={artworkChoice} onChange={(event) => { setArtworkChoice(event.target.value as ArtworkChoice); changed(); }} style={inputStyle}><option value="">Choose artwork</option><option value="client_supplied">Print-ready artwork supplied</option><option value="required">Artwork / setup required</option></select></label>{artworkChoice === "required" ? <label style={{ display: "grid", gap: 6 }}><b>Artwork minutes</b><input value={artworkMinutes} onChange={(event) => { setArtworkMinutes(event.target.value); changed(); }} type="number" min="0" step="0.01" style={inputStyle} /></label> : null}</div></div>;
    }

    if (compactStep === "print") {
      return <div style={compactPanel}><div style={compactGrid}>{!isRollStockBase ? <label style={{ display: "grid", gap: 6 }}><b>Print method</b><select value={printMethod} onChange={(event) => { setPrintMethod(event.target.value as PrintMethod); setInk(""); setMediaId(""); setPrintDirection(""); setBackingId(""); changed(); }} style={inputStyle}><option value="">Choose print method</option>{printMethods.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label> : <div><b>Print method</b><div style={{ marginTop: 6, fontWeight: 900 }}>Roll stock</div></div>}</div>{printed ? <InlineLabourField label="Print labour" value={printSetupMinutes} basis={printSetupLabourBasis} onChange={(value) => { setPrintSetupMinutes(value); changed(); }} onBasisChange={(basis) => { setPrintSetupLabourBasis(basis); changed(); }} labourRate={printLabourRate} quantity={quantityNumber} automatic={printAutomaticLabour} /> : null}</div>;
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
      return <div style={compactPanel}><div style={compactGrid}>{backingApplicable ? <label style={{ display: "grid", gap: 6 }}><b>Backing</b><select value={backingSelectValue} onChange={(event) => { setBackingId(event.target.value); changed(); }} style={inputStyle}><option value="">Choose backing</option><option value="none">No backing</option>{backingGroups.map((group) => <option key={group.key} value={group.representative.id}>{group.label}</option>)}</select></label> : null}<label style={{ display: "grid", gap: 6 }}><b>Laminate</b><select value={laminateId} onChange={(event) => { setLaminateId(event.target.value); changed(); }} style={inputStyle}><option value="">Choose laminate</option><option value="none">No laminate</option>{laminateMaterials.map((material) => <option key={material.id} value={material.id}>{internalMaterialName(material)}</option>)}</select></label></div>{printed && laminateId && laminateId !== "none" ? <InlineLabourField label="Laminate labour" value={laminateMinutes} basis={laminateLabourBasis} onChange={(value) => { setLaminateMinutes(value); changed(); }} onBasisChange={(basis) => { setLaminateLabourBasis(basis); changed(); }} labourRate={laminateLabourRate} quantity={quantityNumber} automatic={laminateAutomaticLabour} /> : null}</div>;
    }

    if (compactStep === "finishing") {
      return (
        <div style={compactPanel}>
          <div style={checkGrid}>{finishingOptions.map((item) => <label key={item.key} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 850 }}><input type="checkbox" checked={finishings.includes(item.key)} onChange={() => { toggleFinishing(item.key); changed(); }} /><span>{item.label}</span></label>)}</div>
          <SelectedLabourMinutes options={finishingOptions} selected={finishings} values={finishingMinutes} bases={finishingLabourBasis} onChange={(value) => { setFinishingMinutes(value); changed(); }} onBasesChange={(value) => { setFinishingLabourBasis(value); changed(); }} defaultBasis="line_total" eachLabelFor="eyelets" labourRate={labourRate} labourRatesByKey={signageFinishingLabourRates} automaticByKey={signageFinishingAutomaticLabour} quantity={quantityNumber} />
          {finishings.includes("eyelets") ? <div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Eyelet preset</b><select value={eyeletPresetLabel} onChange={(event) => { setEyeletPresetLabel(event.target.value); changed(); }} style={inputStyle}>{eyeletPresets.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}</select></label><label style={{ display: "grid", gap: 6 }}><b>Custom eyelet qty</b><input value={customEyeletQty} onChange={(event) => { setCustomEyeletQty(event.target.value); changed(); }} type="number" min="0" step="1" style={inputStyle} /></label></div> : null}
          {panelStandoffsApplicable ? (
            <div style={{ marginTop: 12, border: "1px solid #bfdbfe", borderRadius: 14, background: "#eff6ff", padding: 12, display: "grid", gap: 10 }}>
              <div>
                <b>Panel mounting add-on — standoffs</b>
                <div style={{ color: "#475467", fontSize: 12, marginTop: 3 }}>Uses the per-each cost from your Materials library. The quantity below is per finished item and is multiplied by the quote quantity automatically.</div>
              </div>
              {standoffMaterials.length ? (
                <div style={compactGrid}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <b>Standoffs</b>
                    <select value={standoffMaterialId} onChange={(event) => { setStandoffMaterialId(event.target.value); changed(); }} style={inputStyle}>
                      <option value="">No standoffs</option>
                      {standoffMaterials.map((material) => <option key={material.id} value={material.id}>{internalMaterialName(material)}</option>)}
                    </select>
                  </label>
                  {standoffMaterialId ? (
                    <label style={{ display: "grid", gap: 6 }}>
                      <b>Qty per finished item</b>
                      <input value={standoffQtyPerItem} onChange={(event) => { setStandoffQtyPerItem(event.target.value); changed(); }} type="number" min="0" step="1" style={inputStyle} />
                      <small style={{ color: "#64748b" }}>{usage(standoffQtyPerItemNumber)} each × quote qty {usage(quantityNumber)} = {usage(standoffQtyPerItemNumber * quantityNumber)} standoff{Math.abs(standoffQtyPerItemNumber * quantityNumber - 1) < 0.0001 ? "" : "s"} total.</small>
                    </label>
                  ) : null}
                </div>
              ) : (
                <div style={{ padding: 10, borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontSize: 12 }}>Add standoff items under <b>Materials</b> (for example Silver Standoff / Black Standoff) as individual <b>each</b> items and they will appear here automatically.</div>
              )}
            </div>
          ) : null}
        </div>
      );
    }

    if (compactStep === "small_type") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Print item</b><select value={smallType} onChange={(event) => { setSmallType(event.target.value as SmallFormatType); changed(); }} style={inputStyle}><option value="">Choose item</option>{smallFormatTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>;
    }

    if (compactStep === "ncr_details") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Copies / parts</b><input value={ncrCopies} onChange={(event) => { setNcrCopies(event.target.value); changed(); }} type="number" min="2" step="1" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Sets per book</b><input value={ncrSetsPerBook} onChange={(event) => { setNcrSetsPerBook(event.target.value); changed(); }} type="number" min="1" step="1" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Page colours</b><input value={ncrPageColours.join(", ")} onChange={(event) => { setNcrPageColours(event.target.value.split(",").map((item) => item.trim()).filter(Boolean)); changed(); }} style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Cover colour</b><input value={ncrCoverColour} onChange={(event) => { setNcrCoverColour(event.target.value); changed(); }} style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Tape colour</b><input value={ncrTapeColour} onChange={(event) => { setNcrTapeColour(event.target.value); changed(); }} style={inputStyle} /></label></div></div>;
    }

    if (compactStep === "small_stock") {
      return (
        <div style={compactPanel}>
          {flowType === "plan_printing" ? (
            <div style={{ border: "1px solid #bfdbfe", borderRadius: 12, background: "#eff6ff", padding: 11, display: "grid", gap: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", flexWrap: "wrap" }}>
                <div>
                  <strong style={{ color: "#1d4ed8" }}>Plan Printing pricing</strong>
                  <div style={{ marginTop: 3, color: "#475467", fontSize: 12 }}>Use the customer&apos;s MYOB A–F item price matrix as the finished sell price. PM material/ink costing remains available internally for production reference.</div>
                </div>
                <span style={{ borderRadius: 999, background: planPricingMode === "myob_matrix" ? "#dcfae6" : "#f2f4f7", color: planPricingMode === "myob_matrix" ? "#067647" : "#475467", padding: "5px 9px", fontSize: 11, fontWeight: 900 }}>
                  {planPricingMode === "myob_matrix" ? "MYOB matrix" : "PM calculated"}
                </span>
              </div>
              <div style={compactGrid}>
                <label style={{ display: "grid", gap: 6 }}>
                  <b>Pricing source</b>
                  <select value={planPricingMode} onChange={(event) => { const nextMode = event.target.value as PlanPricingMode; setPlanPricingMode(nextMode); if (nextMode === "myob_matrix") setPlanMatrixSelectionTouched(false); changed(); }} style={inputStyle}>
                    <option value="myob_matrix">MYOB item price matrix</option>
                    <option value="pm_calculated">Production Manager calculated</option>
                  </select>
                </label>
                {planPricingMode === "myob_matrix" ? (
                  <label style={{ display: "grid", gap: 6 }}>
                    <b>MYOB price item</b>
                    <select value={planMyobItemId} onChange={(event) => { setPlanMyobItemId(event.target.value); setPlanMatrixSelectionTouched(true); changed(); }} style={inputStyle}>
                      <option value="">Choose MYOB item</option>
                      {sortedPlanMatrixItems.map((item) => <option key={item.id} value={item.id}>{matrixItemLabel(item)}</option>)}
                    </select>
                    {currentPlanSizeCode || smallPrintColour ? <small style={{ color: "#64748b" }}>Best matches are sorted first for {currentPlanSizeCode || "the selected size"}{smallPrintColour ? ` · ${smallPrintColour === "mono" ? "Mono" : "Colour"}` : ""}.</small> : null}
                  </label>
                ) : null}
              </div>
              {planPricingMode === "myob_matrix" ? (
                selectedPlanMatrixItem && selectedPlanMatrixPrice ? (
                  <div style={{ borderRadius: 10, border: "1px solid #86efac", background: "#f0fdf4", color: "#166534", padding: "9px 10px", fontSize: 12, lineHeight: 1.5 }}>
                    <strong>{pricingSettings?.priceLevelName || pricingSettings?.priceLevelCode || "Level A"}</strong> · {myobMatrixTierLabel(activePlanPriceMatrix, selectedPlanMatrixPrice.quantityOver)} · <strong>{money(selectedPlanMatrixPrice.unitPrice)} ea</strong> × {usage(quantityNumber)} = <strong>{money(selectedPlanMatrixPrice.unitPrice * quantityNumber)}</strong>{manualQuoteDiscountPercent > 0 ? ` before ${manualQuoteDiscountPercent}% quote discount` : ""}.
                    {preserveSavedPlanMatrix ? <><br />Using the matrix snapshot saved with this quote line. <button type="button" onClick={() => { setPlanMatrixSelectionTouched(true); changed(); }} style={{ border: 0, background: "transparent", color: "#155eef", fontWeight: 900, padding: 0, cursor: "pointer", textDecoration: "underline" }}>Use latest synced MYOB matrix</button></> : selectedPlanMatrixItem.myobPriceMatrixSyncedAt ? <><br />Matrix synced {new Date(selectedPlanMatrixItem.myobPriceMatrixSyncedAt).toLocaleString("en-AU")}.</> : null}
                  </div>
                ) : selectedPlanMatrixItem ? (
                  <div style={{ borderRadius: 10, border: "1px solid #fecaca", background: "#fff5f4", color: "#b42318", padding: "9px 10px", fontSize: 12 }}>This MYOB item has no usable {pricingSettings?.priceLevelName || pricingSettings?.priceLevelCode || "Level A"} price for quantity {usage(quantityNumber)}. Check the MYOB Item Price Matrix and sync again, or choose another item.</div>
                ) : planMatrixItemPool.length ? (
                  <div style={{ borderRadius: 10, border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412", padding: "9px 10px", fontSize: 12 }}>Choose the MYOB item that represents this plan-printing option. The correct A–F price and quantity break will be selected automatically.</div>
                ) : (
                  <div style={{ borderRadius: 10, border: "1px solid #fecaca", background: "#fff5f4", color: "#b42318", padding: "9px 10px", fontSize: 12 }}>No MYOB plan-printing price matrices are available. Run the MYOB item import/sync, or temporarily choose <b>Production Manager calculated</b>.</div>
                )
              ) : (
                <div style={{ color: "#64748b", fontSize: 12 }}>Fallback mode uses PM stock + print costing, markup/profit and the PM A–F factor. Use this only when a MYOB matrix item is not available.</div>
              )}
            </div>
          ) : null}
          <label style={{ display: "grid", gap: 6 }}><b>Material / stock</b><select value={smallStockId} onChange={(event) => { setCustomSmallStockEnabled(false); setSmallStockId(event.target.value); changed(); }} style={inputStyle}><option value="">Choose stock</option>{departmentStocks.map((material) => <option key={material.id} value={material.id}>{internalMaterialName(material)}</option>)}</select></label>
          {customSmallStockEnabled ? <small style={{ color: "#b54708" }}>This line currently uses a custom stock. Choosing a library material will replace it.</small> : null}
        </div>
      );
    }

    if (compactStep === "small_print") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Print colour</b><select value={smallPrintColour} onChange={(event) => { setSmallPrintColour(event.target.value as SmallPrintColour); changed(); }} style={inputStyle}><option value="">Choose print</option><option value="mono">Mono</option><option value="cmyk">CMYK</option><option value="special">CMYK + special</option></select></label>{smallPrintColour ? <InlineLabourField label="Print labour" value={printSetupMinutes} basis={printSetupLabourBasis} onChange={(value) => { setPrintSetupMinutes(value); changed(); }} onBasisChange={(basis) => { setPrintSetupLabourBasis(basis); changed(); }} labourRate={printLabourRate} quantity={quantityNumber} automatic={printAutomaticLabour} /> : null}</div>;
    }

    if (compactStep === "small_coating") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Cello / coating</b><select value={smallCoatingId} onChange={(event) => { setSmallCoatingId(event.target.value); changed(); }} style={inputStyle}><option value="">Choose coating</option><option value="none">None</option>{laminateMaterials.map((material) => <option key={material.id} value={material.id}>{internalMaterialName(material)}</option>)}</select></label>{smallCoatingId && smallCoatingId !== "none" ? <InlineLabourField label="Coating labour" value={laminateMinutes} basis={laminateLabourBasis} onChange={(value) => { setLaminateMinutes(value); changed(); }} onBasisChange={(basis) => { setLaminateLabourBasis(basis); changed(); }} labourRate={laminateLabourRate} quantity={quantityNumber} automatic={laminateAutomaticLabour} /> : null}</div>;
    }

    if (compactStep === "small_finishing") {
      return <div style={compactPanel}><div style={checkGrid}>{smallFinishingOptions.map((item) => <label key={item.key} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 850 }}><input type="checkbox" checked={smallFinishings.includes(item.key)} onChange={() => { toggleSmallFinishing(item.key); changed(); }} /><span>{item.label}</span></label>)}</div><SelectedLabourMinutes options={smallFinishingOptions} selected={smallFinishings} values={smallFinishingMinutes} bases={smallFinishingLabourBasis} onChange={(value) => { setSmallFinishingMinutes(value); changed(); }} onBasesChange={(value) => { setSmallFinishingLabourBasis(value); changed(); }} defaultBasis={smallFinishingDefaultBasis} labourRate={labourRate} labourRatesByKey={smallFinishingLabourRates} automaticByKey={smallFinishingAutomaticLabour} quantity={quantityNumber} /></div>;
    }

    if (compactStep === "quantity" || compactStep === "small_quantity") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6, maxWidth: 360 }}><b>Quantity</b><input value={quantity} onChange={(event) => { setQuantity(event.target.value); changed(); }} type="number" min="1" step="any" autoFocus={presentation === "wizard"} placeholder="Enter quantity" style={inputStyle} /><small style={{ color: "#64748b" }}>This quantity drives stock usage, labour, MYOB quantity breaks and the final line total.</small></label></div>;
    }

    if (compactStep === "review") {
      return <div style={compactPanel}><label style={{ display: "grid", gap: 6 }}><b>Internal line notes (optional)</b><textarea value={lineNotes} onChange={(event) => setLineNotes(event.target.value)} style={textareaStyle} /></label></div>;
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
      return (
        <div style={{ ...compactPanel, gap: 10 }}>
          <div style={{ color: "#475467", fontSize: 12 }}>Select saved Materials marked “Show as installation option”, or use Custom allowance for an ad-hoc item. Quantities are totals for the complete install line and their costs are included before markup, profit and client price level.</div>
          {visibleServiceFixingOptions.map((item) => {
            const selected = serviceFixings.includes(item.key);
            const qty = numberValue(serviceFixingQty[item.key], 0);
            const rate = resolvedServiceFixingRate(item.key);
            const linkedMaterial = item.material ?? serviceFixingMaterialForKey(item.key, materialPool);
            const linkedRate = linkedMaterial ? installationMaterialRate(linkedMaterial) : null;
            return (
              <div key={item.key} style={{ border: "1px solid #dbeafe", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 850 }}>
                  <input type="checkbox" checked={selected} onChange={() => { toggleServiceFixing(item.key); changed(); }} />
                  {item.label}
                </label>
                {selected ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                    {item.key === "other" ? (
                      <label style={{ display: "grid", gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#475467" }}>Custom allowance title</span>
                        <input value={otherConsumableTitle} onChange={(event) => { setOtherConsumableTitle(event.target.value); changed(); }} placeholder="eg Rags, cleaner" style={inputStyle} />
                      </label>
                    ) : null}
                    <label style={{ display: "grid", gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#475467" }}>Allowed qty ({item.unit})</span>
                      <input value={serviceFixingQty[item.key] ?? ""} onChange={(event) => { setServiceFixingQty({ ...serviceFixingQty, [item.key]: event.target.value }); changed(); }} placeholder={item.placeholderQty} type="number" min="0" step="0.01" style={inputStyle} />
                    </label>
                    <label style={{ display: "grid", gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#475467" }}>Cost / {item.unit} ($)</span>
                      <input value={serviceFixingRate[item.key] ?? ""} onChange={(event) => { setServiceFixingRate({ ...serviceFixingRate, [item.key]: event.target.value }); changed(); }} placeholder={linkedMaterial ? `Auto ${money(rate)}` : item.placeholderRate} type="number" min="0" step="0.01" style={inputStyle} />
                      <small style={{ color: linkedMaterial ? "#047857" : "#64748b" }}>{linkedMaterial ? `Saved material: ${linkedMaterial.name} at ${money(linkedRate?.rate ?? rate)}/${item.unit}${linkedRate?.note ? ` · ${linkedRate.note}` : ""}. Enter a rate only to override it.` : item.key === "other" ? "Use this only for an ad-hoc allowance that is not worth saving as a material." : "Legacy quote item. Enter a rate if the old saved material can no longer be found."}</small>
                    </label>
                    <div style={{ display: "grid", alignContent: "end", minHeight: 42, fontSize: 12, color: "#475467", fontWeight: 800 }}>Allowance cost: {money(qty * rate)}</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      );
    }

    if (compactStep === "component_details") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Component name</b><input value={componentName} onChange={(event) => { setComponentName(event.target.value); changed(); }} style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Description</b><textarea value={componentDescription} onChange={(event) => { setComponentDescription(event.target.value); changed(); }} style={textareaStyle} /></label></div></div>;
    }

    if (compactStep === "component_parts") {
      return <div style={compactPanel}>{componentParts.map((part, index) => <div key={part.id} style={{ border: "1px solid #fed7aa", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>Part {index + 1}</b><button type="button" onClick={() => removeComponentPart(part.id)} style={{ ...ghostButton, color: "#b42318", minHeight: 32 }}>Remove</button></div><div style={compactGrid}><select value={part.materialId} onChange={(event) => { const material = materialPool.find((item) => item.id === event.target.value); updateComponentPart(part.id, { materialId: event.target.value, name: part.name.trim() || material?.name || "", unit: material ? (isRollMaterial(material) ? "lm" : isSheetMaterial(material) ? "sheet" : "each") : part.unit }); changed(); }} style={inputStyle}><option value="">Custom part</option>{materialPool.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select><input value={part.name} onChange={(event) => { updateComponentPart(part.id, { name: event.target.value }); changed(); }} placeholder="Part name" style={inputStyle} /><input value={part.qty} onChange={(event) => { updateComponentPart(part.id, { qty: event.target.value }); changed(); }} placeholder="Qty" type="number" min="0" step="0.01" style={inputStyle} /><select value={part.unit} onChange={(event) => { updateComponentPart(part.id, { unit: event.target.value }); changed(); }} style={inputStyle}><option value="each">each</option><option value="lm">lm</option><option value="sheet">sheet</option><option value="sqm">sqm</option><option value="pack">pack</option></select><input value={part.unitCost} onChange={(event) => { updateComponentPart(part.id, { unitCost: event.target.value }); changed(); }} placeholder="Cost/unit" type="number" min="0" step="0.01" style={inputStyle} /></div></div>)}<button type="button" onClick={addComponentPart} style={ghostButton}>+ Add part</button></div>;
    }

    if (compactStep === "component_labour") {
      return <div style={compactPanel}><div style={compactGrid}><label style={{ display: "grid", gap: 6 }}><b>Labour label</b><input value={componentLabourLabel} onChange={(event) => { setComponentLabourLabel(event.target.value); changed(); }} style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Labour minutes</b><input value={componentLabourMinutes} onChange={(event) => { setComponentLabourMinutes(event.target.value); changed(); }} type="number" min="0" step="0.01" style={inputStyle} /></label></div></div>;
    }

    return <div style={compactPanel}><span style={{ color: "#64748b" }}>This component is stored in the structured quote snapshot and can be updated here.</span></div>;
  }


  function wizardIllustration(kind: string) {
    const common = { width: "100%", height: "100%", display: "block" } as const;
    const bg = "#f8fafc";
    const line = "#cbd5e1";
    const dark = "#0f172a";
    const blue = "#2563eb";
    const teal = "#0891b2";
    const purple = "#7c3aed";

    const approvedWizardAssets: Record<string, string> = {
      signage: "/quote-wizard/flow-signage.png",
      small_format: "/quote-wizard/flow-small-format.png",
      plan_printing: "/quote-wizard/flow-plan-printing.png",
      poster_printing: "/quote-wizard/flow-poster-printing.png",
      service: "/quote-wizard/flow-service.png",
      pickup: "/quote-wizard/flow-service.png",
      delivery: "/quote-wizard/flow-service.png",
      install: "/quote-wizard/flow-service.png",
      access_equipment: "/quote-wizard/service-access-equipment.webp",
      component: "/quote-wizard/flow-component.png",
      acrylic: "/quote-wizard/material-acrylic-clear.webp",
      acrylic_clear: "/quote-wizard/material-acrylic-clear.webp",
      acrylic_white: "/quote-wizard/material-acrylic-white.webp",
      acrylic_black: "/quote-wizard/material-acrylic-black.webp",
      acm: "/quote-wizard/material-acm-silver.webp",
      acm_silver: "/quote-wizard/material-acm-silver.webp",
      acm_black: "/quote-wizard/material-acm-black.webp",
      corflute: "/quote-wizard/material-corflute-white.webp",
      corflute_white: "/quote-wizard/material-corflute-white.webp",
      corflute_black: "/quote-wizard/material-corflute-black.webp",
      pvc: "/quote-wizard/material-pvc-white.webp",
      pvc_white: "/quote-wizard/material-pvc-white.webp",
      pvc_black: "/quote-wizard/material-pvc-black.webp",
      banner: "/quote-wizard/material-vinyl-white.webp",
      banner_white: "/quote-wizard/material-vinyl-white.webp",
      banner_black: "/quote-wizard/material-vinyl-black.webp",
      other_sheet: "/quote-wizard/base-other-sheet.png",
      artwork_supplied: "/quote-wizard/artwork-supplied.png",
      artwork_required: "/quote-wizard/artwork-required.png",
      no_print: "/quote-wizard/print-no-print.webp",
      direct_print: "/quote-wizard/print-direct.webp",
      roll_stock: "/quote-wizard/print-roll-stock.webp",
      cut_vinyl: "/quote-wizard/print-cut-vinyl.webp"
    };
    const approvedAsset = categoryImages[kind] || approvedWizardAssets[kind];
    if (approvedAsset) {
      return <img src={approvedAsset} alt="" aria-hidden="true" style={{ width: "100%", height: "100%", display: "block", objectFit: "contain", objectPosition: "center", background: "#f8fafc" }} />;
    }

    if (kind === "signage") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><rect x="30" y="17" width="180" height="66" rx="5" fill={blue}/><path d="M30 60 L82 17 H121 L70 83 H30Z" fill="#38bdf8" opacity=".8"/><path d="M120 17 L177 83 H210V58L170 17Z" fill={purple} opacity=".75"/><rect x="55" y="88" width="8" height="24" rx="2" fill={dark}/><rect x="177" y="88" width="8" height="24" rx="2" fill={dark}/><rect x="45" y="108" width="150" height="6" rx="3" fill="#94a3b8"/><text x="120" y="50" textAnchor="middle" fontSize="16" fontWeight="800" fill="white">SIGNS</text><text x="120" y="69" textAnchor="middle" fontSize="9" fontWeight="700" fill="white">MAKE AN IMPACT</text></svg>;
    if (kind === "small_format") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><g transform="translate(45 22) rotate(-7 75 40)"><rect x="8" y="18" width="145" height="68" rx="6" fill="#cbd5e1"/><rect x="4" y="10" width="145" height="68" rx="6" fill="#fff" stroke={line}/><rect width="145" height="68" rx="6" fill="#fff" stroke={line}/><rect width="145" height="15" rx="6" fill={purple}/><path d="M0 38 L55 0 H88 L28 68 H0Z" fill="#ec4899" opacity=".9"/><text x="95" y="38" textAnchor="middle" fontSize="8" fontWeight="800" fill={dark}>PRINT</text><text x="95" y="49" textAnchor="middle" fontSize="7" fill="#64748b">BUSINESS CARDS</text></g></svg>;
    if (kind === "plan_printing") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><g stroke="#64748b" strokeWidth="2" fill="#fff"><ellipse cx="70" cy="77" rx="34" ry="16"/><rect x="70" y="61" width="105" height="32"/><ellipse cx="175" cy="77" rx="34" ry="16"/><ellipse cx="95" cy="51" rx="28" ry="13"/><rect x="95" y="38" width="75" height="26"/><ellipse cx="170" cy="51" rx="28" ry="13"/></g><path d="M83 72h74M93 82h54M110 47h45" stroke={blue} strokeWidth="2" opacity=".7"/></svg>;
    if (kind === "poster_printing") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><path d="M74 14h92l18 98H56z" fill="#1e293b"/><rect x="68" y="24" width="104" height="67" rx="3" fill={purple}/><path d="M68 65l36-41h28L92 91H68z" fill="#06b6d4" opacity=".8"/><text x="120" y="55" textAnchor="middle" fontSize="14" fontWeight="900" fill="white">EVENT</text><text x="120" y="72" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">TODAY</text></svg>;
    if (kind === "service") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><path d="M35 40h118l35 25h17v31H35z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2"/><path d="M153 40v30h52l-35-30z" fill="#dbeafe"/><path d="M55 54h74v12H55z" fill={dark}/><path d="M55 70h94v8H55z" fill={blue}/><path d="M80 78h88v9H80z" fill={teal}/><circle cx="73" cy="98" r="13" fill={dark}/><circle cx="178" cy="98" r="13" fill={dark}/><circle cx="73" cy="98" r="5" fill="#cbd5e1"/><circle cx="178" cy="98" r="5" fill="#cbd5e1"/><text x="92" y="63" textAnchor="middle" fontSize="8" fontWeight="900" fill="white">SIGNS</text></svg>;
    if (kind === "component") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><g transform="translate(35 28)"><path d="M0 18L32 0h145l-31 18z" fill="#e2e8f0" stroke="#94a3b8"/><path d="M0 18v52h146V18z" fill="#cbd5e1" stroke="#94a3b8"/><path d="M27 18v35h22V18M74 18v52M103 18v30h18V18" fill="none" stroke="#64748b" strokeWidth="4"/><path d="M146 18l31-18v50l-31 20z" fill="#94a3b8"/></g></svg>;

    if (kind === "acrylic") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><path d="M48 78L83 31h116l-35 47z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="2" opacity=".75"/><path d="M48 78l8 10h116l-8-10z" fill="#bae6fd" opacity=".9"/><path d="M83 31l8 10h116l-8-10z" fill="#f0f9ff" opacity=".9"/></svg>;
    if (kind === "acm") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><path d="M45 70L82 28h120l-37 42z" fill="#e5e7eb" stroke="#94a3b8"/><path d="M45 70l8 14h120l-8-14z" fill="#111827"/><path d="M53 84l5 8h120l-5-8z" fill="#d1d5db"/><path d="M82 28l6 9h120l-6-9z" fill="#f8fafc"/></svg>;
    if (kind === "corflute") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><path d="M42 70L80 28h126l-38 42z" fill="#fff" stroke={line}/><path d="M42 70l8 24h126l-8-24z" fill="#f8fafc" stroke={line}/>{Array.from({length:14}).map((_,i)=><path key={i} d={`M${52+i*9} 72v20`} stroke="#94a3b8" strokeWidth="2"/>)}<path d="M80 28l7 8h126l-7-8z" fill="#fff" stroke="#e2e8f0"/></svg>;
    if (kind === "pvc") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><path d="M43 66L82 29h126l-39 37z" fill="#fff" stroke="#e2e8f0"/><path d="M43 66l10 27h126l-10-27z" fill="#f1f5f9" stroke="#dbe3ee"/><circle cx="63" cy="78" r="2" fill="#cbd5e1"/><circle cx="83" cy="86" r="2" fill="#cbd5e1"/><circle cx="110" cy="77" r="2" fill="#cbd5e1"/></svg>;
    if (kind === "banner") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><ellipse cx="126" cy="62" rx="65" ry="33" fill="#e2e8f0" stroke="#94a3b8"/><ellipse cx="126" cy="62" rx="27" ry="33" fill="#cbd5e1"/><ellipse cx="126" cy="62" rx="15" ry="22" fill="#b45309"/><path d="M61 62c0-18 29-33 65-33h55c-36 0-65 15-65 33s29 33 65 33h-55c-36 0-65-15-65-33z" fill="#f8fafc" opacity=".95"/></svg>;
    if (kind === "other_sheet") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><path d="M42 76L78 36h124l-36 40z" fill="#fef3c7" stroke="#d6b66b"/><path d="M47 83L83 43h124l-36 40z" fill="#e2e8f0" stroke="#94a3b8"/><path d="M52 90L88 50h124l-36 40z" fill="#334155" stroke="#1e293b"/></svg>;

    if (kind === "artwork_supplied") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><path d="M73 18h62l26 25v58H73z" fill="#eff6ff" stroke="#60a5fa" strokeWidth="2"/><path d="M135 18v25h26" fill="#dbeafe" stroke="#60a5fa" strokeWidth="2"/><path d="M91 57h48M91 69h41M91 81h35" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round"/><circle cx="165" cy="82" r="27" fill="#22c55e"/><path d="M151 82l9 9 18-21" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    if (kind === "artwork_required") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><rect x="49" y="25" width="120" height="72" rx="8" fill="#cbd5e1"/><rect x="58" y="34" width="102" height="51" rx="4" fill="#eff6ff"/><path d="M58 76l25-20 19 14 14-10 44 25H58z" fill="#60a5fa"/><path d="M102 97h15v11H88h45" stroke="#64748b" strokeWidth="5" strokeLinecap="round"/><g transform="translate(153 41) rotate(42)"><rect width="18" height="58" rx="6" fill="#facc15"/><path d="M0 10h18" stroke="#0f172a" strokeWidth="5"/><path d="M0 52l9 13 9-13" fill="#f1c27d"/><path d="M6 60l3 5 3-5" fill="#0f172a"/></g></svg>;

    if (kind === "direct_print") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><rect x="44" y="47" width="152" height="40" rx="8" fill="#334155"/><rect x="62" y="24" width="116" height="38" rx="4" fill="#fff" stroke={line}/><path d="M80 31h80v5H80z" fill={blue}/><path d="M75 80h90v25H75z" fill="#f8fafc" stroke={line}/><circle cx="177" cy="66" r="5" fill="#22c55e"/></svg>;
    if (kind === "roll_stock") return wizardIllustration("banner");
    if (kind === "cut_vinyl") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><circle cx="99" cy="60" r="33" fill="#e2e8f0" stroke="#94a3b8"/><circle cx="99" cy="60" r="14" fill="#64748b"/><path d="M121 31h66v58h-66" fill="#fff" stroke={line}/><path d="M139 45l30 30M169 45l-30 30" stroke={purple} strokeWidth="5"/></svg>;
    if (kind === "no_print") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><circle cx="120" cy="60" r="38" fill="#fff" stroke="#94a3b8" strokeWidth="3"/><path d="M93 33l54 54" stroke="#ef4444" strokeWidth="7" strokeLinecap="round"/></svg>;

    if (kind === "single") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><rect x="56" y="29" width="128" height="72" rx="6" fill="#fff" stroke="#94a3b8" strokeWidth="2"/><rect x="67" y="40" width="106" height="50" rx="4" fill="#dbeafe"/><path d="M77 80l26-24 20 16 15-11 30 29H77z" fill="#60a5fa"/></svg>;
    if (kind === "double") return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><rect x="45" y="36" width="120" height="66" rx="6" fill="#fff" stroke="#94a3b8"/><rect x="75" y="18" width="120" height="66" rx="6" fill="#eff6ff" stroke={blue} strokeWidth="2"/><path d="M92 68l21-19 17 14 14-10 34 31H92z" fill="#60a5fa"/></svg>;

    return <svg viewBox="0 0 240 120" aria-hidden="true" style={common}><rect width="240" height="120" rx="14" fill={bg}/><rect x="55" y="26" width="130" height="68" rx="8" fill="#fff" stroke={line}/><path d="M76 47h88M76 60h70M76 73h82" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round"/></svg>;
  }

  function renderWizardStep(step: QuickQuoteStep) {
    const tileGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 } as const;
    const photoGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 240px))", gap: 14, justifyContent: "start" } as const;
    const tile = (selected: boolean, compact = false) => ({
      position: "relative" as const,
      minHeight: compact ? 178 : 210,
      borderRadius: 16,
      border: selected ? "2px solid #2563eb" : "1px solid #d7e0ea",
      background: selected ? "linear-gradient(180deg,#f6faff 0%,#ffffff 100%)" : "#fff",
      boxShadow: selected ? "0 10px 26px rgba(37,99,235,.14)" : "0 7px 18px rgba(15,23,42,.05)",
      padding: 10,
      display: "grid",
      gridTemplateRows: "minmax(108px, 1fr) auto",
      alignItems: "stretch",
      textAlign: "left" as const,
      gap: 10,
      cursor: "pointer",
      overflow: "hidden"
    });
    const imageOnlyTile = (selected: boolean) => ({
      position: "relative" as const,
      width: "100%",
      aspectRatio: "1 / 1",
      minHeight: 0,
      borderRadius: 16,
      border: selected ? "2px solid #2563eb" : "1px solid #d7e0ea",
      background: selected ? "linear-gradient(180deg,#f6faff 0%,#ffffff 100%)" : "#fff",
      boxShadow: selected ? "0 10px 26px rgba(37,99,235,.14)" : "0 7px 18px rgba(15,23,42,.05)",
      padding: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      overflow: "hidden",
      boxSizing: "border-box" as const
    });
    const artworkTile = (selected: boolean) => ({
      position: "relative" as const,
      minHeight: 210,
      borderRadius: 16,
      border: selected ? "2px solid #2563eb" : "1px solid #d7e0ea",
      background: selected ? "linear-gradient(180deg,#f6faff 0%,#ffffff 100%)" : "#fff",
      boxShadow: selected ? "0 10px 26px rgba(37,99,235,.14)" : "0 7px 18px rgba(15,23,42,.05)",
      padding: 14,
      display: "grid",
      alignContent: "center",
      justifyItems: "center",
      textAlign: "center" as const,
      gap: 8,
      cursor: "pointer"
    });
    const selectedMark = (selected: boolean) => selected ? <span aria-hidden="true" style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 999, background: "#2563eb", color: "#fff", display: "grid", placeItems: "center", fontSize: 17, fontWeight: 950, boxShadow: "0 4px 12px rgba(37,99,235,.28)", zIndex: 2 }}>✓</span> : null;
    const visual = (kind: string) => <div style={{ borderRadius: 11, overflow: "hidden", background: "#f8fafc", minHeight: 108, display: "grid", placeItems: "center" }}>{wizardIllustration(kind)}</div>;
    const materialVisual = (material: QuoteMaterial, fallbackKind: BaseType | "other_sheet") => {
      const base = fallbackKind === "other_sheet" ? "other_sheet" : fallbackKind;
      const directImage = material.quoteImageUrl || categoryImages[base];
      if (directImage) {
        return <div style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, borderRadius: 11, background: "#eef2f6", overflow: "hidden" }}>
          <img src={directImage} alt="" aria-hidden="true" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, objectFit: "cover", objectPosition: "center", display: "block" }} />
        </div>;
      }
      const text = `${material.name} ${material.customerFacingName ?? ""} ${material.materialType ?? ""} ${material.materialGroup ?? ""}`.toLowerCase();
      const has = (value: string) => text.includes(value);
      let kind: string = base;
      let tint: string | null = null;

      if (base === "acrylic") {
        if (has("black")) kind = "acrylic_black";
        else if (has("clear")) kind = "acrylic_clear";
        else if (has("white") || has("opal")) kind = "acrylic_white";
      } else if (base === "acm") {
        if (has("black")) kind = "acm_black";
        else if (has("silver") || has("brushed") || has("aluminium") || has("aluminum")) kind = "acm_silver";
      } else if (base === "corflute") {
        if (has("black")) kind = "corflute_black";
        else if (has("white")) kind = "corflute_white";
      } else if (base === "pvc") {
        if (has("black")) kind = "pvc_black";
        else if (has("white")) kind = "pvc_white";
      } else if (base === "banner") {
        if (has("black")) kind = "banner_black";
        else if (has("white")) kind = "banner_white";
      }

      const namedColours: Array<[string, string]> = [
        ["red", "#dc2626"], ["blue", "#2563eb"], ["navy", "#1e3a8a"], ["green", "#16a34a"],
        ["yellow", "#eab308"], ["orange", "#ea580c"], ["purple", "#7c3aed"], ["violet", "#7c3aed"],
        ["pink", "#ec4899"], ["magenta", "#d946ef"], ["cyan", "#06b6d4"], ["teal", "#0d9488"],
        ["grey", "#64748b"], ["gray", "#64748b"], ["gold", "#ca8a04"], ["brown", "#92400e"], ["cream", "#f5e6c8"]
      ];
      if (!["acrylic_black", "acrylic_white", "acm_black", "acm_silver", "corflute_black", "corflute_white", "pvc_black", "pvc_white", "banner_black", "banner_white"].includes(kind)) {
        const match = namedColours.find(([name]) => has(name));
        if (match && base !== "other_sheet") tint = match[1];
      }

      return <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 11, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 8, boxSizing: "border-box" }}>
        {wizardIllustration(kind)}
        {tint ? <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: tint, opacity: 0.42, mixBlendMode: "multiply", pointerEvents: "none" }} /> : null}
      </div>;
    };
    const changed = () => setUnitPriceOverridden(false);

    if (step === "flow") {
      const choices: Array<[FlowType, string, string]> = [
        ["signage", "Large format / signage", "signage"],
        ["small_format", "Small format / print", "small_format"],
        ["plan_printing", "Plan printing", "plan_printing"],
        ["poster_printing", "Poster printing", "poster_printing"],
        ["service", "Pickup / delivery / install", "service"],
        ["component", "Custom component / assembly", "component"]
      ];
      return <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>{choices.map(([value,label,kind]) => {
        const selected = flowType === value;
        return <button key={value} type="button" onClick={() => { setFlowType(value); changed(); }} style={tile(selected, true)}>{selectedMark(selected)}{visual(kind)}<strong style={{ fontSize: 15, lineHeight: 1.2, textAlign: "center" }}>{label}</strong></button>;
      })}</div>;
    }

    if (step === "base") {
      return <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>{baseTypes.map((item) => {
        const selected = baseType === item.key;
        return <button key={item.key} type="button" onClick={() => { setBaseType(item.key as BaseType); setThickness(""); setColour(""); setMainMaterialChoiceId(""); setMediaId(""); changed(); }} style={tile(selected, true)}>{selectedMark(selected)}{visual(item.key)}<strong style={{ fontSize: 16, lineHeight: 1.2, textAlign: "center" }}>{item.label}</strong></button>;
      })}</div>;
    }

    if (step === "thickness" || step === "colour") {
      return <div style={photoGrid}>{baseMaterialGroups.map((group) => {
        const material = group.representative;
        const selected = selectedMainMaterialGroup?.key === group.key;
        return <button key={group.key} type="button" aria-label={group.label} title={group.label} onClick={() => { setMainMaterialChoiceId(material.id); if (baseType === "banner") setMediaId(material.id); setThickness(thicknessFor(material)); setColour(colourFor(material)); changed(); }} style={imageOnlyTile(selected)}>{selectedMark(selected)}{materialVisual(material, baseType || "other_sheet")}</button>;
      })}</div>;
    }

    if (step === "artwork") {
      return <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
        <button type="button" onClick={() => { setArtworkChoice("client_supplied"); changed(); }} style={artworkTile(artworkChoice === "client_supplied")}>{selectedMark(artworkChoice === "client_supplied")}<div style={{ width: "100%", maxWidth: 280, height: 118 }}>{wizardIllustration("artwork_supplied")}</div><strong style={{ fontSize: 16 }}>Print-ready artwork supplied</strong><span style={{ color: "#64748b", fontSize: 12 }}>No artwork/setup allowance</span></button>
        <button type="button" onClick={() => { setArtworkChoice("required"); changed(); }} style={artworkTile(artworkChoice === "required")}>{selectedMark(artworkChoice === "required")}<div style={{ width: "100%", maxWidth: 280, height: 118 }}>{wizardIllustration("artwork_required")}</div><strong style={{ fontSize: 16 }}>Artwork / setup required</strong><span style={{ color: "#64748b", fontSize: 12 }}>Add artwork time before continuing</span></button>
        {artworkChoice === "required" ? <label style={{ gridColumn: "1 / -1", display: "grid", gap: 6, maxWidth: 360 }}><b>Artwork minutes</b><input value={artworkMinutes} onChange={(event) => { setArtworkMinutes(event.target.value); changed(); }} type="number" min="0" step="0.01" style={inputStyle} /></label> : null}
      </div>;
    }

    if (step === "print" && !isRollStockBase) {
      return <div style={tileGrid}>{printMethods.map((item) => {
        const selected = printMethod === item.key;
        const kind = item.key === "no_print" ? "no_print" : item.key === "direct_print" ? "direct_print" : item.key === "roll_stock" ? "roll_stock" : "cut_vinyl";
        return <button key={item.key} type="button" onClick={() => { setPrintMethod(item.key as PrintMethod); setInk(""); setMediaId(""); setPrintDirection(""); setBackingId(""); changed(); }} style={tile(selected, true)}>{selectedMark(selected)}{visual(kind)}<strong style={{ fontSize: 15, textAlign: "center" }}>{item.label}</strong></button>;
      })}</div>;
    }

    if (step === "media") {
      return <div style={photoGrid}>{rollMedia.map((material) => {
        const selected = mediaId === material.id;
        return <button key={material.id} type="button" aria-label={internalMaterialName(material)} title={internalMaterialName(material)} onClick={() => { setMediaId(material.id); setPrintDirection(""); setBackingId(""); changed(); }} style={imageOnlyTile(selected)}>{selectedMark(selected)}{materialVisual(material, "banner")}</button>;
      })}</div>;
    }

    if (step === "ink") {
      return <div style={tileGrid}>{availableInkChoices.map((item) => {
        const selected = ink === item.key;
        return <button key={item.key} type="button" onClick={() => { setInk(item.key as InkChoice); changed(); }} style={{ ...artworkTile(selected), minHeight: 160 }}>{selectedMark(selected)}<div aria-hidden="true" style={{ display: "flex", gap: 7, alignItems: "center", justifyContent: "center", minHeight: 60 }}>{item.key === "none" ? <span style={{ fontSize: 46, color: "#94a3b8" }}>∅</span> : <><span style={{ width: 34, height: 34, borderRadius: 999, background: "#06b6d4" }}/><span style={{ width: 34, height: 34, borderRadius: 999, background: "#ec4899" }}/><span style={{ width: 34, height: 34, borderRadius: 999, background: "#facc15" }}/><span style={{ width: 34, height: 34, borderRadius: 999, background: "#111827" }}/></>}</div><strong style={{ fontSize: 16 }}>{item.label}</strong></button>;
      })}</div>;
    }

    const serviceChoiceGrid = (choices: typeof serviceTypes) => (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(choices.length, 4)}, minmax(0, 1fr))`, gap: 14 }}>
        {choices.map((item) => {
          const selected = serviceType === item.key;
          return <button key={item.key} type="button" onClick={() => { setServiceType(item.key); changed(); }} style={tile(selected, true)}>{selectedMark(selected)}{visual(item.key)}<strong style={{ fontSize: 16, lineHeight: 1.2, textAlign: "center" }}>{item.label}</strong></button>;
        })}
      </div>
    );

    const wizardServiceDetails = () => {
      if (!serviceType) return null;
      if (serviceType === "pickup") return <div style={{ border: "1px solid #dbeafe", borderRadius: 14, background: "#f8fbff", padding: 12, color: "#475467", fontSize: 13 }}>Client pickup selected. No delivery or installation charge will be added.</div>;
      if (serviceType === "delivery") return <div style={{ border: "1px solid #dbeafe", borderRadius: 14, background: "#f8fbff", padding: 12, display: "grid", gap: 10 }}><label style={{ display: "grid", gap: 6, maxWidth: 360 }}><b>Delivery charge ($)</b><input value={deliveryCharge} onChange={(event) => { setDeliveryCharge(event.target.value); changed(); }} placeholder="Dollar amount, eg 45.00" type="number" min="0" step="0.01" style={inputStyle} /></label></div>;
      if (serviceType === "install") return <div style={{ display: "grid", gap: 12 }}>
        <div style={{ border: "1px solid #dbeafe", borderRadius: 14, background: "#f8fbff", padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}><b>Installers</b><input value={installCrewSize} onChange={(event) => { setInstallCrewSize(event.target.value); changed(); }} type="number" min="1" step="1" style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 6 }}><b>Travel / call-out charge ($)</b><input value={travelCharge} onChange={(event) => { setTravelCharge(event.target.value); changed(); }} placeholder="Dollar amount, not minutes" type="number" min="0" step="0.01" style={inputStyle} /><small style={{ color: "#64748b" }}>Enter the total dollar charge once for this quote line.</small></label>
          </div>
          <InstallLabourField value={installMinutes} basis={installLabourBasis} crewSize={installCrewSize} quantity={quantityNumber} labourRate={labourRate} onChange={(value) => { setInstallMinutes(value); changed(); }} onBasisChange={(basis) => { setInstallLabourBasis(basis); changed(); }} />
        </div>
        <div style={{ border: "1px solid #bfdbfe", borderRadius: 14, background: "#eff6ff", padding: 12, display: "grid", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}><input type="checkbox" checked={accessEquipmentRequired} onChange={(event) => { setAccessEquipmentRequired(event.target.checked); changed(); }} />Is access equipment required?</label>
          {accessEquipmentRequired ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}><label style={{ display: "grid", gap: 6 }}><b>Type of equipment</b><input value={accessEquipmentType} onChange={(event) => { setAccessEquipmentType(event.target.value); changed(); }} placeholder="eg Scissor lift" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Daily charge ($)</b><input value={accessEquipmentDailyCharge} onChange={(event) => { setAccessEquipmentDailyCharge(event.target.value); changed(); }} placeholder="Equipment cost per day" type="number" min="0" step="0.01" style={inputStyle} /><small style={{ color: "#64748b" }}>Markup, profit and the client price level are applied automatically.</small></label><label style={{ display: "grid", gap: 6 }}><b>Number of days</b><input value={accessEquipmentDays} onChange={(event) => { setAccessEquipmentDays(event.target.value); changed(); }} type="number" min="1" step="1" style={inputStyle} /></label></div> : null}
        </div>
      </div>;
      return <div style={{ border: "1px solid #dbeafe", borderRadius: 14, background: "#f8fbff", padding: 12, display: "grid", gap: 10 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}><label style={{ display: "grid", gap: 6 }}><b>Type of equipment</b><input value={accessEquipmentType} onChange={(event) => { setAccessEquipmentType(event.target.value); changed(); }} placeholder="eg Scissor lift" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Daily charge ($)</b><input value={accessEquipmentDailyCharge} onChange={(event) => { setAccessEquipmentDailyCharge(event.target.value); changed(); }} placeholder="Equipment cost per day" type="number" min="0" step="0.01" style={inputStyle} /></label><label style={{ display: "grid", gap: 6 }}><b>Number of days</b><input value={accessEquipmentDays} onChange={(event) => { setAccessEquipmentDays(event.target.value); changed(); }} type="number" min="1" step="1" style={inputStyle} /></label></div></div>;
    };

    if (step === "service_type") {
      return serviceChoiceGrid(serviceTypes);
    }

    if (step === "service_details") {
      return wizardServiceDetails();
    }

    if (step === "dispatch") {
      return <div style={{ display: "grid", gap: 14 }}>{serviceChoiceGrid(dispatchServiceTypes)}{wizardServiceDetails()}</div>;
    }

    if (step === "sides" && !canChooseReversePrint) {
      return <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
        <button type="button" onClick={() => { setSides("single"); changed(); }} style={artworkTile(sides === "single")}>{selectedMark(sides === "single")}<div style={{ width: "100%", maxWidth: 280, height: 118 }}>{wizardIllustration("single")}</div><strong>Single sided</strong></button>
        <button type="button" onClick={() => { setSides("double"); changed(); }} style={artworkTile(sides === "double")}>{selectedMark(sides === "double")}<div style={{ width: "100%", maxWidth: 280, height: 118 }}>{wizardIllustration("double")}</div><strong>Double sided</strong></button>
      </div>;
    }

    if (step === "laminate") {
      return <div style={{ display: "grid", gap: 18 }}>
        {backingApplicable ? (
          <section style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ color: "#0f172a", fontSize: 16, fontWeight: 900 }}>Backing</div>
            </div>
            <div style={photoGrid}>
              <button type="button" onClick={() => { setBackingId("none"); changed(); }} style={tile(backingId === "none")}>{selectedMark(backingId === "none")}<div style={{ borderRadius: 11, overflow: "hidden", background: "#f8fafc", minHeight: 108, display: "grid", placeItems: "center" }}><span aria-hidden="true" style={{ width: 58, height: 58, borderRadius: 999, border: "2px dashed #cbd5e1", color: "#94a3b8", display: "grid", placeItems: "center", fontSize: 30, fontWeight: 900 }}>∅</span></div><div style={{ display: "grid", gap: 3 }}><strong style={{ fontSize: 15, lineHeight: 1.2 }}>No backing</strong><span style={{ color: "#64748b", fontSize: 12 }}>Printed face only</span></div></button>
              {backingGroups.map((group) => {
                const material = group.representative;
                const selected = backingId !== "none" && selectedBackingGroup?.key === group.key;
                return <button key={group.key} type="button" aria-label={group.label} title={group.label} onClick={() => { setBackingId(material.id); changed(); }} style={imageOnlyTile(selected)}>{selectedMark(selected)}{materialVisual(material, "banner")}</button>;
              })}
            </div>
          </section>
        ) : null}
        <section style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ color: "#0f172a", fontSize: 16, fontWeight: 900 }}>Laminate</div>
          </div>
          <div style={photoGrid}>
            <button type="button" onClick={() => { setLaminateId("none"); changed(); }} style={tile(laminateId === "none")}>{selectedMark(laminateId === "none")}<div style={{ borderRadius: 11, overflow: "hidden", background: "#f8fafc", minHeight: 108, display: "grid", placeItems: "center" }}><span aria-hidden="true" style={{ width: 58, height: 58, borderRadius: 999, border: "2px dashed #cbd5e1", color: "#94a3b8", display: "grid", placeItems: "center", fontSize: 30, fontWeight: 900 }}>∅</span></div><div style={{ display: "grid", gap: 3 }}><strong style={{ fontSize: 15, lineHeight: 1.2 }}>No laminate</strong><span style={{ color: "#64748b", fontSize: 12 }}>No protective overlaminate</span></div></button>
            {laminateMaterials.map((material) => {
              const selected = laminateId === material.id;
              return <button key={material.id} type="button" aria-label={internalMaterialName(material)} title={internalMaterialName(material)} onClick={() => { setLaminateId(material.id); changed(); }} style={imageOnlyTile(selected)}>{selectedMark(selected)}{materialVisual(material, "banner")}</button>;
            })}
          </div>
        </section>
        {printed && laminateId && laminateId !== "none" ? <div style={{ border: "1px solid #dbeafe", borderRadius: 14, background: "#f8fbff", padding: 12, display: "grid", gap: 10 }}><InlineLabourField label="Laminate labour" value={laminateMinutes} basis={laminateLabourBasis} onChange={(value) => { setLaminateMinutes(value); changed(); }} onBasisChange={(basis) => { setLaminateLabourBasis(basis); changed(); }} labourRate={laminateLabourRate} quantity={quantityNumber} automatic={laminateAutomaticLabour} /></div> : null}
      </div>;
    }

    if (step === "small_coating") {
      return <div style={{ display: "grid", gap: 10 }}>
        <div>
          <div style={{ color: "#0f172a", fontSize: 16, fontWeight: 900 }}>Cello / coating</div>
        </div>
        <div style={photoGrid}>
          <button type="button" onClick={() => { setSmallCoatingId("none"); changed(); }} style={tile(smallCoatingId === "none")}>{selectedMark(smallCoatingId === "none")}<div style={{ borderRadius: 11, overflow: "hidden", background: "#f8fafc", minHeight: 108, display: "grid", placeItems: "center" }}><span aria-hidden="true" style={{ width: 58, height: 58, borderRadius: 999, border: "2px dashed #cbd5e1", color: "#94a3b8", display: "grid", placeItems: "center", fontSize: 30, fontWeight: 900 }}>∅</span></div><div style={{ display: "grid", gap: 3 }}><strong style={{ fontSize: 15, lineHeight: 1.2 }}>No coating</strong><span style={{ color: "#64748b", fontSize: 12 }}>Leave uncoated</span></div></button>
          {laminateMaterials.map((material) => {
            const selected = smallCoatingId === material.id;
            return <button key={material.id} type="button" aria-label={internalMaterialName(material)} title={internalMaterialName(material)} onClick={() => { setSmallCoatingId(material.id); changed(); }} style={imageOnlyTile(selected)}>{selectedMark(selected)}{materialVisual(material, "banner")}</button>;
          })}
        </div>
        {smallCoatingId && smallCoatingId !== "none" ? <div style={{ border: "1px solid #dbeafe", borderRadius: 14, background: "#f8fbff", padding: 12, display: "grid", gap: 10 }}><InlineLabourField label="Coating labour" value={laminateMinutes} basis={laminateLabourBasis} onChange={(value) => { setLaminateMinutes(value); changed(); }} onBasisChange={(basis) => { setLaminateLabourBasis(basis); changed(); }} labourRate={laminateLabourRate} quantity={quantityNumber} automatic={laminateAutomaticLabour} /></div> : null}
      </div>;
    }

    return renderCompactStep(step);
  }

  const handleBuilderKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase();
    const isPlainEnter = event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;

    if (isPlainEnter && (tagName === "input" || tagName === "select")) {
      event.preventDefault();
    }
  };

  const handleBuilderSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || isSaving) return;

    const form = event.currentTarget;
    setSaveError("");
    setIsSaving(true);
    try {
      const saveStartedAt = performance.now();
      const result = await saveQuoteLineFastAction(new FormData(form));
      console.info("[quote-line-save-client]", {
        requestElapsedMs: Math.round(performance.now() - saveStartedAt),
        serverElapsedMs: result.serverElapsedMs,
        authElapsedMs: result.authElapsedMs,
        dbElapsedMs: result.dbElapsedMs
      });
      if (!result.ok) {
        setSaveError(result.error || "The quote line could not be saved.");
        return;
      }

      const details = form.closest("details") as HTMLDetailsElement | null;
      if (details) details.open = false;
      window.dispatchEvent(new CustomEvent("production-manager:quote-line-saved", { detail: result }));
      startRefresh(() => router.refresh());
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The quote line could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const allSignageSteps: QuickQuoteStep[] = flowType === "service"
      ? ["flow", "service_type", ...(serviceType === "access_equipment" ? [] : ["quantity" as QuickQuoteStep]), "service_details", ...(serviceType === "install" ? ["service_fixings" as QuickQuoteStep] : []), "review"]
      : flowType === "component"
        ? ["flow", "component_details", "quantity", "component_parts", "component_labour", "review"]
        : flowType === "small_format"
          ? ["flow", "small_type", ...(isDuplicateBook ? ["ncr_details" as QuickQuoteStep] : []), "small_stock", "small_size", "quantity", "artwork", "small_print", "small_sides", "small_coating", "small_finishing", "dispatch", ...(serviceType === "install" ? ["service_fixings" as QuickQuoteStep] : []), "review"]
          : flowType === "plan_printing"
            ? ["flow", "small_size", "quantity", "small_print", "small_stock", "artwork", "small_sides", "small_coating", "small_finishing", "dispatch", ...(serviceType === "install" ? ["service_fixings" as QuickQuoteStep] : []), "review"]
            : isPrintDepartment
              ? ["flow", "small_stock", "small_size", "quantity", "artwork", "small_print", "small_sides", "small_coating", "small_finishing", "dispatch", ...(serviceType === "install" ? ["service_fixings" as QuickQuoteStep] : []), "review"]
              : [
              "flow",
              "base",
              "thickness",
              "size",
              "quantity",
              "artwork",
              "print",
              ...(!isRollStockBase && needsMediaStep ? ["media" as QuickQuoteStep] : []),
              ...(needsInkStep ? ["ink" as QuickQuoteStep] : []),
              ...(printed ? ["sides" as QuickQuoteStep, "laminate" as QuickQuoteStep] : []),
              "finishing",
              "dispatch",
              ...(serviceType === "install" ? ["service_fixings" as QuickQuoteStep] : []),
              "review",
            ];
    const allStepLabels: Partial<Record<QuickQuoteStep, string>> = {
      flow: "Quote line type",
      base: "Sign type",
      thickness: "Substrate / material",
      size: "Finished size",
      quantity: "Quantity",
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
      small_quantity: "Quantity",
      service_type: "Service type",
      service_details: "Service details",
      service_fixings: "Fixings and consumables",
      component_details: "Component details",
      component_parts: "Materials and parts",
      component_labour: "Assembly labour",
      dispatch: "Pickup / delivery / install",
      review: "Internal notes",
    };
    return (
      <form data-production-manager-auto-refresh-protected="true" onSubmit={handleBuilderSubmit} onKeyDown={handleBuilderKeyDown} style={{ display: "grid", gap: 12 }}>
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
        {saveError ? <div role="alert" style={{ border: "1px solid #fca5a5", background: "#fff1f2", color: "#b42318", borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 850 }}>{saveError}</div> : null}

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ borderRadius: 14, background: "#eff6ff", border: "1px solid #bfdbfe", padding: "12px 14px" }}>
            <strong style={{ color: "#1d4ed8" }}>{presentation === "wizard" ? "Guided quote builder" : "Configure the complete quote line"}</strong>
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>{presentation === "wizard" ? "Choose one option at a time, then press Continue to confirm and move to the next step." : "Make every required selection below. Nothing is submitted until you press Save Quote Line. Live auto-refresh is paused while this editor is open so your unsaved selections are protected."}</div>
          </div>
          {machineCompatibilityIssues.length ? (
            <div style={{ borderRadius: 14, background: "#fff1f2", border: "1px solid #fecdd3", padding: "12px 14px", color: "#9f1239", display: "grid", gap: 4 }}>
              <strong>Machine width check</strong>
              {machineCompatibilityIssues.map((message) => <span key={message} style={{ fontSize: 12, lineHeight: 1.45 }}>{message}</span>)}
              <span style={{ fontSize: 12 }}>Change the stock/orientation, or update the machine Max width in Production Setup → Resources → Machines before saving this line.</span>
            </div>
          ) : null}
          {presentation === "wizard" ? (() => {
            const safeWizardIndex = Math.min(Math.max(0, wizardIndex), Math.max(0, allSignageSteps.length - 1));
            const step = allSignageSteps[safeWizardIndex];
            const stepComplete = step === "flow" ? Boolean(flowType) : step === "service_type" ? Boolean(serviceType) : step === "base" ? Boolean(baseType) : step === "thickness" || step === "colour" ? Boolean(selectedMainMaterial) : step === "size" || step === "small_size" ? width > 0 && height > 0 : step === "quantity" || step === "small_quantity" ? quoteQuantityEntered : step === "artwork" ? Boolean(artworkChoice) : step === "print" ? Boolean(resolvedPrintMethod) : step === "media" ? Boolean(mediaId) : step === "ink" ? Boolean(ink) : step === "sides" || step === "small_sides" ? Boolean(sides && (!canChooseReversePrint || !printed || printDirection)) : step === "laminate" ? Boolean((!backingApplicable || backingId) && (!printed || laminateId)) : step === "dispatch" ? dispatchComplete : true;
            const atLast = safeWizardIndex === allSignageSteps.length - 1;
            return <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><span style={{ color: "#2563eb", fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".06em" }}>Step {safeWizardIndex + 1} of {allSignageSteps.length}</span><span style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>{Math.round(((safeWizardIndex + 1) / allSignageSteps.length) * 100)}%</span></div>
                <div style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}><div style={{ height: "100%", width: `${((safeWizardIndex + 1) / allSignageSteps.length) * 100}%`, background: "linear-gradient(90deg,#2563eb,#7c3aed)", borderRadius: 999 }} /></div>
              </div>
              <section style={{ minHeight: 330, display: "grid", alignContent: "start", gap: 14 }}><div><div style={{ color: "#64748b", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".06em" }}>Build quote line</div><h2 style={{ margin: "3px 0 0", color: "#0f172a", fontSize: 26 }}>{allStepLabels[step] ?? step.replaceAll("_", " ")}</h2></div>{renderWizardStep(step)}</section>
              <div style={{ position: "sticky", bottom: 0, zIndex: 3, margin: "0 -18px -18px", padding: "12px 18px", borderTop: "1px solid #e2e8f0", background: "rgba(255,255,255,.97)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <button type="button" disabled={safeWizardIndex === 0} onClick={() => setWizardIndex((current) => Math.max(0, current - 1))} style={{ ...ghostButton, minHeight: 42, opacity: safeWizardIndex === 0 ? .4 : 1 }}>← Back</button>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}><strong style={{ color: "#0f172a" }}>{quoteQuantityEntered ? `${money(unitPrice)} each · Qty ${usage(quantityNumber)} · ${money(lineTotal)} total` : `${money(unitPrice)} each · Qty required`}</strong>{!atLast ? <button type="button" disabled={!stepComplete} onClick={() => setWizardIndex((current) => Math.min(allSignageSteps.length - 1, current + 1))} style={{ ...primaryButton, minHeight: 42, opacity: stepComplete ? 1 : .45, cursor: stepComplete ? "pointer" : "not-allowed" }}>Continue →</button> : <button type="submit" disabled={!canSave || isSaving} style={{ ...primaryButton, minHeight: 42, opacity: canSave && !isSaving ? 1 : .45, cursor: canSave && !isSaving ? "pointer" : "not-allowed" }}>{isSaving ? "Saving…" : canSave ? (editingLine ? "Save quote line" : "Add quote line") : "Complete required fields"}</button>}</div>
              </div>
            </div>;
          })() : allSignageSteps.map((step, index) => (
            <section key={step} style={{ display: "grid", gap: 7 }}>
              <strong style={{ color: "#344054", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>{index + 1}. {allStepLabels[step] ?? step.replaceAll("_", " ")}</strong>
              {renderCompactStep(step)}
            </section>
          ))}
        </div>

        <div style={{ display: presentation === "wizard" ? "none" : "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em" }}>Updated price</span>
            <strong>{money(unitPrice)} each · {money(lineTotal)} line total</strong>
            {canOverrideMarkup && flowType === "small_format" && !useMyobPlanPricing ? (
              <details style={{ marginTop: 4, color: "#475467", fontSize: 11 }}>
                <summary style={{ cursor: "pointer", fontWeight: 900 }}>
                  Manager costing · {money(rawCost)} cost each · {money(rawCost * quantityNumber)} line cost before pricing
                </summary>
                <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                  {costs.map((row, index) => (
                    <div key={`${row.label}-${index}`} style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                      <span>{row.label}{row.detail ? ` · ${row.detail}` : ""}</span>
                      <strong>{usage(row.amount)} {row.unit} × {money(row.rate)} = {money(row.cost)} / item</strong>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            {canOverrideMarkup ? (useMyobPlanPricing && selectedPlanMatrixPrice ? (
              <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>Markup is not applied to this line because MYOB matrix pricing is controlling the sell price.</span>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }} onClick={(event) => event.stopPropagation()}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 900, color: "#344054" }}>
                  Markup ×
                  <input
                    value={lineMarkupInput}
                    onChange={(event) => { setLineMarkupInput(event.target.value); setMarkupTouched(true); setUnitPriceOverridden(false); }}
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    aria-label="Line markup multiplier"
                    style={{ width: 76, minHeight: 34, borderRadius: 9, border: "1px solid #b9cdfc", padding: "0 9px", fontWeight: 900, background: "#fff" }}
                  />
                </label>
                <span style={{ color: Math.abs(lineMarkupMultiplier - lineStandardMarkupMultiplier) > 0.000001 ? "#9a3412" : "#667085", fontSize: 11, fontWeight: 850 }}>
                  {Math.abs(lineMarkupMultiplier - lineStandardMarkupMultiplier) > 0.000001 ? "Manager override" : `Standard ×${lineStandardMarkupMultiplier.toFixed(2)}`}
                </span>
                {Math.abs(lineMarkupMultiplier - lineStandardMarkupMultiplier) > 0.000001 ? (
                  <button type="button" onClick={() => { setLineMarkupInput(lineStandardMarkupMultiplier.toFixed(2)); setMarkupTouched(false); setUnitPriceOverridden(false); }} style={{ border: 0, background: "transparent", color: "#155eef", fontSize: 11, fontWeight: 900, padding: 0, cursor: "pointer", textDecoration: "underline" }}>Use standard</button>
                ) : null}
              </div>
            )) : null}
            {flowType === "plan_printing" && planPricingMode === "myob_matrix" && selectedPlanMatrixPrice ? <span style={{ color: "#067647", fontSize: 12, fontWeight: 850 }}>MYOB {pricingSettings?.priceLevelName || pricingSettings?.priceLevelCode || "Level A"} · {myobMatrixTierLabel(activePlanPriceMatrix, selectedPlanMatrixPrice.quantityOver)} · {matrixItemLabel(selectedPlanMatrixItem as MyobMatrixItem)}{manualQuoteDiscountPercent > 0 ? ` · ${manualQuoteDiscountPercent}% quote discount applied` : ""}</span> : null}
            {shouldCreateDispatchLine ? <span style={{ color: "#9a3412", fontSize: 12, fontWeight: 850 }}>Plus {serviceType === "install" ? "Sign Install" : "Delivery"}: qty {usage(dispatchLineQuantity)} × {money(dispatchUnitPrice)} = {money(dispatchLineTotal)}</span> : null}
            {shouldCreateAccessEquipmentLine ? <span style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 850 }}>Plus Access Equipment - {accessEquipmentType.trim()}: {usage(accessEquipmentDaysNumber)} day{accessEquipmentDaysNumber === 1 ? "" : "s"} × {money(accessEquipmentDailySellPrice)} = {money(accessEquipmentLineTotal)}</span> : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" disabled={!canSave || isSaving} style={{ ...primaryButton, minHeight: 40, opacity: canSave && !isSaving ? 1 : 0.45, cursor: canSave && !isSaving ? "pointer" : "not-allowed" }}>{isSaving ? "Saving…" : canSave ? "Save Quote Line" : "Complete required fields"}</button>
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

function InlineLabourField({ label, value, basis, onChange, onBasisChange, labourRate, quantity, perItemLabel = "Per item", automatic = null }: { label: string; value: string; basis: LabourBasis; onChange: (value: string) => void; onBasisChange: (basis: LabourBasis) => void; labourRate: number; quantity: number; perItemLabel?: string; automatic?: AutomaticLabourCost | null }) {
  const enteredMinutes = numberValue(value, 0);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <b>{label} {automatic ? "override (optional)" : "(optional)"}</b>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 170px", gap: 8 }}>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={automatic ? "Leave blank to use automatic time" : "Minutes, eg 0.5"} type="number" min="0" step="0.01" style={inputStyle} />
        <select value={basis} onChange={(event) => onBasisChange(event.target.value as LabourBasis)} style={inputStyle}>
          <option value="line_total">Total line item</option>
          <option value="per_item">{perItemLabel}</option>
        </select>
      </div>
      {automatic && enteredMinutes <= 0 ? <small style={{ color: "#047857", fontWeight: 800 }}>Automatic: {automaticLabourNote(automatic)}</small> : null}
      {enteredMinutes > 0 ? <small style={{ color: automatic ? "#9a3412" : "#64748b" }}>{automatic ? "Manual override: " : ""}{labourPreviewText(enteredMinutes, basis, labourRate, quantity, perItemLabel.toLowerCase())}</small> : null}
      {!automatic && enteredMinutes <= 0 ? <small style={{ color: "#64748b" }}>No linked automatic labour rule. Enter time if labour is required.</small> : null}
    </div>
  );
}

function InstallLabourField({ value, basis, crewSize, quantity, labourRate, onChange, onBasisChange }: { value: string; basis: LabourBasis; crewSize: string; quantity: number; labourRate: number; onChange: (value: string) => void; onBasisChange: (basis: LabourBasis) => void }) {
  const minutes = numberValue(value, 0);
  const hours = minutes > 0 ? minutes / 60 : 0;
  const crew = Math.max(1, numberValue(crewSize, 1));
  const safeQuantity = Math.max(1, quantity);
  const totalSiteMinutes = basis === "per_item" ? minutes * safeQuantity : minutes;
  const personMinutes = totalSiteMinutes * crew;
  const labourCost = personMinutes * (labourRate / 60);
  const preview = minutes <= 0
    ? "Enter the installation time, then choose whether it covers the complete line or each quoted item."
    : basis === "per_item"
      ? `${usage(hours)} hr per item × qty ${usage(safeQuantity)} × ${usage(crew)} installer${crew === 1 ? "" : "s"} = ${usage(personMinutes / 60)} person-hours · ${money(labourCost)} labour`
      : `${usage(hours)} hr for the complete line × ${usage(crew)} installer${crew === 1 ? "" : "s"} = ${usage(personMinutes / 60)} person-hours · ${money(labourCost)} labour`;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <b>Install labour time</b>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 170px", gap: 8 }}>
        <input value={minutes > 0 ? String(Math.round(hours * 100) / 100) : ""} onChange={(event) => onChange(event.target.value === "" ? "" : String(numberValue(event.target.value, 0) * 60))} placeholder="Hours, eg 1.5" type="number" min="0" step="0.25" style={inputStyle} />
        <select value={basis} onChange={(event) => onBasisChange(event.target.value as LabourBasis)} style={inputStyle}>
          <option value="line_total">Total line item</option>
          <option value="per_item">Per item</option>
        </select>
      </div>
      <small style={{ color: "#64748b" }}>{preview}</small>
    </div>
  );
}

function SelectedLabourMinutes<T extends { key: string; label: string }>({ options, selected, values, bases, onChange, onBasesChange, defaultBasis, eachLabelFor, labourRate, labourRatesByKey = {}, automaticByKey = {}, quantity }: { options: T[]; selected: string[]; values: Record<string, string>; bases: Record<string, LabourBasis>; onChange: (value: Record<string, string>) => void; onBasesChange: (value: Record<string, LabourBasis>) => void; defaultBasis: LabourBasis; eachLabelFor?: string; labourRate: number; labourRatesByKey?: Record<string, number>; automaticByKey?: Record<string, AutomaticLabourCost | null>; quantity: number }) {
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
          const operationRate = labourRatesByKey[item.key] ?? labourRate;
          const automatic = automaticByKey[item.key] ?? null;
          return (
            <div key={item.key} style={{ display: "grid", gap: 6 }}>
              <b>{item.label} labour {automatic ? "override (optional)" : ""}</b>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 155px", gap: 8 }}>
                <input value={values[item.key] ?? ""} onChange={(event) => onChange({ ...values, [item.key]: event.target.value })} placeholder={automatic ? "Automatic unless overridden" : "Minutes, eg 0.5"} type="number" min="0" step="0.01" style={inputStyle} />
                <select value={basis} onChange={(event) => onBasesChange({ ...bases, [item.key]: event.target.value as LabourBasis })} style={inputStyle}>
                  <option value="line_total">Total line item</option>
                  <option value="per_item">{perItemLabel}</option>
                </select>
              </div>
              {automatic && enteredMinutes <= 0 ? <small style={{ color: "#047857", fontWeight: 800 }}>Automatic: {automaticLabourNote(automatic)}</small> : null}
              {enteredMinutes > 0 ? <small style={{ color: automatic ? "#9a3412" : "#64748b" }}>{automatic ? "Manual override: " : ""}{isEach && basis === "per_item" ? `${minutesLabel(enteredMinutes)} per eyelet; multiplied by eyelet count and quote quantity at ${money(operationRate)}/hr.` : labourPreviewText(enteredMinutes, basis, operationRate, quantity, "per item")}</small> : null}
              {!automatic && enteredMinutes <= 0 ? <small style={{ color: "#64748b" }}>No linked automatic labour rule. Enter time if labour is required.</small> : null}
            </div>
          );
        })}
      </div>
      <span style={{ color: "#475467", fontSize: 13 }}>Decimal minutes are supported: 0.5 = 30 seconds. Total line item charges the entered time once for the complete quantity.</span>
    </div>
  );
}
