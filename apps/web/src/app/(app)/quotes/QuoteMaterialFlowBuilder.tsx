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

type PricingSettings = {
  markupMultiplier?: string | number | null;
  profitMultiplier?: string | number | null;
};

type QuoteMaterialFlowBuilderProps = {
  quoteId: string;
  materials: QuoteMaterial[];
  pricingSettings?: PricingSettings;
};

type BaseType = "acrylic" | "acm" | "corflute" | "pvc" | "banner" | "other_sheet";
type PrintMethod = "" | "no_print" | "direct_print" | "roll_stock" | "cut_vinyl";
type InkChoice = "" | "cmyk" | "white" | "both";
type SidesChoice = "" | "single" | "double";
type PrintDirection = "" | "positive" | "reverse";

type CostRow = {
  label: string;
  detail: string;
  amount: number;
  unit: string;
  rate: number;
  cost: number;
  note?: string;
};

type StepKey = "base" | "thickness" | "colour" | "size" | "print" | "media" | "ink" | "sides" | "laminate" | "finishing" | "review";

const baseTypes: Array<{ key: BaseType; label: string; icon: string; description: string; accent: string }> = [
  { key: "acrylic", label: "Acrylic", icon: "▣", description: "Clear, opal, white, black or coloured acrylic signs.", accent: "#7c3aed" },
  { key: "acm", label: "ACM", icon: "◫", description: "Aluminium composite panel signs.", accent: "#2563eb" },
  { key: "corflute", label: "Corflute", icon: "▤", description: "Corrugated plastic signs.", accent: "#0891b2" },
  { key: "pvc", label: "PVC / Foam", icon: "◰", description: "PVC, foamboard or similar sheet materials.", accent: "#16a34a" },
  { key: "banner", label: "Banner / roll", icon: "▰", description: "Roll-stock banner style items.", accent: "#ea580c" },
  { key: "other_sheet", label: "Other sheet", icon: "◧", description: "Any other sheet material in the material library.", accent: "#475569" }
];

const sizePresets = [
  { label: "450 × 600 mm", width: "450", height: "600" },
  { label: "600 × 900 mm", width: "600", height: "900" },
  { label: "900 × 1200 mm", width: "900", height: "1200" },
  { label: "1200 × 2400 mm", width: "1200", height: "2400" }
];

const printMethods: Array<{ key: Exclude<PrintMethod, "">; label: string; icon: string; description: string }> = [
  { key: "no_print", label: "No print", icon: "—", description: "Material only. Skip ink and print media." },
  { key: "direct_print", label: "Direct print", icon: "◉", description: "Print directly to the base material." },
  { key: "roll_stock", label: "Roll stock", icon: "↻", description: "Pick SAV, print vinyl, banner media or similar roll stock." },
  { key: "cut_vinyl", label: "Cut vinyl", icon: "✂", description: "Pick a roll vinyl material but no ink charge is added." }
];

const inkChoices: Array<{ key: InkChoice; label: string; icon: string; description: string }> = [
  { key: "cmyk", label: "CMYK", icon: "●", description: "$10/m² colour ink charge." },
  { key: "white", label: "White", icon: "○", description: "$10/m² white ink charge." },
  { key: "both", label: "CMYK + White", icon: "◐", description: "$20/m² total ink charge." }
];

const finishingOptions = [
  { key: "jingwei", label: "Jingwei cutting", icon: "✦", hours: 0.25, description: "Add cutting/plotting labour." },
  { key: "router", label: "Router / CNC cut", icon: "⚙", hours: 0.25, description: "Add router or CNC cutting labour." },
  { key: "drill_holes", label: "Drill holes", icon: "●", hours: 0.1, description: "Add drilling labour." },
  { key: "eyelets", label: "Eyelets", icon: "◎", hours: 0.03, description: "Ask placement/quantity and charge per eyelet." }
];

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
  const text = String(value ?? "").replace(/,/g, "").replace(/\$/g, "").replace(/mm/gi, "").replace(/lm/gi, "").trim();
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

function materialText(material: QuoteMaterial): string {
  return `${material.name} ${material.gsm ?? ""} ${material.notes ?? ""}`.toLowerCase();
}

function isSheetMaterial(material: QuoteMaterial): boolean {
  const type = String(material.materialType ?? "").toLowerCase();
  const text = materialText(material);
  return type.includes("sheet") || type.includes("paper") || type.includes("card") || text.includes("acm") || text.includes("acrylic") || text.includes("corflute") || text.includes("pvc");
}

