"use client";

import { useEffect, useMemo, useState } from "react";
import { addQuoteLineAction } from "./actions";

type QuoteChoice = {
  id?: string | null;
  label?: string | null;
  value?: string | null;
  widthMm?: string | null;
  heightMm?: string | null;
};

type QuoteQuestion = {
  id?: string | null;
  key: string;
  label: string;
  type: string;
  required?: boolean;
  defaultValue?: string | null;
  helpText?: string | null;
  options?: QuoteChoice[];
  showWhen?: {
    optionKey?: string | null;
    optionValues?: string[] | null;
  } | null;
};

type QuoteComponent = {
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
  } | null;
  trigger?: {
    optionKey?: string | null;
    optionValues?: string[] | null;
  } | null;
};

type QuoteMaterial = {
  id: string;
  name: string;
  materialType?: string | null;
  stockUom?: string | null;
  purchaseUom?: string | null;
  stockQuantity?: string | null;
  purchaseCost?: string | null;
  widthMm?: string | null;
  lengthMm?: string | null;
  rollWidthMm?: string | null;
};

type QuoteProduct = {
  id: string;
  name: string;
  sku?: string | null;
  fields: QuoteQuestion[];
  components: QuoteComponent[];
};

type CostBreakdownItem = {
  componentLabel: string;
  materialName: string;
  basis: string;
  amount: number;
  unit: string;
  rate: number;
  cost: number;
  note?: string;
};

type QuoteLineBuilderProps = {
  quoteId: string;
  products: QuoteProduct[];
  materials: QuoteMaterial[];
};

const inputStyle = {
  minHeight: 44,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "0 14px",
  width: "100%",
  boxSizing: "border-box" as const,
  background: "#fff",
  color: "#0f172a"
};

const textareaStyle = {
  minHeight: 96,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "12px 14px",
  width: "100%",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
  background: "#fff"
};

const buttonStyle = {
  minHeight: 44,
  borderRadius: 14,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  padding: "0 16px"
};

const secondaryButtonStyle = {
  minHeight: 40,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  background: "#fff",
  color: "#1e293b",
  fontWeight: 900,
  cursor: "pointer",
  padding: "0 14px"
};

const labelStyle = { display: "grid", gap: 6 };
const labelTextStyle = { fontWeight: 900, fontSize: 12, color: "#334155" };
const mutedStyle = { margin: 0, color: "#64748b", lineHeight: 1.55 };
const chipStyle = { borderRadius: 999, background: "#e0f2fe", color: "#075985", padding: "5px 10px", fontSize: 12, fontWeight: 950 };
const priceCardStyle = { border: "1px solid #bbf7d0", borderRadius: 18, padding: 14, background: "#f0fdf4", display: "grid", gap: 8 };
const quotePanelStyle = { border: "1px solid #dfe7f2", borderRadius: 20, padding: 16, display: "grid", gap: 12, background: "#fbfdff" };

function humanize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/(\d+)x(\d+)/i, "$1 × $2");
}

function numberValue(value: string | number | null | undefined, fallback = 0): number {
  const amount = Number(String(value ?? "").replace(/,/g, "").replace(/\$/g, "").trim());
  return Number.isFinite(amount) ? amount : fallback;
}

function moneyInput(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatMoney(value: string | number | null | undefined): string {
  return `$${numberValue(value).toFixed(2)}`;
}

function formatUsage(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";
  if (value < 0.01) return value.toFixed(4);
  if (value < 1) return value.toFixed(3);
  return value.toFixed(2);
}

function defaultAnswersFor(product: QuoteProduct | undefined): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of product?.fields ?? []) {
    const defaultValue = String(field.defaultValue ?? "");
    const firstChoice = field.options?.[0]?.value ? String(field.options[0].value) : "";
    next[field.key] = defaultValue || firstChoice;
  }
  return next;
}

function selectedChoice(field: QuoteQuestion, value: string): QuoteChoice | undefined {
  return field.options?.find((option) => String(option.value ?? option.label ?? "") === value);
}

function answerLabel(field: QuoteQuestion, value: string): string {
  const matched = selectedChoice(field, value);
  const label = String(matched?.label ?? value ?? "").trim();
  return label.replace(/_/g, " ");
}

