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

type QuantityPreset = {
  id?: string | null;
  label?: string | null;
  value?: string | null;
  qty?: string | number | null;
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
    quantitySource?: string | null;
    quantityPrompt?: string | null;
    quantityPresets?: QuantityPreset[] | null;
    allowCustomQuantity?: boolean | null;
    customQuantityLabel?: string | null;
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
  const text = String(value ?? "").replace(/,/g, "").replace(/\$/g, "").trim();
  if (!text) return fallback;
  const amount = Number(text);
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

function normalizedQuestionType(field: Pick<QuoteQuestion, "type" | "key" | "label" | "options">): string {
  const rawType = String(field.type ?? "text").trim().toLowerCase();
  const keyLabel = `${field.key ?? ""} ${field.label ?? ""}`.toLowerCase();
  const choices = Array.isArray(field.options) ? field.options : [];

  if (["multi_select", "multi", "multi_choice", "multiple", "checkbox", "checkboxes", "checkbox_group", "tick_multiple", "tick_multiple_choices"].includes(rawType)) {
    return "multi_select";
  }

  // Backwards-compatible safety: old Finishing questions may already exist in the DB as
  // normal dropdowns. Finishing is almost always "tick all that apply", so render it as
  // multi-choice on quotes when it has multiple answers.
  if (keyLabel.includes("finishing") && choices.length > 1) {
    return "multi_select";
  }

  return rawType || "text";
}

function isMultiSelectField(field: Pick<QuoteQuestion, "type" | "key" | "label" | "options">): boolean {
  return normalizedQuestionType(field) === "multi_select";
}

function defaultAnswersFor(product: QuoteProduct | undefined): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of product?.fields ?? []) {
    const defaultValue = String(field.defaultValue ?? "");
    const firstChoice = isMultiSelectField(field) ? "" : (field.options?.[0]?.value ? String(field.options[0].value) : "");
    next[field.key] = defaultValue || firstChoice;
  }
  return next;
}

function selectedChoice(field: QuoteQuestion, value: string): QuoteChoice | undefined {
  return field.options?.find((option) => String(option.value ?? option.label ?? "") === value);
}