function isRollMaterial(material: QuoteMaterial): boolean {
  const type = String(material.materialType ?? "").toLowerCase();
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const stockUom = String(material.stockUom ?? "").toLowerCase();
  const text = materialText(material);
  return numberValue(material.rollWidthMm, 0) > 0 || type.includes("roll") || purchaseUom.includes("roll") || stockUom.includes("roll") || text.includes("vinyl") || text.includes("sav") || text.includes("laminate") || text.includes("banner");
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
  return "Standard";
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function sheetAreaSqm(material: QuoteMaterial): number {
  const width = numberValue(material.widthMm, 0);
  const length = numberValue(material.lengthMm, 0);
  if (width <= 0 || length <= 0) return 0;
  return (width / 1000) * (length / 1000);
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

function materialCardMeta(material: QuoteMaterial): string {
  return [
    material.supplierName,
    material.sku,
    material.gsm,
    material.widthMm && material.lengthMm ? `${material.widthMm} × ${material.lengthMm}mm` : null,
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

export function QuoteMaterialFlowBuilder({ quoteId, materials, pricingSettings }: QuoteMaterialFlowBuilderProps) {
  const [activeStep, setActiveStep] = useState<StepKey>("base");
  const [baseType, setBaseType] = useState<BaseType | "">("");
  const [thickness, setThickness] = useState("");
  const [colour, setColour] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [printMethod, setPrintMethod] = useState<PrintMethod>("");
  const [mediaId, setMediaId] = useState("");
  const [ink, setInk] = useState<InkChoice>("");
  const [sides, setSides] = useState<SidesChoice>("");
  const [printDirection, setPrintDirection] = useState<PrintDirection>("");
  const [laminateId, setLaminateId] = useState("");
  const [finishings, setFinishings] = useState<string[]>([]);
  const [eyeletPresetLabel, setEyeletPresetLabel] = useState(eyeletPresets[0]?.label ?? "");
  const [customEyeletQty, setCustomEyeletQty] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPriceOverridden, setUnitPriceOverridden] = useState(false);
  const [manualUnitPrice, setManualUnitPrice] = useState("0.00");

  const markupMultiplier = multiplierValue(pricingSettings?.markupMultiplier, 1.5);
  const profitMultiplier = multiplierValue(pricingSettings?.profitMultiplier, 1.2);
  const sellMultiplier = markupMultiplier * profitMultiplier;

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
  const selectedMedia = rollMedia.find((material) => material.id === mediaId);
  const selectedLaminate = laminateMaterials.find((material) => material.id === laminateId);
  const eyeletMaterial = materials.find((material) => materialText(material).includes("eyelet")) ?? materials.find((material) => String(material.materialType ?? "").toLowerCase().includes("fix"));

  const isClearAcrylic = baseType === "acrylic" && colour.toLowerCase() === "clear";
  const printed = printMethod !== "" && printMethod !== "no_print";
  const needsMediaStep = printMethod === "roll_stock" || printMethod === "cut_vinyl";
  const needsInkStep = printMethod === "direct_print" || printMethod === "roll_stock";
  const width = numberValue(widthMm, 0);
  const height = numberValue(heightMm, 0);
  const areaSqm = width > 0 && height > 0 ? (width / 1000) * (height / 1000) : 0;
  const sideMultiplier = sides === "double" ? 2 : 1;
  const quantityNumber = Math.max(1, numberValue(quantity, 1));

  const steps = useMemo(() => {
    const next: Array<{ key: StepKey; label: string; complete: boolean; icon: string }> = [
      { key: "base", label: "Base material", complete: Boolean(baseType), icon: "1" },
      { key: "thickness", label: "Thickness", complete: Boolean(thickness), icon: "2" },
      { key: "colour", label: "Colour", complete: Boolean(colour && selectedMainMaterial), icon: "3" },
      { key: "size", label: "Size", complete: width > 0 && height > 0, icon: "4" },
      { key: "print", label: "Print method", complete: Boolean(printMethod), icon: "5" }
    ];
    if (needsMediaStep) next.push({ key: "media", label: printMethod === "cut_vinyl" ? "Cut vinyl" : "Roll media", complete: Boolean(mediaId), icon: "6" });
    if (needsInkStep) next.push({ key: "ink", label: "Ink", complete: Boolean(ink), icon: needsMediaStep ? "7" : "6" });
    if (printed) next.push({ key: "sides", label: isClearAcrylic ? "Sides / direction" : "Sides", complete: Boolean(sides && (!isClearAcrylic || printDirection)), icon: "•" });
    if (printed) next.push({ key: "laminate", label: "Laminate", complete: Boolean(laminateId), icon: "•" });
    next.push({ key: "finishing", label: "Finishing", complete: true, icon: "•" });
    next.push({ key: "review", label: "Review", complete: Boolean(baseType && selectedMainMaterial && width > 0 && height > 0 && printMethod), icon: "✓" });
    return next;
  }, [baseType, thickness, colour, selectedMainMaterial, width, height, printMethod, needsMediaStep, needsInkStep, mediaId, ink, printed, isClearAcrylic, sides, printDirection, laminateId]);

  const activeStepIndex = Math.max(0, steps.findIndex((step) => step.key === activeStep));
  const nextStep = steps[activeStepIndex + 1]?.key;
  const previousStep = steps[activeStepIndex - 1]?.key;

  function jumpToNext(current: StepKey) {
    const index = steps.findIndex((step) => step.key === current);
    const next = steps[index + 1]?.key;
    if (next) setActiveStep(next);
  }

  function resetAfterBase(nextBase: BaseType) {
    setBaseType(nextBase);
    setThickness("");
    setColour("");
    setWidthMm("");
    setHeightMm("");
    setPrintMethod("");
    setMediaId("");
    setInk("");
    setSides("");
    setPrintDirection("");
    setLaminateId("");
    setFinishings([]);
    setUnitPriceOverridden(false);
    setActiveStep("thickness");
  }

  function setPresetSize(widthValue: string, heightValue: string) {
    setWidthMm(widthValue);
    setHeightMm(heightValue);
    jumpToNext("size");
  }

  function setPrint(nextMethod: Exclude<PrintMethod, "">) {
    setPrintMethod(nextMethod);
    setMediaId("");
    if (nextMethod === "no_print" || nextMethod === "cut_vinyl") setInk("");
    if (nextMethod === "no_print") {
      setSides("");
      setPrintDirection("");
      setLaminateId("none");
    }
    setUnitPriceOverridden(false);
    setTimeout(() => setActiveStep(nextMethod === "roll_stock" || nextMethod === "cut_vinyl" ? "media" : nextMethod === "direct_print" ? "ink" : "finishing"), 0);
  }

  function toggleFinishing(key: string) {
    setFinishings((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setUnitPriceOverridden(false);
  }

  const costs = useMemo<CostRow[]>(() => {
    const rows: CostRow[] = [];
    if (selectedMainMaterial && areaSqm > 0) {
      if (isRollMaterial(selectedMainMaterial) && !isSheetMaterial(selectedMainMaterial)) {
        const lm = linearMetres(width, height, selectedMainMaterial);
        const rate = rollRate(selectedMainMaterial);
        rows.push({ label: "Base material", detail: selectedMainMaterial.name, amount: lm.amount, unit: "lm", rate: rate.rate, cost: lm.amount * rate.rate, note: [lm.note, rate.note].filter(Boolean).join(" · ") || undefined });
      } else {
        const parentArea = sheetAreaSqm(selectedMainMaterial);
        const sheets = parentArea > 0 ? areaSqm / parentArea : 0;
        const rate = numberValue(selectedMainMaterial.purchaseCost, 0);
        rows.push({ label: "Base material", detail: selectedMainMaterial.name, amount: sheets, unit: "sheet", rate, cost: sheets * rate, note: parentArea > 0 ? `based on ${usage(parentArea)}sqm parent sheet` : "sheet size missing" });
      }
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
        rows.push({ label: "CMYK ink", detail: "Sell charge", amount, unit: "sqm", rate: 10, cost: amount * 10, note: sides === "double" ? "double sided" : undefined });
      }
      if (ink === "white" || ink === "both") {
        const amount = areaSqm * sideMultiplier;
        rows.push({ label: "White ink", detail: "Sell charge", amount, unit: "sqm", rate: 10, cost: amount * 10, note: sides === "double" ? "double sided" : undefined });
      }
    }

    if (selectedLaminate && laminateId !== "none" && areaSqm > 0) {
      const lm = linearMetres(width, height, selectedLaminate);
      const rate = rollRate(selectedLaminate);
      const amount = lm.amount * sideMultiplier;
      rows.push({ label: "Laminate", detail: selectedLaminate.name, amount, unit: "lm", rate: rate.rate, cost: amount * rate.rate, note: [lm.note, sides === "double" ? "double sided" : null, rate.note].filter(Boolean).join(" · ") || undefined });
    }

    const labourRate = 66;
    for (const item of finishingOptions) {
      if (!finishings.includes(item.key)) continue;
      if (item.key === "eyelets") {
        const preset = eyeletPresets.find((entry) => entry.label === eyeletPresetLabel);
        const qty = preset?.qty === 0 ? Math.max(0, numberValue(customEyeletQty, 0)) : Math.max(0, preset?.qty ?? 0);
        if (eyeletMaterial && qty > 0) {
          const rate = eachRate(eyeletMaterial);
          rows.push({ label: "Eyelets", detail: eyeletMaterial.name, amount: qty, unit: "each", rate: rate.rate, cost: qty * rate.rate, note: [eyeletPresetLabel, rate.note].filter(Boolean).join(" · ") || undefined });
        }
        if (qty > 0) {
          rows.push({ label: "Eyelet labour", detail: "Factory labour", amount: qty * item.hours, unit: "hr", rate: labourRate, cost: qty * item.hours * labourRate, note: eyeletPresetLabel });
        }
      } else {
        rows.push({ label: `${item.label} labour`, detail: "Factory labour", amount: item.hours, unit: "hr", rate: labourRate, cost: item.hours * labourRate });
      }
    }

    return rows;
  }, [selectedMainMaterial, selectedMedia, selectedLaminate, eyeletMaterial, areaSqm, width, height, needsMediaStep, printMethod, sideMultiplier, needsInkStep, ink, laminateId, sides, finishings, eyeletPresetLabel, customEyeletQty]);

  const rawCost = costs.reduce((total, row) => total + row.cost, 0);
  const markedUpCost = rawCost * markupMultiplier;
  const autoUnitPrice = markedUpCost * profitMultiplier;
  const unitPrice = unitPriceOverridden ? numberValue(manualUnitPrice, 0) : autoUnitPrice;
  const lineTotal = unitPrice * quantityNumber;

  const selectedBase = baseTypes.find((item) => item.key === baseType);
  const selectedMediaName = selectedMedia?.name ?? "";
  const selectedLaminateName = laminateId === "none" ? "None" : selectedLaminate?.name ?? "";
  const finishingSummary = finishings.map((key) => finishingOptions.find((item) => item.key === key)?.label ?? key).join(", ");
  const lineName = selectedBase ? `${selectedBase.label} sign` : "Material quote line";
  const optionSummary = [
    selectedMainMaterial?.name,
    width > 0 && height > 0 ? `${width} × ${height}mm` : null,
    printMethods.find((item) => item.key === printMethod)?.label,
    selectedMediaName || null,
    inkChoices.find((item) => item.key === ink)?.label,
    sides ? `${sides === "double" ? "Double" : "Single"} sided` : null,
    printDirection ? `${printDirection === "reverse" ? "Reverse" : "Positive"} print` : null,
    selectedLaminateName ? `Laminate: ${selectedLaminateName}` : null,
    finishingSummary ? `Finishing: ${finishingSummary}` : null
  ].filter(Boolean).join(" · ");

  const canSave = Boolean(baseType && selectedMainMaterial && width > 0 && height > 0 && printMethod && (!needsMediaStep || mediaId) && (!needsInkStep || ink) && (!printed || sides) && (!isClearAcrylic || !printed || printDirection) && (!printed || laminateId));

  function stepTitle(): string {
    const current = steps.find((step) => step.key === activeStep);
    return current?.label ?? "Quote builder";
  }

  function renderStep() {
    if (activeStep === "base") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="1" title="Start with the base material" text="No product setup first. Choose the material family for this quote line." />
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
          <StepIntro icon="2" title={`Choose ${selectedBase?.label ?? "material"} thickness`} text="These choices come from the materials you have already created." />
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
          <StepIntro icon="3" title="Choose colour / finish" text="This picks the actual material sheet used for the quote line." />
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
          <StepIntro icon="4" title="Enter sign size" text="The finished size drives sheet usage, roll length, ink and laminate area." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            {sizePresets.map((preset) => {
              const selected = widthMm === preset.width && heightMm === preset.height;
              return (
                <button key={preset.label} type="button" onClick={() => setPresetSize(preset.width, preset.height)} style={cardButtonStyle(selected, "#2563eb")}>
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
            <button type="button" onClick={() => jumpToNext("size")} style={primaryButton}>Continue</button>
          </div>
        </div>
      );
    }

    if (activeStep === "print") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="5" title="Is it printed?" text="Choose the print method for this quote line. No option is selected by default." />
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
          <StepIntro icon="6" title={printMethod === "cut_vinyl" ? "Choose cut vinyl" : "Choose roll stock"} text="Pick the actual roll material from Materials. Roll stock is shown as a linear metre cost where possible." />
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
          <StepIntro icon="7" title="Choose ink" text="Ink is a sell charge per square metre, not a stock material." />
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
          <StepIntro icon="8" title={isClearAcrylic ? "Choose sides and print direction" : "Choose sides"} text={isClearAcrylic ? "Clear acrylic needs a positive/reverse print choice." : "Single or double sided printing affects ink, roll media and laminate usage."} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {[{ key: "single", label: "Single sided", icon: "◧" }, { key: "double", label: "Double sided", icon: "◨" }].map((choice) => (
              <button key={choice.key} type="button" onClick={() => setSides(choice.key as SidesChoice)} style={cardButtonStyle(sides === choice.key, "#0ea5e9")}>
                <span style={{ fontSize: 34 }}>{choice.icon}</span>
                <strong>{choice.label}</strong>
                <span style={{ color: "#64748b" }}>{choice.key === "double" ? "Doubles print-related usage." : "One printed face."}</span>
              </button>
            ))}
          </div>
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
          ) : (
            <button type="button" onClick={() => jumpToNext("sides")} style={primaryButton}>Continue</button>
          )}
        </div>
      );
    }

    if (activeStep === "laminate") {
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="9" title="Choose laminate" text="Choose None or select an actual laminate material from Materials." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <button type="button" onClick={() => { setLaminateId("none"); setActiveStep("finishing"); }} style={cardButtonStyle(laminateId === "none", "#64748b")}>
              <span style={{ fontSize: 30 }}>—</span>
              <strong>None</strong>
              <span style={{ color: "#64748b" }}>No laminate added.</span>
            </button>
            {laminateMaterials.map((material) => {
              const rate = rollRate(material);
              return (
                <button key={material.id} type="button" onClick={() => { setLaminateId(material.id); setActiveStep("finishing"); }} style={cardButtonStyle(laminateId === material.id, "#16a34a")}>
                  <span style={{ fontSize: 30 }}>▱</span>
                  <strong>{material.name}</strong>
                  <span style={{ color: "#64748b" }}>{materialCardMeta(material)}</span>
                  <span style={{ fontWeight: 950 }}>{money(rate.rate)}/lm</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeStep === "finishing") {
      const eyeletsSelected = finishings.includes("eyelets");
      return (
        <div style={{ display: "grid", gap: 16 }}>
          <StepIntro icon="10" title="Choose finishing" text="Tick all finishing processes required for this quote line. You can also skip this step." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {finishingOptions.map((item) => (
              <button key={item.key} type="button" onClick={() => toggleFinishing(item.key)} style={cardButtonStyle(finishings.includes(item.key), "#f59e0b")}>
                <span style={{ fontSize: 30 }}>{item.icon}</span>
                <strong>{item.label}</strong>
                <span style={{ color: "#64748b" }}>{item.description}</span>
                <span style={{ fontWeight: 900 }}>{item.key === "eyelets" ? `${item.hours}hr each + eyelet material` : `${item.hours}hr labour`}</span>
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
          <button type="button" onClick={() => setActiveStep("review")} style={primaryButton}>Review quote line</button>
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gap: 16 }}>
        <StepIntro icon="✓" title="Review and save" text="This is the current quote line. It is not saved until you press the button below." />
        <PricePanel rows={costs} rawCost={rawCost} markupMultiplier={markupMultiplier} profitMultiplier={profitMultiplier} unitPrice={unitPrice} lineTotal={lineTotal} quantity={quantityNumber} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}><b>Quantity</b><input name="quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="1" step="any" style={inputStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><b>Unit sell price</b><input name="unitPrice" value={unitPriceOverridden ? manualUnitPrice : autoUnitPrice.toFixed(2)} onChange={(event) => { setManualUnitPrice(event.target.value); setUnitPriceOverridden(true); }} type="number" min="0" step="0.01" style={inputStyle} /></label>
        </div>
        {unitPriceOverridden ? <button type="button" onClick={() => setUnitPriceOverridden(false)} style={ghostButton}>Use calculated price</button> : null}
      </div>
    );
  }

  return (
    <form action={addQuoteLineAction} style={{ border: "1px solid #dbeafe", borderRadius: 28, overflow: "hidden", background: "#ffffff", display: "grid" }}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="productName" value={lineName} />
      <input type="hidden" name="optionSummary" value={optionSummary} />
      <input type="hidden" name="unitPrice" value={(unitPriceOverridden ? numberValue(manualUnitPrice, 0) : autoUnitPrice).toFixed(2)} />
      <input type="hidden" name="quantity" value={quantity} />
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #172554 58%, #155eef 100%)", color: "#fff", padding: 22, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12, fontWeight: 950, color: "#bfdbfe" }}>Quote-side product builder</p>
            <h3 style={{ margin: "6px 0 0", fontSize: 30, letterSpacing: "-0.04em" }}>{stepTitle()}</h3>
            <p style={{ margin: "6px 0 0", color: "#dbeafe" }}>Build the quote line from materials. Products/templates stay in the background.</p>
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

      <div style={{ display: "grid", gridTemplateColumns: "270px minmax(0, 1fr)", gap: 18, padding: 20, background: "#f8fbff" }}>
        <aside style={{ display: "grid", gap: 14, alignSelf: "start" }}>
          <div style={{ border: "1px solid #dfe7f2", borderRadius: 22, padding: 16, background: "#fff", display: "grid", gap: 10 }}>
            <strong>Current build</strong>
            <SummaryRow label="Base" value={selectedBase?.label} />
            <SummaryRow label="Material" value={selectedMainMaterial?.name} />
            <SummaryRow label="Size" value={width > 0 && height > 0 ? `${width} × ${height}mm` : undefined} />
            <SummaryRow label="Print" value={printMethods.find((item) => item.key === printMethod)?.label} />
            <SummaryRow label="Media" value={selectedMedia?.name} />
            <SummaryRow label="Ink" value={inkChoices.find((item) => item.key === ink)?.label} />
            <SummaryRow label="Laminate" value={selectedLaminateName || undefined} />
            <SummaryRow label="Finishing" value={finishingSummary || undefined} />
          </div>
          <div style={{ border: "1px solid #bbf7d0", borderRadius: 22, padding: 16, background: "#f0fdf4", display: "grid", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 950, color: "#067647", textTransform: "uppercase" }}>Live price</span>
            <strong style={{ fontSize: 26 }}>{money(unitPrice)}</strong>
            <span style={{ color: "#475467", fontSize: 13 }}>cost {money(rawCost)} × markup {usage(markupMultiplier)} × profit {usage(profitMultiplier)}</span>
          </div>
        </aside>

        <section style={{ border: "1px solid #dfe7f2", borderRadius: 24, padding: 18, background: "#fff", minHeight: 520, display: "grid", gap: 16, alignContent: "start" }}>
          {renderStep()}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
            <button type="button" disabled={!previousStep} onClick={() => previousStep && setActiveStep(previousStep)} style={{ ...ghostButton, opacity: previousStep ? 1 : 0.45 }}>Back</button>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {nextStep ? <button type="button" onClick={() => setActiveStep(nextStep)} style={ghostButton}>Skip / next</button> : null}
              <button type="button" onClick={() => setActiveStep("review")} style={primaryButton}>Review</button>
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
        <button type="submit" disabled={!canSave} style={{ ...darkButton, opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "not-allowed" }}>{canSave ? "Save current line to quote" : "Complete required cards before saving"}</button>
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

function PricePanel({ rows, rawCost, markupMultiplier, profitMultiplier, unitPrice, lineTotal, quantity }: { rows: CostRow[]; rawCost: number; markupMultiplier: number; profitMultiplier: number; unitPrice: number; lineTotal: number; quantity: number }) {
  return (
    <div style={{ border: "1px solid #bbf7d0", borderRadius: 20, padding: 16, background: "#f0fdf4", display: "grid", gap: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 950, color: "#067647", textTransform: "uppercase", letterSpacing: "0.05em" }}>Calculated quote price</span>
      <strong style={{ fontSize: 22 }}>{money(unitPrice)} sell price per unit · {money(lineTotal)} line total at qty {usage(quantity)}</strong>
      <div style={{ color: "#344054", fontSize: 13, display: "grid", gap: 4 }}>
        <div><b>Raw cost:</b> {money(rawCost)}</div>
        <div><b>Global markup:</b> ×{usage(markupMultiplier)}</div>
        <div><b>Global profit:</b> ×{usage(profitMultiplier)}</div>
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