function isVisible(field: QuoteQuestion, answers: Record<string, string>): boolean {
  const showWhen = field.showWhen;
  const optionKey = String(showWhen?.optionKey ?? "");
  if (!optionKey) return true;

  const requiredValues = Array.isArray(showWhen?.optionValues) ? showWhen?.optionValues ?? [] : [];
  const currentAnswer = answers[optionKey] ?? "";
  if (requiredValues.length === 0) return currentAnswer.length > 0;
  return requiredValues.includes(currentAnswer);
}

function summaryFor(fields: QuoteQuestion[], answers: Record<string, string>): string {
  return fields
    .filter((field) => isVisible(field, answers))
    .filter((field) => field.type !== "quantity" && field.key !== "quantity")
    .map((field) => {
      const value = answers[field.key] ?? "";
      if (!value) return "";
      return `${field.label}: ${answerLabel(field, value)}`;
    })
    .filter(Boolean)
    .join(" · ");
}

function needsTextInput(type: string): boolean {
  return ["text", "number", "quantity"].includes(type);
}

function inputTypeFor(type: string): string {
  if (["number", "quantity"].includes(type)) return "number";
  return "text";
}

function parseDimensionsFromText(value: string | null | undefined): { widthMm: number; heightMm: number } | null {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const widthMm = numberValue(match[1]);
  const heightMm = numberValue(match[2]);
  if (widthMm <= 0 || heightMm <= 0) return null;
  return { widthMm, heightMm };
}

function dimensionsForField(field: QuoteQuestion | undefined, answers: Record<string, string>): { widthMm: number; heightMm: number } | null {
  if (!field) return null;
  const value = answers[field.key] ?? String(field.defaultValue ?? "");
  const choice = selectedChoice(field, value);
  const optionWidth = numberValue(choice?.widthMm, 0);
  const optionHeight = numberValue(choice?.heightMm, 0);
  if (optionWidth > 0 && optionHeight > 0) return { widthMm: optionWidth, heightMm: optionHeight };
  return parseDimensionsFromText(choice?.label) ?? parseDimensionsFromText(choice?.value) ?? parseDimensionsFromText(value);
}

function dimensionsForComponent(fields: QuoteQuestion[], answers: Record<string, string>, component: QuoteComponent): { widthMm: number; heightMm: number } | null {
  const overrideWidthMm = numberValue(component.stockUsage?.widthMm, 0);
  const overrideHeightMm = numberValue(component.stockUsage?.heightMm, 0);
  if (overrideWidthMm > 0 && overrideHeightMm > 0) return { widthMm: overrideWidthMm, heightMm: overrideHeightMm };

  const optionKey = String(component.stockUsage?.optionKey ?? "");
  const optionField = fields.find((field) => field.key === optionKey && (field.type === "size_select" || field.key.toLowerCase().includes("size")));
  const finishedSizeField = fields.find((field) => field.key === "finished_size");
  const firstSizeField = fields.find((field) => field.type === "size_select" || field.key.toLowerCase().includes("size"));

  return dimensionsForField(optionField ?? finishedSizeField ?? firstSizeField, answers);
}

function materialFor(materials: QuoteMaterial[], materialId: string | null | undefined): QuoteMaterial | undefined {
  if (!materialId) return undefined;
  return materials.find((material) => material.id === materialId);
}

function componentApplies(component: QuoteComponent, answers: Record<string, string>): boolean {
  const triggerKey = String(component.trigger?.optionKey ?? "");
  if (!triggerKey) return true;

  const currentAnswer = answers[triggerKey] ?? "";
  const requiredValues = Array.isArray(component.trigger?.optionValues) ? component.trigger?.optionValues ?? [] : [];
  if (requiredValues.length === 0) return currentAnswer.length > 0;
  return requiredValues.includes(currentAnswer);
}

function wasteMultiplier(component: QuoteComponent): number {
  const wastePercent = Math.max(0, numberValue(component.wastePercent, 0));
  return 1 + wastePercent / 100;
}

function componentAllowance(component: QuoteComponent): number {
  return Math.max(0, numberValue(component.quantity, 1));
}

function sheetAreaSqm(material: QuoteMaterial): number {
  const widthMm = numberValue(material.widthMm, 0);
  const lengthMm = numberValue(material.lengthMm, 0);
  if (widthMm <= 0 || lengthMm <= 0) return 0;
  return (widthMm / 1000) * (lengthMm / 1000);
}