function selectedValues(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isNoneChoice(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["none", "no", "no extra cost", "not required", "n/a", "na"].includes(normalized);
}

function followUpKey(optionKey: string | null | undefined, optionValue: string | null | undefined): string {
  return `${String(optionKey ?? "").trim()}::${String(optionValue ?? "").trim()}`;
}

function firstTriggeredOptionValue(component: QuoteComponent): string {
  const triggerValues = Array.isArray(component.trigger?.optionValues) ? component.trigger?.optionValues ?? [] : [];
  const stockValues = Array.isArray(component.stockUsage?.optionValues) ? component.stockUsage?.optionValues ?? [] : [];
  return String(triggerValues[0] ?? stockValues[0] ?? "");
}

function quantityPresetsFor(component: QuoteComponent): QuantityPreset[] {
  return Array.isArray(component.stockUsage?.quantityPresets) ? component.stockUsage?.quantityPresets ?? [] : [];
}

function componentHasFollowUp(component: QuoteComponent): boolean {
  return String(component.stockUsage?.quantitySource ?? "") === "follow_up" ||
    Boolean(component.stockUsage?.quantityPrompt) ||
    quantityPresetsFor(component).length > 0 ||
    Boolean(component.stockUsage?.allowCustomQuantity);
}

function presetValue(preset: QuantityPreset): string {
  return String(preset.value ?? preset.label ?? "").trim();
}

function presetQuantity(preset: QuantityPreset): number {
  const rawQty = String(preset.qty ?? "").trim();
  if (rawQty.toLowerCase() === "custom") return 0;
  return Math.max(0, numberValue(rawQty, 0));
}

type FollowUpOption = {
  key: string;
  fieldKey: string;
  optionValue: string;
  answerLabel: string;
  prompt: string;
  presets: QuantityPreset[];
  allowCustom: boolean;
  customLabel: string;
};

function followUpsForField(product: QuoteProduct | undefined, field: QuoteQuestion, answers: Record<string, string>): FollowUpOption[] {
  if (!product) return [];
  const fieldKey = String(field.key ?? "");
  const values = selectedValues(answers[fieldKey] ?? "");
  const activeValues = values.length > 0 ? values : [String(answers[fieldKey] ?? "")].filter(Boolean);

  return activeValues.flatMap((optionValue) => {
    const component = product.components.find((item) => {
      const key = String(item.trigger?.optionKey ?? item.stockUsage?.optionKey ?? "");
      const optionValues = Array.isArray(item.trigger?.optionValues) ? item.trigger?.optionValues ?? [] : Array.isArray(item.stockUsage?.optionValues) ? item.stockUsage?.optionValues ?? [] : [];
      return key === fieldKey && optionValues.includes(optionValue) && componentHasFollowUp(item);
    });
    if (!component) return [];
    const choice = selectedChoice(field, optionValue);
    const presets = quantityPresetsFor(component);
    const prompt = String(component.stockUsage?.quantityPrompt ?? "").trim() || `${String(choice?.label ?? optionValue)} quantity`;
    return [{
      key: followUpKey(fieldKey, optionValue),
      fieldKey,
      optionValue,
      answerLabel: String(choice?.label ?? optionValue).replace(/_/g, " "),
      prompt,
      presets,
      allowCustom: Boolean(component.stockUsage?.allowCustomQuantity),
      customLabel: String(component.stockUsage?.customQuantityLabel ?? "Custom quantity")
    }];
  });
}

function followUpSelectionLabel(followUp: FollowUpOption, followUpAnswers: Record<string, string>, customFollowUpAnswers: Record<string, string>): string {
  const selected = followUpAnswers[followUp.key] || presetValue(followUp.presets[0]) || (followUp.allowCustom ? "__custom" : "");
  if (selected === "__custom") {
    const customQty = customFollowUpAnswers[followUp.key] || "";
    return customQty ? `${followUp.customLabel}: ${customQty}` : followUp.customLabel;
  }
  const preset = followUp.presets.find((item) => presetValue(item) === selected);
  return String(preset?.label ?? selected).trim();
}

function followUpMultiplierFor(component: QuoteComponent, followUpAnswers: Record<string, string>, customFollowUpAnswers: Record<string, string>): { multiplier: number; note?: string } {
  if (!componentHasFollowUp(component)) return { multiplier: 1 };
  const optionKey = String(component.trigger?.optionKey ?? component.stockUsage?.optionKey ?? "");
  const optionValue = firstTriggeredOptionValue(component);
  const key = followUpKey(optionKey, optionValue);
  const presets = quantityPresetsFor(component);
  const selected = followUpAnswers[key] || presetValue(presets[0]) || (component.stockUsage?.allowCustomQuantity ? "__custom" : "");

  if (selected === "__custom" || presets.length === 0) {
    const customQty = Math.max(0, numberValue(customFollowUpAnswers[key], 0));
    return { multiplier: customQty, note: customQty > 0 ? `${customQty} custom qty` : "custom qty missing" };
  }

  const preset = presets.find((item) => presetValue(item) === selected);
  const qty = preset ? presetQuantity(preset) : 1;
  const label = String(preset?.label ?? component.stockUsage?.quantityPrompt ?? "quantity preset").trim();
  return { multiplier: qty > 0 ? qty : 1, note: label ? `${label} = ${formatUsage(qty > 0 ? qty : 1)}` : undefined };
}

function answerLabel(field: QuoteQuestion, value: string): string {
  if (isMultiSelectField(field)) {
    const labels = selectedValues(value).map((item) => {
      const matched = selectedChoice(field, item);
      return String(matched?.label ?? item).replace(/_/g, " ");
    });
    return labels.join(", ");
  }
  const matched = selectedChoice(field, value);
  const label = String(matched?.label ?? value ?? "").trim();
  return label.replace(/_/g, " ");
}

function isVisible(field: QuoteQuestion, answers: Record<string, string>): boolean {
  const showWhen = field.showWhen;
  const optionKey = String(showWhen?.optionKey ?? "");
  if (!optionKey) return true;

  const requiredValues = Array.isArray(showWhen?.optionValues) ? showWhen?.optionValues ?? [] : [];
  const currentAnswers = selectedValues(answers[optionKey] ?? "");
  if (requiredValues.length === 0) return currentAnswers.length > 0;
  return requiredValues.some((required) => currentAnswers.includes(required));
}

function summaryFor(product: QuoteProduct | undefined, fields: QuoteQuestion[], answers: Record<string, string>, followUpAnswers: Record<string, string>, customFollowUpAnswers: Record<string, string>): string {
  return fields
    .filter((field) => isVisible(field, answers))
    .filter((field) => field.type !== "quantity" && field.key !== "quantity")
    .map((field) => {
      const value = answers[field.key] ?? "";
      if (!value) return "";
      const followUps = followUpsForField(product, field, answers);
      const values = isMultiSelectField(field) ? selectedValues(value) : [value];
      const followUpText = values
        .filter(Boolean)
        .map((item) => {
          const followUp = followUps.find((entry) => entry.optionValue === item);
          if (followUp) return `${followUp.answerLabel} (${followUpSelectionLabel(followUp, followUpAnswers, customFollowUpAnswers)})`;
          const matched = selectedChoice(field, item);
          return String(matched?.label ?? item).replace(/_/g, " ");
        })
        .join(", ");
      return `${field.label}: ${followUpText}`;
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

  const currentAnswers = selectedValues(answers[triggerKey] ?? "");
  const requiredValues = Array.isArray(component.trigger?.optionValues) ? component.trigger?.optionValues ?? [] : [];
  if (requiredValues.length === 0) return currentAnswers.length > 0;
  return requiredValues.some((required) => currentAnswers.includes(required));
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

function componentCostBreakdownFor(product: QuoteProduct | undefined, materials: QuoteMaterial[], answers: Record<string, string>, followUpAnswers: Record<string, string> = {}, customFollowUpAnswers: Record<string, string> = {}): CostBreakdownItem[] {
  if (!product) return [];

  return product.components
    .filter((component) => componentApplies(component, answers))
    .flatMap((component): CostBreakdownItem[] => {
      const rawRuleType = String(component.ruleType ?? component.stockUsage?.usageBasis ?? "yield_based");
      const dimensions = dimensionsForComponent(product.fields, answers, component);
      const baseAllowance = componentAllowance(component);
      const followUp = followUpMultiplierFor(component, followUpAnswers, customFollowUpAnswers);
      const allowance = baseAllowance * followUp.multiplier;
      const waste = wasteMultiplier(component);
      const componentLabel = String(component.stockUsage?.chargeName ?? component.label ?? "Material");

      if (rawRuleType === "choice_only") {
        return [];
      }

      if (rawRuleType === "sell_sqm") {
        const area = dimensions ? (dimensions.widthMm / 1000) * (dimensions.heightMm / 1000) : 0;
        const rate = numberValue(component.stockUsage?.sellRate, numberValue(component.quantity, 0));
        // Sell charges store the dollar rate in stockUsage.sellRate. Some older rows
        // also stored that same rate in component.quantity, so never use
        // component.quantity as a square-metre multiplier here. The amount is just
        // finished area, optionally multiplied by a follow-up quantity preset.
        const amount = area * followUp.multiplier;
        return [costBreakdownItem({
          componentLabel,
          materialName: "Sell charge",
          basis: "Square metre charge",
          amount,
          unit: "sqm",
          rate,
          cost: amount * rate,
          note: ["price rule from product answer line", followUp.note].filter(Boolean).join(" · ")
        })];
      }

      if (rawRuleType === "sell_each") {
        const rate = numberValue(component.stockUsage?.sellRate, numberValue(component.quantity, 0));
        // For fixed sell charges, component.quantity is the fallback rate for
        // older recipe rows. Quantity/placement presets control how many are
        // charged. Without a preset, charge one item.
        const amount = followUp.multiplier;
        return [costBreakdownItem({
          componentLabel,
          materialName: "Sell charge",
          basis: "Fixed charge",
          amount,
          unit: "each",
          rate,
          cost: amount * rate,
          note: ["price rule from product recipe row", followUp.note].filter(Boolean).join(" · ")
        })];
      }

      if (rawRuleType === "labour_hours") {
        const hours = allowance;
        const rate = numberValue(component.stockUsage?.sellRate, 66);
        return [costBreakdownItem({
          componentLabel,
          materialName: "Factory labour",
          basis: "Hours",
          amount: hours,
          unit: "hr",
          rate,
          cost: hours * rate,
          note: ["factory labour row from product setup", followUp.note].filter(Boolean).join(" · ")
        })];
      }

      if (rawRuleType === "outsourced_each") {
        const amount = allowance;
        const rate = numberValue(component.stockUsage?.sellRate, 0);
        return [costBreakdownItem({
          componentLabel,
          materialName: "Outsourced / supplier",
          basis: "Supplier item",
          amount,
          unit: "each",
          rate,
          cost: amount * rate,
          note: ["outsourced row from product setup", followUp.note].filter(Boolean).join(" · ")
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
          note: [fixedSheetsPerUnit > 0 ? "fixed sheets per item set on product usage" : undefined, followUp.note, rate.note].filter(Boolean).join(" · ")
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

function autoUnitPriceFor(product: QuoteProduct | undefined, materials: QuoteMaterial[], answers: Record<string, string>, followUpAnswers: Record<string, string>, customFollowUpAnswers: Record<string, string>): number {
  return componentCostBreakdownFor(product, materials, answers, followUpAnswers, customFollowUpAnswers).reduce((total, item) => total + item.cost, 0);
}

function missingLinkedMaterialRows(product: QuoteProduct | undefined, answers: Record<string, string>): QuoteComponent[] {
  if (!product) return [];
  return product.components
    .filter((component) => String(component.kind ?? "material") !== "labour")
    .filter((component) => componentApplies(component, answers))
    .filter((component) => !["sell_sqm", "sell_each", "labour_hours", "outsourced_each"].includes(String(component.ruleType ?? component.stockUsage?.usageBasis ?? "")))
    .filter((component) => !component.materialId);
}

export function QuoteLineBuilder({ quoteId, products, materials }: QuoteLineBuilderProps) {
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId),
    [products, selectedProductId]
  );
  const [answers, setAnswers] = useState<Record<string, string>>(() => defaultAnswersFor(products[0]));
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [customFollowUpAnswers, setCustomFollowUpAnswers] = useState<Record<string, string>>({});
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
  const autoSummary = selectedProduct && selectedProduct.fields.length > 0 ? summaryFor(selectedProduct, selectedProduct.fields, answers, followUpAnswers, customFollowUpAnswers) : manualSummary;
  const materialBreakdown = useMemo(() => componentCostBreakdownFor(selectedProduct, materials, answers, followUpAnswers, customFollowUpAnswers), [selectedProduct, materials, answers, followUpAnswers, customFollowUpAnswers]);
  const missingMaterials = useMemo(() => missingLinkedMaterialRows(selectedProduct, answers), [selectedProduct, answers]);
  const autoUnitPrice = useMemo(() => autoUnitPriceFor(selectedProduct, materials, answers, followUpAnswers, customFollowUpAnswers), [selectedProduct, materials, answers, followUpAnswers, customFollowUpAnswers]);
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
    setFollowUpAnswers({});
    setCustomFollowUpAnswers({});
    setManualSummary("");
    setUnitPriceOverridden(false);
  }

  function updateAnswer(key: string, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function toggleMultiAnswer(key: string, value: string, checked: boolean) {
    setAnswers((current) => {
      const currentValues = selectedValues(current[key]);
      let nextValues = checked
        ? Array.from(new Set([...currentValues, value]))
        : currentValues.filter((item) => item !== value);

      if (checked && isNoneChoice(value)) {
        nextValues = [value];
      } else if (checked) {
        nextValues = nextValues.filter((item) => !isNoneChoice(item));
      }

      return { ...current, [key]: nextValues.join(",") };
    });
  }

  function useAutoPrice() {
    setUnitPrice(moneyInput(autoUnitPrice));
    setUnitPriceOverridden(false);
  }


  function updateFollowUp(key: string, value: string) {
    setFollowUpAnswers((current) => ({ ...current, [key]: value }));
  }

  function updateCustomFollowUp(key: string, value: string) {
    setCustomFollowUpAnswers((current) => ({ ...current, [key]: value }));
  }

  function renderFollowUps(field: QuoteQuestion) {
    const followUps = followUpsForField(selectedProduct, field, answers);
    if (followUps.length === 0) return null;

    return (
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {followUps.map((followUp) => {
          const selected = followUpAnswers[followUp.key] || presetValue(followUp.presets[0]) || (followUp.allowCustom ? "__custom" : "");
          return (
            <div key={followUp.key} style={{ border: "1px solid #dbe7f5", borderRadius: 12, padding: 10, background: "#f8fafc", display: "grid", gap: 8 }}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>{followUp.prompt}</span>
                {followUp.presets.length > 0 || followUp.allowCustom ? (
                  <select value={selected} onChange={(event) => updateFollowUp(followUp.key, event.target.value)} style={inputStyle}>
                    {followUp.presets.map((preset) => {
                      const value = presetValue(preset);
                      const label = String(preset.label ?? value);
                      const qty = String(preset.qty ?? "");
                      return <option key={value || label} value={value}>{qty && qty !== "custom" ? `${label} (${qty})` : label}</option>;
                    })}
                    {followUp.allowCustom && !followUp.presets.some((preset) => presetValue(preset) === "__custom") ? <option value="__custom">{followUp.customLabel}</option> : null}
                  </select>
                ) : (
                  <input type="number" step="any" min="0" value={customFollowUpAnswers[followUp.key] ?? ""} onChange={(event) => updateCustomFollowUp(followUp.key, event.target.value)} style={inputStyle} />
                )}
              </label>
              {selected === "__custom" ? (
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Quantity</span>
                  <input type="number" step="any" min="0" value={customFollowUpAnswers[followUp.key] ?? ""} onChange={(event) => updateCustomFollowUp(followUp.key, event.target.value)} placeholder="eg 6" style={inputStyle} />
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
    );
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
              const fieldType = normalizedQuestionType(field);
              const value = answers[field.key] ?? String(field.defaultValue ?? "");

              if (fieldType === "multi_select") {
                const choices = field.options ?? [];
                const checkedValues = selectedValues(value);

                return (
                  <fieldset key={field.id ?? field.key} style={{ ...labelStyle, border: "1px solid #dfe7f2", borderRadius: 14, padding: 12, background: "#fff" }}>
                    <legend style={labelTextStyle}>{field.label}{field.required === false ? "" : " *"}</legend>
                    <input type="hidden" name={`option_${field.key}`} value={value} />
                    {choices.length === 0 ? <small style={{ color: "#667085" }}>No choices set up</small> : null}
                    <div style={{ display: "grid", gap: 8 }}>
                      {choices.map((choice) => {
                        const choiceValue = String(choice.value ?? choice.label ?? "");
                        const label = choice.label ?? humanize(choiceValue);
                        const checked = checkedValues.includes(choiceValue);
                        return (
                          <label key={choice.id ?? choiceValue} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => toggleMultiAnswer(field.key, choiceValue, event.target.checked)}
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {renderFollowUps(field)}
                    {field.helpText ? <small style={{ color: "#667085" }}>{field.helpText}</small> : null}
                  </fieldset>
                );
              }

              if (["select", "size_select", "color", "yes_no"].includes(fieldType)) {
                const choices = fieldType === "yes_no" && (!field.options || field.options.length === 0)
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
                    {renderFollowUps(field)}
                    {field.helpText ? <small style={{ color: "#667085" }}>{field.helpText}</small> : null}
                  </label>
                );
              }

              if (needsTextInput(fieldType)) {
                return (
                  <label key={field.id ?? field.key} style={labelStyle}>
                    <span style={labelTextStyle}>{field.label}{field.required === false ? "" : " *"}</span>
                    <input
                      name={field.key === "quantity" ? "quantity" : `option_${field.key}`}
                      type={inputTypeFor(fieldType)}
                      min={fieldType === "quantity" ? "1" : undefined}
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
          <span style={{ fontSize: 12, fontWeight: 900, color: "#344054", textTransform: "uppercase", letterSpacing: "0.05em" }}>Current unsaved line</span>
          <span style={{ color: autoSummary ? "#111827" : "#667085" }}>{autoSummary || "No options selected yet"}</span>
        </div>
      </div>

      <button type="submit" style={buttonStyle}>Save current line to quote</button>
    </form>
  );
}