function materialLooksLikeRoll(material: QuoteMaterial): boolean {
  const materialType = String(material.materialType ?? "").toLowerCase();
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const stockUom = String(material.stockUom ?? "").toLowerCase();
  const name = String(material.name ?? "").toLowerCase();

  return (
    numberValue(material.rollWidthMm, 0) > 0 ||
    [purchaseUom, stockUom].some((unit) => ["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(unit)) ||
    purchaseUom.includes("roll") ||
    stockUom.includes("roll") ||
    materialType.includes("roll") ||
    materialType.includes("vinyl") ||
    materialType.includes("media") ||
    name.includes("sav") ||
    name.includes("vinyl") ||
    name.includes("laminate") ||
    name.includes("roll")
  );
}

function normalizedRuleTypeFor(component: QuoteComponent, material: QuoteMaterial): string {
  const ruleType = String(component.ruleType ?? component.stockUsage?.usageBasis ?? "yield_based");
  if (["yield_based", "auto_sheet", "auto_material"].includes(ruleType) && materialLooksLikeRoll(material)) {
    return "per_linear_metre";
  }
  return ruleType;
}

function costRateFor(material: QuoteMaterial, basis: "sheet" | "lm" | "sqm" | "each"): { rate: number; unit: string; note?: string } {
  const purchaseCost = numberValue(material.purchaseCost, 0);
  const purchaseUom = String(material.purchaseUom ?? "").toLowerCase();
  const stockUom = String(material.stockUom ?? "").toLowerCase();
  const stockQuantity = numberValue(material.stockQuantity, 0);
  const rollWidthM = numberValue(material.rollWidthMm, 0) / 1000;

  if (basis === "sheet") {
    return { rate: purchaseCost, unit: "sheet" };
  }

  if (basis === "lm") {
    if (["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(purchaseUom)) {
      return { rate: purchaseCost, unit: "lm" };
    }
    if (purchaseUom.includes("roll") && stockQuantity > 0 && ["lm", "m", "metre", "meter"].includes(stockUom)) {
      return { rate: purchaseCost / stockQuantity, unit: "lm", note: `using ${formatUsage(stockQuantity)} lm per roll from material stock quantity` };
    }
    if (materialLooksLikeRoll(material) && stockQuantity > 0 && ["lm", "m", "metre", "meter"].includes(stockUom)) {
      return { rate: purchaseCost / stockQuantity, unit: "lm", note: `roll stock detected; using ${formatUsage(stockQuantity)} lm from material stock quantity` };
    }
    return { rate: purchaseCost, unit: "lm", note: "set material purchase unit to lm, or set purchase unit to roll + stock quantity as roll length" };
  }

  if (basis === "sqm") {
    const area = sheetAreaSqm(material);
    if (["sqm", "m2", "m²", "square metre", "square meter"].includes(purchaseUom)) {
      return { rate: purchaseCost, unit: "sqm" };
    }
    if (purchaseUom.includes("sheet") && area > 0) {
      return { rate: purchaseCost / area, unit: "sqm", note: `derived from ${formatUsage(area)} sqm sheet` };
    }
    if (["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(purchaseUom) && rollWidthM > 0) {
      return { rate: purchaseCost / rollWidthM, unit: "sqm", note: `derived from ${numberValue(material.rollWidthMm)} mm roll width` };
    }
    if (purchaseUom.includes("roll") && rollWidthM > 0 && stockQuantity > 0 && ["lm", "m", "metre", "meter"].includes(stockUom)) {
      return { rate: purchaseCost / (rollWidthM * stockQuantity), unit: "sqm", note: `using ${formatUsage(stockQuantity)} lm per roll from material stock quantity` };
    }
    return { rate: purchaseCost, unit: "sqm", note: "set material purchase cost per sqm for exact area pricing" };
  }

  return { rate: purchaseCost, unit: "each" };
}

function linearMetresFor(dimensions: { widthMm: number; heightMm: number } | null, material: QuoteMaterial, component?: QuoteComponent): { amount: number; note?: string } {
  if (!dimensions) return { amount: 0, note: "size missing" };

  const componentRollWidthMm = numberValue(component?.stockUsage?.rollWidthMm, 0);
  const materialRollWidthMm = numberValue(material.rollWidthMm, 0);
  const rollWidthMm = componentRollWidthMm > 0 ? componentRollWidthMm : materialRollWidthMm;
  const { widthMm, heightMm } = dimensions;

  if (rollWidthMm > 0) {
    const rollNote = componentRollWidthMm > 0 ? "using product roll width override" : undefined;
    const widthFits = widthMm <= rollWidthMm;
    const heightFits = heightMm <= rollWidthMm;

    if (widthFits && heightFits) {
      const shorterLengthMm = Math.min(widthMm, heightMm);
      const note = widthMm <= heightMm ? ["rotated to save roll length", rollNote].filter(Boolean).join(" · ") : rollNote;
      return { amount: shorterLengthMm / 1000, note: note || undefined };
    }

    if (widthFits) return { amount: heightMm / 1000, note: rollNote };
    if (heightFits) return { amount: widthMm / 1000, note: ["rotated to fit roll width", rollNote].filter(Boolean).join(" · ") || undefined };
    return { amount: Math.max(widthMm, heightMm) / 1000, note: ["size is wider than roll width; check paneling", rollNote].filter(Boolean).join(" · ") || undefined };
  }

  return { amount: Math.max(widthMm, heightMm) / 1000, note: "roll width missing; using longest side as metres" };
}

function costBreakdownItem(item: Omit<CostBreakdownItem, "note"> & { note?: string | null | undefined }): CostBreakdownItem {
  const note = String(item.note ?? "").trim();
  const base = {
    componentLabel: item.componentLabel,
    materialName: item.materialName,
    basis: item.basis,
    amount: item.amount,
    unit: item.unit,
    rate: item.rate,
    cost: item.cost
  };
  return note ? { ...base, note } : base;
}

function componentCostBreakdownFor(product: QuoteProduct | undefined, materials: QuoteMaterial[], answers: Record<string, string>): CostBreakdownItem[] {
  if (!product) return [];

  return product.components
    .filter((component) => String(component.kind ?? "material") !== "labour")
    .filter((component) => componentApplies(component, answers))
    .flatMap((component): CostBreakdownItem[] => {
      const rawRuleType = String(component.ruleType ?? component.stockUsage?.usageBasis ?? "yield_based");
      const dimensions = dimensionsForComponent(product.fields, answers, component);
      const allowance = componentAllowance(component);
      const waste = wasteMultiplier(component);
      const componentLabel = String(component.stockUsage?.chargeName ?? component.label ?? "Material");

      if (rawRuleType === "sell_sqm") {
        const area = dimensions ? (dimensions.widthMm / 1000) * (dimensions.heightMm / 1000) : 0;
        const rate = numberValue(component.stockUsage?.sellRate, numberValue(component.quantity, 0));
        const amount = area * allowance;
        return [costBreakdownItem({
          componentLabel,
          materialName: "Sell charge",
          basis: "Square metre charge",
          amount,
          unit: "sqm",
          rate,
          cost: amount * rate,
          note: "price rule from product answer line"
        })];
      }

      if (rawRuleType === "sell_each") {
        const rate = numberValue(component.stockUsage?.sellRate, numberValue(component.quantity, 0));
        const amount = allowance;
        return [costBreakdownItem({
          componentLabel,
          materialName: "Sell charge",
          basis: "Fixed charge",
          amount,
          unit: "each",
          rate,
          cost: amount * rate,
          note: "price rule from product answer line"
        })];
      }

      const material = materialFor(materials, component.materialId);
      if (!material) return [];

      const ruleType = normalizedRuleTypeFor(component, material);

      if (ruleType === "per_linear_metre") {
        const fixedMetresPerUnit = numberValue(component.stockUsage?.metresPerUnit, 0);
        const metres = fixedMetresPerUnit > 0
          ? { amount: fixedMetresPerUnit, note: "fixed roll metres set on product usage" }
          : linearMetresFor(dimensions, material, component);
        const amount = metres.amount * allowance * waste;
        const rate = costRateFor(material, "lm");
        return [costBreakdownItem({
          componentLabel,
          materialName: material.name,
          basis: fixedMetresPerUnit > 0 ? "Fixed roll metres used" : "Roll length used",
          amount,
          unit: rate.unit,
          rate: rate.rate,
          cost: amount * rate.rate,
          note: [
            String(component.ruleType ?? component.stockUsage?.usageBasis ?? "") === "per_linear_metre" ? undefined : "auto-detected roll stock",
            metres.note,
            rate.note
          ].filter(Boolean).join(" · ")
        })];
      }

      if (ruleType === "per_sqm") {
        const area = dimensions ? (dimensions.widthMm / 1000) * (dimensions.heightMm / 1000) : 0;
        const amount = area * allowance * waste;
        const rate = costRateFor(material, "sqm");
        return [costBreakdownItem({
          componentLabel,
          materialName: material.name,
          basis: component.stockUsage?.widthMm && component.stockUsage?.heightMm ? "Fixed square metres used" : "Square metres used",
          amount,
          unit: rate.unit,
          rate: rate.rate,
          cost: amount * rate.rate,
          note: rate.note
        })];
      }

      if (ruleType === "per_unit" || ruleType === "selected_by_option") {
        const fixedSheetsPerUnit = numberValue(component.stockUsage?.sheetsPerUnit, 0);
        const isSheetUnit = String(component.unit ?? "each") === "sheet";
        const amount = (isSheetUnit && fixedSheetsPerUnit > 0 ? fixedSheetsPerUnit : allowance) * waste;
        const rate = costRateFor(material, isSheetUnit ? "sheet" : "each");
        return [costBreakdownItem({
          componentLabel,
          materialName: material.name,
          basis: isSheetUnit ? "Full sheets used" : "Fixed items used",
          amount,
          unit: rate.unit,
          rate: rate.rate,
          cost: amount * rate.rate,
          note: [fixedSheetsPerUnit > 0 ? "fixed sheets per item set on product usage" : undefined, rate.note].filter(Boolean).join(" · ")
        })];
      }

      const fixedSheetsPerUnit = numberValue(component.stockUsage?.sheetsPerUnit, 0);
      const partsPerSheet = numberValue(component.stockUsage?.partsPerSheet, 0);
      const parentArea = sheetAreaSqm(material);
      const signArea = dimensions ? (dimensions.widthMm / 1000) * (dimensions.heightMm / 1000) : 0;
      const sheetsBeforeAllowance = fixedSheetsPerUnit > 0
        ? fixedSheetsPerUnit
        : partsPerSheet > 0
          ? 1 / partsPerSheet
          : parentArea > 0
            ? signArea / parentArea
            : 0;
      const sheetsUsed = sheetsBeforeAllowance * allowance * waste;
      const rate = costRateFor(material, "sheet");

      return [costBreakdownItem({
        componentLabel,
        materialName: material.name,
        basis: fixedSheetsPerUnit > 0 ? "Fixed sheets used" : partsPerSheet > 0 ? "Sheet yield used" : "Part sheet used",
        amount: sheetsUsed,
        unit: "sheet",
        rate: rate.rate,
        cost: sheetsUsed * rate.rate,
        note: fixedSheetsPerUnit > 0
          ? "fixed sheets per item set on product usage"
          : partsPerSheet > 0
            ? `1 parent sheet makes ${formatUsage(partsPerSheet)} item${partsPerSheet === 1 ? "" : "s"}`
            : parentArea > 0 ? `based on ${formatUsage(parentArea)} sqm parent sheet` : "sheet dimensions missing"
      })];
    });
}

function autoUnitPriceFor(product: QuoteProduct | undefined, materials: QuoteMaterial[], answers: Record<string, string>): number {
  return componentCostBreakdownFor(product, materials, answers).reduce((total, item) => total + item.cost, 0);
}

function missingLinkedMaterialRows(product: QuoteProduct | undefined, answers: Record<string, string>): QuoteComponent[] {
  if (!product) return [];
  return product.components
    .filter((component) => String(component.kind ?? "material") !== "labour")
    .filter((component) => componentApplies(component, answers))
    .filter((component) => !["sell_sqm", "sell_each"].includes(String(component.ruleType ?? component.stockUsage?.usageBasis ?? "")))
    .filter((component) => !component.materialId);
}

export function QuoteLineBuilder({ quoteId, products, materials }: QuoteLineBuilderProps) {
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId),
    [products, selectedProductId]
  );
  const [answers, setAnswers] = useState<Record<string, string>>(() => defaultAnswersFor(products[0]));
  const [manualSummary, setManualSummary] = useState("");
  const [unitPrice, setUnitPrice] = useState("0.00");
  const [unitPriceOverridden, setUnitPriceOverridden] = useState(false);

  const visibleFields = useMemo(
    () => (selectedProduct?.fields ?? []).filter((field) => isVisible(field, answers)),
    [selectedProduct, answers]
  );

  const quantityField = visibleFields.find((field) => field.type === "quantity" || field.key === "quantity");
  const quantity = quantityField ? answers[quantityField.key] || String(quantityField.defaultValue ?? "1") : "1";
  const quantityNumber = Math.max(1, numberValue(quantity, 1));
  const autoSummary = selectedProduct && selectedProduct.fields.length > 0 ? summaryFor(selectedProduct.fields, answers) : manualSummary;
  const materialBreakdown = useMemo(() => componentCostBreakdownFor(selectedProduct, materials, answers), [selectedProduct, materials, answers]);
  const missingMaterials = useMemo(() => missingLinkedMaterialRows(selectedProduct, answers), [selectedProduct, answers]);
  const autoUnitPrice = useMemo(() => autoUnitPriceFor(selectedProduct, materials, answers), [selectedProduct, materials, answers]);
  const autoLineTotal = autoUnitPrice * quantityNumber;

  useEffect(() => {
    if (!unitPriceOverridden) {
      setUnitPrice(moneyInput(autoUnitPrice));
    }
  }, [autoUnitPrice, unitPriceOverridden]);

  function handleProductChange(productId: string) {
    const nextProduct = products.find((product) => product.id === productId);
    setSelectedProductId(productId);
    setAnswers(defaultAnswersFor(nextProduct));
    setManualSummary("");
    setUnitPriceOverridden(false);
  }

  function updateAnswer(key: string, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function useAutoPrice() {
    setUnitPrice(moneyInput(autoUnitPrice));
    setUnitPriceOverridden(false);
  }

  if (products.length === 0) {
    return (
      <div style={{ border: "1px solid #fedf89", background: "#fffcf5", borderRadius: 16, padding: 16, display: "grid", gap: 6 }}>
        <strong>No products available yet.</strong>
        <p style={mutedStyle}>Create a product first, then add quote questions and material rows on the Products page.</p>
      </div>
    );
  }

  return (
    <form action={addQuoteLineAction} style={{ display: "grid", gap: 14 }}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="productId" value={selectedProductId} />
      <input type="hidden" name="optionSummary" value={autoSummary} />
      {quantityField ? <input type="hidden" name="quantity" value={quantity || "1"} /> : null}

      <label style={labelStyle}>
        <span style={labelTextStyle}>1. Select product</span>
        <select value={selectedProductId} onChange={(event) => handleProductChange(event.target.value)} style={inputStyle}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>{product.name}</option>
          ))}
        </select>
      </label>

      <div style={quotePanelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <strong>2. Answer quote cards</strong>
            <p style={{ ...mutedStyle, marginTop: 4 }}>These are the quote cards created on the Products page. The price below can include material usage, roll length, ink per m² and fixed charges.</p>
          </div>
          <span style={chipStyle}>{visibleFields.length} option{visibleFields.length === 1 ? "" : "s"}</span>
        </div>

        {selectedProduct && selectedProduct.fields.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {visibleFields.map((field) => {
              const value = answers[field.key] ?? String(field.defaultValue ?? "");

              if (["select", "size_select", "color", "yes_no"].includes(field.type)) {
                const choices = field.type === "yes_no" && (!field.options || field.options.length === 0)
                  ? [
                      { label: "Yes", value: "yes" },
                      { label: "No", value: "no" }
                    ]
                  : field.options ?? [];

                return (
                  <label key={field.id ?? field.key} style={labelStyle}>
                    <span style={labelTextStyle}>{field.label}{field.required === false ? "" : " *"}</span>
                    <select
                      name={field.key === "quantity" ? "quantity" : `option_${field.key}`}
                      value={value}
                      required={field.required !== false}
                      onChange={(event) => updateAnswer(field.key, event.target.value)}
                      style={inputStyle}
                    >
                      {choices.length === 0 ? <option value="">No choices set up</option> : null}
                      {choices.map((choice) => {
                        const choiceValue = String(choice.value ?? choice.label ?? "");
                        const label = choice.label ?? humanize(choiceValue);
                        return <option key={choice.id ?? choiceValue} value={choiceValue}>{label}</option>;
                      })}
                    </select>
                    {field.helpText ? <small style={{ color: "#667085" }}>{field.helpText}</small> : null}
                  </label>
                );
              }

              if (needsTextInput(field.type)) {
                return (
                  <label key={field.id ?? field.key} style={labelStyle}>
                    <span style={labelTextStyle}>{field.label}{field.required === false ? "" : " *"}</span>
                    <input
                      name={field.key === "quantity" ? "quantity" : `option_${field.key}`}
                      type={inputTypeFor(field.type)}
                      min={field.type === "quantity" ? "1" : undefined}
                      step="any"
                      value={value}
                      required={field.required !== false}
                      onChange={(event) => updateAnswer(field.key, event.target.value)}
                      style={inputStyle}
                    />
                    {field.helpText ? <small style={{ color: "#667085" }}>{field.helpText}</small> : null}
                  </label>
                );
              }

              return (
                <label key={field.id ?? field.key} style={labelStyle}>
                  <span style={labelTextStyle}>{field.label}</span>
                  <input
                    name={`option_${field.key}`}
                    value={value}
                    onChange={(event) => updateAnswer(field.key, event.target.value)}
                    style={inputStyle}
                  />
                </label>
              );
            })}
          </div>
        ) : (
          <label style={labelStyle}>
            <span style={labelTextStyle}>Manual option summary</span>
            <input
              value={manualSummary}
              onChange={(event) => setManualSummary(event.target.value)}
              placeholder="eg 600x900, direct print, matt laminate"
              style={inputStyle}
            />
            <small style={{ color: "#667085" }}>This product has no quote questions yet. Add them on the Products page for proper dropdowns.</small>
          </label>
        )}
      </div>

      <div style={{ ...quotePanelStyle, background: "#ffffff" }}>
        <strong>3. Calculated price</strong>
        <div style={{ display: "grid", gridTemplateColumns: quantityField ? "1fr" : "1fr 1fr", gap: 10 }}>
          {!quantityField ? (
            <label style={labelStyle}>
              <span style={labelTextStyle}>Quantity</span>
              <input name="quantity" defaultValue="1" type="number" min="1" step="any" style={inputStyle} />
            </label>
          ) : null}
          <label style={labelStyle}>
            <span style={labelTextStyle}>Unit price</span>
            <input
              name="unitPrice"
              value={unitPrice}
              type="number"
              min="0"
              step="0.01"
              onChange={(event) => {
                setUnitPrice(event.target.value);
                setUnitPriceOverridden(true);
              }}
              style={inputStyle}
            />
          </label>
        </div>

        <div style={priceCardStyle}>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#067647", textTransform: "uppercase", letterSpacing: "0.05em" }}>Calculated from product setup</span>
          <strong>{formatMoney(autoUnitPrice)} per unit · {formatMoney(autoLineTotal)} line calculated cost at qty {formatUsage(quantityNumber)}</strong>
          {materialBreakdown.length > 0 ? (
            <div style={{ display: "grid", gap: 6 }}>
              {materialBreakdown.map((item) => (
                <div key={`${item.componentLabel}-${item.materialName}`} style={{ color: "#344054", fontSize: 13 }}>
                  <b>{item.componentLabel}</b>: {item.materialName} · {item.basis} {formatUsage(item.amount)} {item.unit} × {formatMoney(item.rate)}/{item.unit} = <b>{formatMoney(item.cost)}</b>
                  {item.note ? <span style={{ color: "#667085" }}> · {item.note}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <span style={{ color: "#667085", fontSize: 13 }}>No automatic price yet. Add answer lines on the Products page with material usage or simple charges such as ink at dollars per m².</span>
          )}
          {missingMaterials.length > 0 ? (
            <span style={{ color: "#b54708", fontSize: 13 }}>
              Missing linked material for: {missingMaterials.map((component) => component.label ?? "material row").join(", ")}.
            </span>
          ) : null}
          {unitPriceOverridden ? <button type="button" onClick={useAutoPrice} style={secondaryButtonStyle}>Use calculated price</button> : null}
        </div>

        <label style={labelStyle}>
          <span style={labelTextStyle}>Line notes</span>
          <textarea name="notes" placeholder="Optional notes for this line" style={textareaStyle} />
        </label>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#f8fafc", display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#344054", textTransform: "uppercase", letterSpacing: "0.05em" }}>Selected summary</span>
          <span style={{ color: autoSummary ? "#111827" : "#667085" }}>{autoSummary || "No options selected yet"}</span>
        </div>
      </div>

      <button type="submit" style={buttonStyle}>Add quote line</button>
    </form>
  );
}
