"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { saveQuoteLineAsProductAction, updateQuoteLineAction } from "./actions";
import { availableQuoteChoices, quoteChoiceValue, splitQuoteAnswerValues } from "./quoteOptionDependencies";
import {
  calculateQuoteProductPricing,
  type QuoteChoice,
  type QuoteProduct,
  type QuoteQuestion
} from "./QuoteLineBuilder";
import { inferLegacyQuickQuoteSnapshot, readQuickQuoteSnapshot, stepForQuoteSummaryRow, type QuickQuoteStep } from "./quoteLineSnapshot";
import { QuoteMaterialFlowBuilder, type PricingSettings as FlowPricingSettings, type QuoteMaterial as FlowQuoteMaterial } from "./QuoteMaterialFlowBuilder";

type QuoteLineEditorChoice = QuoteChoice;
type QuoteLineEditorField = QuoteQuestion;
type QuoteLineEditorProduct = QuoteProduct;

type QuoteLineEditorProps = {
  quoteId: string;
  line: {
    id: string;
    productName: string;
    optionSummary: string | null;
    quantity: string;
    unitPrice: string;
    notes: string | null;
    configurationSnapshot?: unknown;
    createdAt: string | null;
  };
  product?: QuoteLineEditorProduct | null;
  materials: FlowQuoteMaterial[];
  pricingSettings?: FlowPricingSettings;
};

type SummaryRow = { label: string; value: string };

type BreakdownOptionCard =
  | { kind: "line_title"; key: string; label: string; summaryLabel?: string }
  | { kind: "field"; key: string; field: QuoteLineEditorField }
  | { kind: "legacy"; key: string; label: string; rowIndex: number }
  | { kind: "raw_summary"; key: string; label: string };

type BreakdownCardProps = {
  cardKey: string;
  label: string;
  value: string;
  editable?: boolean;
  active: boolean;
  onActivate: (key: string) => void;
  helpText?: string | null;
  children?: ReactNode;
};

function BreakdownCard({ cardKey, label, value, editable = false, active, onActivate, helpText, children }: BreakdownCardProps) {
  return (
    <div
      role={editable && !active ? "button" : undefined}
      tabIndex={editable && !active ? 0 : undefined}
      onClick={editable && !active ? () => onActivate(cardKey) : undefined}
      onKeyDown={editable && !active ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate(cardKey);
        }
      } : undefined}
      style={{
        border: active ? "2px solid #155eef" : editable ? "1px solid #b9cdfc" : "1px solid #e2e8f0",
        borderRadius: 14,
        background: active ? "#f8fbff" : "#fff",
        padding: 10,
        display: "grid",
        gap: 6,
        minHeight: active ? undefined : 82,
        alignContent: "start",
        cursor: editable && !active ? "pointer" : "default",
        boxShadow: active ? "0 0 0 3px rgba(21,94,239,0.08)" : "none",
        gridColumn: active ? "1 / -1" : undefined
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", fontWeight: 950 }}>{label}</span>
        {editable ? <span style={{ borderRadius: 999, background: active ? "#dbeafe" : "#eef4ff", color: "#155eef", padding: "3px 7px", fontSize: 10, fontWeight: 950 }}>{active ? "Editing" : "Edit"}</span> : null}
      </div>
      {!active ? <strong style={{ lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value}</strong> : null}
      <div style={{ display: active ? "grid" : "none", gap: 8 }} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
      {helpText && active ? <small style={{ color: "#667085" }}>{helpText}</small> : null}
    </div>
  );
}

function DoneButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} style={{ minHeight: 36, borderRadius: 10, border: "none", background: "#155eef", color: "#fff", fontWeight: 900, padding: "0 12px", justifySelf: "start", cursor: "pointer" }}>Done</button>;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(date);
}


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
  minHeight: 66,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "12px 14px",
  width: "100%",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
  background: "#fff"
};

const labelStyle = { display: "grid", gap: 6 };
const labelTextStyle = { fontSize: 12, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#475467", fontWeight: 950 };
const buttonStyle = { minHeight: 44, borderRadius: 14, border: "none", background: "#155eef", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 16px" };

function normalise(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function humanize(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/(\d+)x(\d+)/i, "$1 × $2");
}

function parseSummary(summary: string | null | undefined): SummaryRow[] {
  return String(summary ?? "")
    .split(/\s+[·•]\s+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colonIndex = part.indexOf(":");
      if (colonIndex > 0 && colonIndex < 48) {
        return { label: part.slice(0, colonIndex).trim(), value: part.slice(colonIndex + 1).trim() };
      }
      return { label: "Detail", value: part };
    });
}

function normalizedQuestionType(field: QuoteLineEditorField): string {
  const rawType = String(field.type ?? "text").trim().toLowerCase();
  const keyLabel = `${field.key} ${field.label}`.toLowerCase();
  const choices = Array.isArray(field.options) ? field.options : [];

  if (["multi_select", "multi", "multi_choice", "multiple", "checkbox", "checkboxes", "checkbox_group", "tick_multiple", "tick_multiple_choices"].includes(rawType)) {
    return "multi_select";
  }
  if (keyLabel.includes("finishing") && choices.length > 1) return "multi_select";
  return rawType || "text";
}

function baseChoicesForField(field: QuoteLineEditorField): QuoteLineEditorChoice[] {
  if (normalizedQuestionType(field) === "yes_no" && (!field.options || field.options.length === 0)) {
    return [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }];
  }
  return Array.isArray(field.options) ? field.options : [];
}

function availableChoicesForField(field: QuoteLineEditorField, answers: Record<string, string>): QuoteLineEditorChoice[] {
  const baseChoices = baseChoicesForField(field);
  if (baseChoices !== field.options) return baseChoices;
  return availableQuoteChoices(field, answers) as QuoteLineEditorChoice[];
}

function isVisible(field: QuoteLineEditorField, answers: Record<string, string>): boolean {
  const optionKey = String(field.showWhen?.optionKey ?? "").trim();
  if (!optionKey) return true;

  const numericGreaterThan = Number(field.showWhen?.numericGreaterThan);
  if (Number.isFinite(numericGreaterThan)) return (Number(answers[optionKey]) || 0) > numericGreaterThan;
  const selected = splitQuoteAnswerValues(answers[optionKey]);
  const required = Array.isArray(field.showWhen?.optionValues) ? field.showWhen?.optionValues ?? [] : [];
  if (required.length === 0) return selected.length > 0;
  return required.some((value) => selected.some((answer) => normalise(answer) === normalise(value)));
}

function choiceLabel(choice: QuoteLineEditorChoice | undefined, fallback = ""): string {
  return String(choice?.label ?? (choice ? humanize(quoteChoiceValue(choice)) : fallback)).trim();
}

function answerFromSummary(field: QuoteLineEditorField, value: string | undefined): string {
  const source = String(value ?? "").trim();
  if (!source) return String(field.defaultValue ?? "");

  const fieldType = normalizedQuestionType(field);
  const choices = baseChoicesForField(field);
  if (fieldType === "multi_select") {
    return source
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const match = choices.find((choice) => {
          const rawValue = quoteChoiceValue(choice);
          return [rawValue, choice.label, humanize(rawValue)].some((candidate) => normalise(candidate) === normalise(part));
        });
        return match ? quoteChoiceValue(match) : part;
      })
      .join(",");
  }

  if (["select", "size_select", "color", "yes_no"].includes(fieldType)) {
    const match = choices.find((choice) => {
      const rawValue = quoteChoiceValue(choice);
      return [rawValue, choice.label, humanize(rawValue)].some((candidate) => normalise(candidate) === normalise(source));
    });
    return match ? quoteChoiceValue(match) : source;
  }

  return source;
}

function displayAnswer(field: QuoteLineEditorField, value: string): string {
  const fieldType = normalizedQuestionType(field);
  const choices = baseChoicesForField(field);

  if (fieldType === "multi_select") {
    return splitQuoteAnswerValues(value)
      .map((selected) => choiceLabel(choices.find((choice) => quoteChoiceValue(choice) === selected), humanize(selected)))
      .filter(Boolean)
      .join(", ");
  }

  if (["select", "size_select", "color", "yes_no"].includes(fieldType)) {
    return choiceLabel(choices.find((choice) => quoteChoiceValue(choice) === value), humanize(value));
  }

  return value;
}

function sanitiseAnswers(fields: QuoteLineEditorField[], answers: Record<string, string>): Record<string, string> {
  let next = answers;

  for (const field of fields) {
    const currentValue = String(next[field.key] ?? "");
    const baseChoices = baseChoicesForField(field);
    if (!currentValue || baseChoices.length === 0) continue;

    const allowedValues = new Set(availableChoicesForField(field, next).map(quoteChoiceValue));
    if (normalizedQuestionType(field) === "multi_select") {
      const filtered = splitQuoteAnswerValues(currentValue).filter((value) => allowedValues.has(value));
      const joined = filtered.join(",");
      if (joined !== currentValue) next = { ...next, [field.key]: joined };
      continue;
    }

    if (!allowedValues.has(currentValue)) next = { ...next, [field.key]: "" };
  }

  return next;
}

function cleanMoneyInput(value: string): string {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function numberInput(value: string | number | null | undefined, fallback = 0): number {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: string | number | null | undefined): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(numberInput(value));
}

function fieldForKeys(product: QuoteLineEditorProduct, keys: string[]): QuoteLineEditorField | undefined {
  const normalizedKeys = new Set(keys.map((key) => normalise(key).replace(/[^a-z0-9]+/g, "_")));
  return product.fields.find((field) => {
    const key = normalise(field.key).replace(/[^a-z0-9]+/g, "_");
    const label = normalise(field.label).replace(/[^a-z0-9]+/g, "_");
    return normalizedKeys.has(key) || normalizedKeys.has(label);
  });
}

function dimensionsFromText(value: string | null | undefined): { widthMm: number; heightMm: number } | null {
  const text = String(value ?? "").trim();
  const standardSizes: Record<string, { widthMm: number; heightMm: number }> = {
    a0: { widthMm: 841, heightMm: 1189 },
    a1: { widthMm: 594, heightMm: 841 },
    a2: { widthMm: 420, heightMm: 594 },
    a3: { widthMm: 297, heightMm: 420 },
    a4: { widthMm: 210, heightMm: 297 },
    a5: { widthMm: 148, heightMm: 210 },
    a6: { widthMm: 105, heightMm: 148 },
    dl: { widthMm: 99, heightMm: 210 }
  };
  const standard = standardSizes[text.toLowerCase().replace(/[^a-z0-9]/g, "")];
  if (standard) return standard;

  const match = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const widthMm = numberInput(match[1], 0);
  const heightMm = numberInput(match[2], 0);
  return widthMm > 0 && heightMm > 0 ? { widthMm, heightMm } : null;
}

function areaForSizeAnswer(product: QuoteLineEditorProduct, answers: Record<string, string>): number {
  const field = fieldForKeys(product, ["finished_size", "size"]);
  if (!field) return 0;
  const answer = String(answers[field.key] ?? field.defaultValue ?? "");
  const choice = baseChoicesForField(field).find((item) => quoteChoiceValue(item) === answer);
  const widthMm = numberInput(choice?.widthMm, 0);
  const heightMm = numberInput(choice?.heightMm, 0);
  const dimensions = widthMm > 0 && heightMm > 0
    ? { widthMm, heightMm }
    : dimensionsFromText(choice?.label) ?? dimensionsFromText(choice?.value) ?? dimensionsFromText(answer);
  return dimensions ? dimensions.widthMm * dimensions.heightMm : 0;
}

function copyCount(value: string | null | undefined): number {
  const normalized = normalise(value);
  if (normalized.includes("quadruplicate") || normalized === "4" || normalized.includes("4_part")) return 4;
  if (normalized.includes("triplicate") || normalized === "3" || normalized.includes("3_part")) return 3;
  if (normalized.includes("duplicate") || normalized === "2" || normalized.includes("2_part")) return 2;
  return Math.max(1, numberInput(normalized, 1));
}

type SavedPriceScale = {
  available: boolean;
  unitPrice: number;
  explanation: string;
};

function carbonBookSavedPriceScale(
  product: QuoteLineEditorProduct | null | undefined,
  originalAnswers: Record<string, string>,
  currentAnswers: Record<string, string>,
  originalUnitPrice: string
): SavedPriceScale {
  const basePrice = numberInput(originalUnitPrice, 0);
  if (!product || basePrice <= 0) return { available: false, unitPrice: basePrice, explanation: "" };

  const pageField = fieldForKeys(product, ["page_count", "pages", "sets_per_book", "sets"]);
  const copyField = fieldForKeys(product, ["copy_set", "copies", "copy_count"]);
  if (!pageField || !copyField) return { available: false, unitPrice: basePrice, explanation: "" };

  const originalArea = areaForSizeAnswer(product, originalAnswers);
  const currentArea = areaForSizeAnswer(product, currentAnswers);
  const originalPages = Math.max(1, numberInput(originalAnswers[pageField.key] ?? pageField.defaultValue, 1));
  const currentPages = Math.max(1, numberInput(currentAnswers[pageField.key] ?? pageField.defaultValue, 1));
  const originalCopies = copyCount(originalAnswers[copyField.key] ?? copyField.defaultValue);
  const currentCopies = copyCount(currentAnswers[copyField.key] ?? copyField.defaultValue);

  const sizeFactor = originalArea > 0 && currentArea > 0 ? currentArea / originalArea : 1;
  const pageFactor = currentPages / originalPages;
  const copyFactor = currentCopies / originalCopies;
  const factor = sizeFactor * pageFactor * copyFactor;

  return {
    available: Number.isFinite(factor) && factor > 0,
    unitPrice: basePrice * (Number.isFinite(factor) && factor > 0 ? factor : 1),
    explanation: `Size × ${sizeFactor.toFixed(3)} · pages × ${pageFactor.toFixed(3)} · copies × ${copyFactor.toFixed(3)}`
  };
}

function quickStepLabel(step: QuickQuoteStep | null, fallback: string): string {
  if (!step) return fallback === "Detail" ? "Detail" : fallback;
  const labels: Partial<Record<QuickQuoteStep, string>> = {
    flow: "Line type",
    base: "Base product",
    thickness: "Material / substrate",
    colour: "Material / substrate",
    size: "Finished size",
    artwork: "Artwork",
    print: "Print",
    media: "Roll stock / media",
    ink: "Ink",
    sides: "Sides / print direction",
    laminate: "Laminate / backing",
    finishing: "Finishing",
    small_type: "Print item",
    ncr_details: "NCR / book details",
    small_stock: "Material / stock",
    small_size: "Finished size",
    small_sides: "Sides",
    small_print: "Print colour",
    small_coating: "Cello / coating",
    small_finishing: "Finishing",
    small_quantity: "Quantity",
    service_type: "Service",
    service_details: "Service details",
    service_fixings: "Fixings",
    component_details: "Component",
    component_parts: "Parts",
    component_labour: "Labour",
    dispatch: "Pickup / delivery / install",
    review: "Quantity / notes"
  };
  return labels[step] ?? (fallback === "Detail" ? humanize(step) : fallback);
}

function productFamilyForDepartment(department: string): string {
  switch (department) {
    case "small_format":
    case "plan_printing": return "small_format_print";
    case "poster_printing": return "roll_media";
    case "installation":
    case "general": return "display_products";
    default: return "rigid_signage";
  }
}

export function QuoteLineEditor({ quoteId, line, product, materials, pricingSettings }: QuoteLineEditorProps) {
  const quickSnapshot = useMemo(() => {
    if (product) return null;
    return readQuickQuoteSnapshot(line.configurationSnapshot) ?? inferLegacyQuickQuoteSnapshot({
      productName: line.productName,
      optionSummary: line.optionSummary,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      notes: line.notes,
      materials
    });
  }, [product, line.configurationSnapshot, line.productName, line.optionSummary, line.quantity, line.unitPrice, line.notes, materials]);
  const hasStructuredQuickSnapshot = !product && Boolean(quickSnapshot);
  const needsLegacyRebuild = !product && Boolean(quickSnapshot?.reconstructed);
  const summaryRows = useMemo(() => parseSummary(line.optionSummary), [line.optionSummary]);
  const indexedSummaryRows = useMemo(() => summaryRows.map((row, index) => ({ ...row, index })), [summaryRows]);
  const configuredFields = useMemo(() => (product?.fields ?? []).filter((field) => field.key !== "quantity"), [product]);
  const configuredByLabel = useMemo(() => {
    const result = new Map<string, QuoteLineEditorField>();
    configuredFields.forEach((field) => {
      const label = normalise(field.label);
      if (label && !result.has(label)) result.set(label, field);
    });
    return result;
  }, [configuredFields]);
  const initialAnswers = useMemo(() => {
    const valuesByLabel = new Map(summaryRows.map((row) => [normalise(row.label), row.value]));
    const initial = Object.fromEntries(configuredFields.map((field) => [field.key, answerFromSummary(field, valuesByLabel.get(normalise(field.label)))]));
    return sanitiseAnswers(configuredFields, initial);
  }, [configuredFields, summaryRows]);
  const lineTitleSummaryIndex = useMemo(() => {
    const firstRow = indexedSummaryRows[0];
    if (!firstRow) return -1;
    return normalise(firstRow.label) === "detail" && normalise(firstRow.value) === normalise(line.productName) ? firstRow.index : -1;
  }, [indexedSummaryRows, line.productName]);

  const [answers, setAnswers] = useState<Record<string, string>>(() => initialAnswers);
  const [legacyValues] = useState<Record<number, string>>(() => Object.fromEntries(indexedSummaryRows.map((row) => [row.index, row.value])));
  const [rawSummary] = useState(line.optionSummary ?? "");
  const [lineTitle, setLineTitle] = useState(line.productName);
  const [quantity, setQuantity] = useState(line.quantity);
  const [unitPrice, setUnitPrice] = useState(() => cleanMoneyInput(line.unitPrice));
  const [notes, setNotes] = useState(line.notes ?? "");
  const [activeEditor, setActiveEditor] = useState<string | null>(null);
  const [optionsEdited, setOptionsEdited] = useState(false);
  const [showSaveProduct, setShowSaveProduct] = useState(false);
  const [productSaveName, setProductSaveName] = useState(line.productName);
  const [productDepartment, setProductDepartment] = useState(product?.department ?? "signage");
  const [productPricingMode, setProductPricingMode] = useState(product ? "recipe" : "current_price");
  const [createEditableOptions, setCreateEditableOptions] = useState(true);
  const [activeQuickCard, setActiveQuickCard] = useState<string | null>(null);
  const quickComponentCards = useMemo(() => {
    if (!quickSnapshot) return [] as Array<{ key: string; label: string; value: string; step: QuickQuoteStep | null }>;
    const grouped = new Map<string, { key: string; label: string; values: string[]; step: QuickQuoteStep | null }>();
    summaryRows.forEach((row, index) => {
      if (/^qty\s+/i.test(row.value) || normalise(row.label) === "quantity") return;
      const step = stepForQuoteSummaryRow(row.label, row.value, quickSnapshot);
      const groupKey = step ? `step:${step}` : `readonly:${index}`;
      const existing = grouped.get(groupKey);
      if (existing) {
        if (row.value && !existing.values.includes(row.value)) existing.values.push(row.value);
        return;
      }
      grouped.set(groupKey, {
        key: groupKey,
        label: quickStepLabel(step, row.label),
        values: row.value ? [row.value] : [],
        step
      });
    });
    return Array.from(grouped.values()).map((card) => ({ ...card, value: card.values.join(" · ") || "Not set" }));
  }, [quickSnapshot, summaryRows]);

  const visibleFields = configuredFields.filter((field) => isVisible(field, answers));
  const visibleFieldKeys = new Set(visibleFields.map((field) => field.key));
  const quantityNumber = Math.max(0, numberInput(quantity, 0));
  const automaticPricing = useMemo(
    () => calculateQuoteProductPricing(product ?? undefined, materials, answers, pricingSettings, {}, {}, Math.max(1, quantityNumber)),
    [product, materials, answers, pricingSettings, quantityNumber]
  );
  const productSetupPriceAvailable = Boolean(
    product &&
    automaticPricing.unitPrice > 0 &&
    automaticPricing.missingMaterials.length === 0 &&
    automaticPricing.materialBreakdown.some((item) => item.rate > 0 || item.cost > 0)
  );
  const savedPriceScale = useMemo(
    () => carbonBookSavedPriceScale(product, initialAnswers, answers, line.unitPrice),
    [product, initialAnswers, answers, line.unitPrice]
  );
  const recalculationMode = productSetupPriceAvailable ? "product_setup" : savedPriceScale.available ? "saved_price_scale" : "none";
  const recalculatedUnitPrice = productSetupPriceAvailable ? automaticPricing.unitPrice : savedPriceScale.unitPrice;
  const recalculatedLineTotal = recalculatedUnitPrice * quantityNumber;
  const enteredLineTotal = numberInput(unitPrice, 0) * quantityNumber;

  useEffect(() => {
    if (optionsEdited && recalculationMode !== "none") {
      setUnitPrice(recalculatedUnitPrice.toFixed(2));
    }
  }, [optionsEdited, recalculationMode, recalculatedUnitPrice]);

  useEffect(() => {
    if (activeEditor?.startsWith("field:") && !visibleFieldKeys.has(activeEditor.slice("field:".length))) {
      setActiveEditor(null);
    }
  }, [activeEditor, visibleFieldKeys]);

  if (!product && quickSnapshot) {
    const quantityStep: QuickQuoteStep = quickSnapshot.flowType === "small_format" || quickSnapshot.flowType === "plan_printing" || quickSnapshot.flowType === "poster_printing" ? "small_quantity" : "review";
    const inlineEditingLine = {
      id: line.id,
      productName: line.productName,
      optionSummary: line.optionSummary,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      notes: line.notes,
      configurationSnapshot: quickSnapshot,
      reconstructed: Boolean(quickSnapshot.reconstructed)
    };
    const lineTotal = numberInput(line.unitPrice, 0) * Math.max(0, numberInput(line.quantity, 0));

    const inlineCard = (card: { key: string; label: string; value: string; step: QuickQuoteStep | null }) => {
      const active = activeQuickCard === card.key;
      return (
        <BreakdownCard
          key={card.key}
          cardKey={card.key}
          label={card.label}
          value={card.value}
          editable={Boolean(card.step)}
          active={active}
          onActivate={() => card.step && setActiveQuickCard(card.key)}
          helpText={active ? "Change this component here, then save. You stay on the quote." : null}
        >
          {active && card.step ? (
            <QuoteMaterialFlowBuilder
              key={`${line.id}:${card.key}`}
              quoteId={quoteId}
              materials={materials}
              pricingSettings={pricingSettings}
              editingLine={inlineEditingLine}
              editingStep={card.step}
              compactEdit
              onCompactCancel={() => setActiveQuickCard(null)}
            />
          ) : null}
        </BreakdownCard>
      );
    };

    return (
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 12, background: "#f8fafc", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 3 }}>
            <strong>Line components</strong>
            <span style={{ color: "#64748b", fontSize: 13 }}>Click a component card to edit it right here. The old separate quote-line editor is no longer used.</span>
          </div>
          <span style={{ color: "#475467", fontSize: 13 }}>Created {formatDateTime(line.createdAt)}</span>
        </div>

        {quickSnapshot.reconstructed ? (
          <section style={{ border: "1px solid #fed7aa", borderRadius: 14, padding: 11, background: "#fffbeb", display: "grid", gap: 4 }}>
            <strong style={{ color: "#9a3412" }}>Older quote line recovered for inline editing</strong>
            <span style={{ color: "#475467", fontSize: 13 }}>Known values were reconstructed from the old summary. The first component you save converts this line to the current structured format.</span>
          </section>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8, alignItems: "start" }}>
          <BreakdownCard cardKey="line-title-display" label="Line title" value={line.productName || "Not set"} active={false} onActivate={() => {}} />
          {quickComponentCards.map(inlineCard)}
          {inlineCard({ key: "quick-quantity", label: "Quantity", value: line.quantity || "0", step: quantityStep })}
          <BreakdownCard cardKey="quick-unit-price" label="Unit price" value={formatMoney(line.unitPrice)} active={false} onActivate={() => {}} />
          <BreakdownCard cardKey="quick-line-total" label="Line total" value={formatMoney(lineTotal)} active={false} onActivate={() => {}} />
          {inlineCard({ key: "quick-notes", label: "Internal notes", value: line.notes || "No internal notes", step: "review" })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "#64748b", fontSize: 13 }}>Price cards stay calculated. Component changes recalculate from the stored materials, labour and current quote pricing settings.</span>
          <button type="button" onClick={openSaveProduct} style={{ ...buttonStyle, background: "#ffffff", color: "#155eef", border: "1px solid #b9cdfc" }}>Save as reusable product</button>
        </div>

        {showSaveProduct ? (
          <form action={saveQuoteLineAsProductAction} style={{ border: "1px solid #c7d7fe", borderRadius: 18, padding: 14, background: "linear-gradient(135deg,#ffffff,#f4f7ff)", display: "grid", gap: 12 }}>
            <input type="hidden" name="quoteId" value={quoteId} />
            <input type="hidden" name="lineId" value={line.id} />
            <input type="hidden" name="linkedProductId" value="" />
            <input type="hidden" name="productName" value={line.productName} />
            <input type="hidden" name="quantity" value={line.quantity} />
            <input type="hidden" name="unitPrice" value={line.unitPrice} />
            <input type="hidden" name="notes" value={line.notes ?? ""} />
            <input type="hidden" name="optionSummary" value={line.optionSummary ?? ""} />
            <input type="hidden" name="productPricingMode" value="current_price" />
            <input type="hidden" name="productCreateEditableOptions" value={createEditableOptions ? "yes" : "no"} />
            <input type="hidden" name="productSaveMarkupMultiplier" value={String(pricingSettings?.markupMultiplier ?? "1.5")} />
            <input type="hidden" name="productSaveProfitMultiplier" value={String(pricingSettings?.profitMultiplier ?? "1.2")} />
            {summaryRows.map((row, index) => <span key={`quick-save-option-${index}`} style={{ display: "none" }}><input type="hidden" name="optionDetailLabel" value={row.label} /><input type="hidden" name="optionDetailValue" value={row.value} /></span>)}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", flexWrap: "wrap" }}><div><strong>Save this line as a reusable product</strong><div style={{ color: "#64748b", fontSize: 13 }}>Current quote selections become the defaults.</div></div><button type="button" onClick={() => setShowSaveProduct(false)} style={{ border: "1px solid #cfd9e8", borderRadius: 12, background: "#fff", color: "#475467", padding: "7px 10px", fontWeight: 900, cursor: "pointer" }}>Close</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}><label style={labelStyle}><span style={labelTextStyle}>Product name</span><input name="productSaveName" value={productSaveName} onChange={(event) => setProductSaveName(event.target.value)} required style={inputStyle} /></label><label style={labelStyle}><span style={labelTextStyle}>Department</span><select name="productDepartment" value={productDepartment} onChange={(event) => setProductDepartment(event.target.value)} style={inputStyle}><option value="signage">Signage</option><option value="plan_printing">Plan printing</option><option value="poster_printing">Poster printing</option><option value="small_format">Small format</option><option value="installation">Install</option><option value="general">Outsourced / general</option></select></label></div>
            <input type="hidden" name="productFamily" value={productFamilyForDepartment(productDepartment)} />
            <label style={{ display: "flex", gap: 9, alignItems: "start", fontWeight: 850 }}><input type="checkbox" checked={createEditableOptions} onChange={(event) => setCreateEditableOptions(event.target.checked)} /><span>Create editable product options from the current line details</span></label>
            <button type="submit" name="productSaveMode" value="new" style={{ ...buttonStyle, justifySelf: "start" }}>Save as new product</button>
          </form>
        ) : null}
      </div>
    );
  }

  function updateAnswer(key: string, value: string) {
    setOptionsEdited(true);
    setAnswers((current) => sanitiseAnswers(configuredFields, { ...current, [key]: value }));
  }

  function toggleMultiAnswer(field: QuoteLineEditorField, value: string, checked: boolean) {
    setOptionsEdited(true);
    setAnswers((current) => {
      const selected = splitQuoteAnswerValues(current[field.key]);
      const nextValues = checked ? Array.from(new Set([...selected, value])) : selected.filter((item) => item !== value);
      return sanitiseAnswers(configuredFields, { ...current, [field.key]: nextValues.join(",") });
    });
  }

  function finishTextEdit(event: { key: string; preventDefault: () => void }) {
    if (event.key === "Enter") {
      event.preventDefault();
      setActiveEditor(null);
    }
  }

  function openSaveProduct() {
    setProductSaveName(lineTitle.trim() || line.productName);
    setProductDepartment(product?.department ?? productDepartment ?? "signage");
    setProductPricingMode(product ? "recipe" : "current_price");
    setShowSaveProduct(true);
  }

  const optionCards: BreakdownOptionCard[] = [];
  const representedFields = new Set<string>();

  indexedSummaryRows.forEach((row) => {
    if (row.index === lineTitleSummaryIndex) {
      optionCards.push({ kind: "line_title", key: "line-title", label: "Line title", summaryLabel: row.label });
      return;
    }

    const field = configuredByLabel.get(normalise(row.label));
    if (field) {
      if (!visibleFieldKeys.has(field.key) || representedFields.has(field.key)) return;
      representedFields.add(field.key);
      optionCards.push({ kind: "field", key: `field:${field.key}`, field });
      return;
    }

    optionCards.push({ kind: "legacy", key: `legacy:${row.index}`, label: row.label, rowIndex: row.index });
  });

  visibleFields.forEach((field) => {
    if (representedFields.has(field.key)) return;
    representedFields.add(field.key);
    optionCards.push({ kind: "field", key: `field:${field.key}`, field });
  });

  if (!optionCards.some((card) => card.kind === "line_title")) {
    optionCards.unshift({ kind: "line_title", key: "line-title", label: "Line title" });
  }

  if (summaryRows.length === 0 && configuredFields.length === 0) {
    optionCards.push({ kind: "raw_summary", key: "raw-summary", label: "Summary" });
  }

  function renderOptionCard(card: BreakdownOptionCard) {
    if (card.kind === "line_title") {
      const step = quickSnapshot?.flowType === "service" ? "service_type" : quickSnapshot?.flowType === "small_format" ? "small_type" : quickSnapshot?.flowType === "plan_printing" || quickSnapshot?.flowType === "poster_printing" ? "small_stock" : "base";
      if (!product) {
        return (
          <BreakdownCard
            key={card.key}
            cardKey={card.key}
            label={card.label}
            value={lineTitle || "Not set"}
            editable={hasStructuredQuickSnapshot}
            active={false}
            onActivate={() => {}}
          >
            {card.summaryLabel ? (
              <>
                <input type="hidden" name="optionDetailLabel" value={card.summaryLabel} />
                <input type="hidden" name="optionDetailValue" value={lineTitle} />
              </>
            ) : null}
          </BreakdownCard>
        );
      }

      return (
        <BreakdownCard
          key={card.key}
          cardKey={card.key}
          label={card.label}
          value={lineTitle || "Not set"}
          editable
          active={activeEditor === card.key}
          onActivate={setActiveEditor}
        >
          {card.summaryLabel ? (
            <>
              <input type="hidden" name="optionDetailLabel" value={card.summaryLabel} />
              <input type="hidden" name="optionDetailValue" value={lineTitle} />
            </>
          ) : null}
          <input value={lineTitle} onChange={(event) => setLineTitle(event.target.value)} onKeyDown={finishTextEdit} style={inputStyle} />
          <DoneButton onClick={() => setActiveEditor(null)} />
        </BreakdownCard>
      );
    }

    if (card.kind === "legacy") {
      const value = legacyValues[card.rowIndex] ?? "";
      const step = stepForQuoteSummaryRow(card.label, value, quickSnapshot);
      if (!product) {
        return (
          <BreakdownCard
            key={card.key}
            cardKey={card.key}
            label={card.label}
            value={value || "Not set"}
            editable={hasStructuredQuickSnapshot && Boolean(step)}
            active={false}
            onActivate={() => {}}
          >
            <input type="hidden" name="optionDetailLabel" value={card.label} />
            <input type="hidden" name="optionDetailValue" value={value} />
          </BreakdownCard>
        );
      }

      return (
        <BreakdownCard
          key={card.key}
          cardKey={card.key}
          label={card.label}
          value={value || "Not set"}
          active={false}
          onActivate={setActiveEditor}
        >
          <input type="hidden" name="optionDetailLabel" value={card.label} />
          <input type="hidden" name="optionDetailValue" value={value} />
        </BreakdownCard>
      );
    }

    if (card.kind === "raw_summary") {
      if (!product) {
        return (
          <BreakdownCard
            key={card.key}
            cardKey={card.key}
            label={card.label}
            value={rawSummary || "No summary details"}
            editable={hasStructuredQuickSnapshot}
            active={false}
            onActivate={() => {}}
          />
        );
      }

      return (
        <BreakdownCard
          key={card.key}
          cardKey={card.key}
          label={card.label}
          value={rawSummary || "No summary details"}
          active={false}
          onActivate={setActiveEditor}
        />
      );
    }

    const field = card.field;
    const fieldType = normalizedQuestionType(field);
    const value = answers[field.key] ?? "";
    const displayValue = displayAnswer(field, value) || "Not set";
    const choices = availableChoicesForField(field, answers);

    if (fieldType === "multi_select") {
      const selected = splitQuoteAnswerValues(value);
      return (
        <BreakdownCard
          key={card.key}
          cardKey={card.key}
          label={field.label}
          value={displayValue}
          editable
          active={activeEditor === card.key}
          onActivate={setActiveEditor}
          helpText={field.helpText}
        >
          <input type="hidden" name="optionDetailLabel" value={field.label} />
          <input type="hidden" name="optionDetailValue" value={displayAnswer(field, value)} />
          <div style={{ display: "grid", gap: 8 }}>
            {choices.length === 0 ? <span style={{ color: "#b42318", fontSize: 13 }}>No matching options are set up.</span> : null}
            {choices.map((choice) => {
              const choiceValue = quoteChoiceValue(choice);
              return (
                <label key={choice.id ?? choiceValue} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
                  <input type="checkbox" checked={selected.includes(choiceValue)} onChange={(event) => toggleMultiAnswer(field, choiceValue, event.target.checked)} />
                  <span>{choiceLabel(choice, humanize(choiceValue))}</span>
                </label>
              );
            })}
          </div>
          <DoneButton onClick={() => setActiveEditor(null)} />
        </BreakdownCard>
      );
    }

    if (["select", "size_select", "color", "yes_no"].includes(fieldType)) {
      return (
        <BreakdownCard
          key={card.key}
          cardKey={card.key}
          label={field.label}
          value={displayValue}
          editable
          active={activeEditor === card.key}
          onActivate={setActiveEditor}
          helpText={field.helpText}
        >
          <input type="hidden" name="optionDetailLabel" value={field.label} />
          <input type="hidden" name="optionDetailValue" value={displayAnswer(field, value)} />
          <select
           
            value={value}
           
            onChange={(event) => {
              updateAnswer(field.key, event.target.value);
              setActiveEditor(null);
            }}
            style={inputStyle}
          >
            <option value="">Choose {field.label.toLowerCase()}</option>
            {choices.length === 0 ? <option value="">No matching options set up</option> : null}
            {choices.map((choice) => {
              const choiceValue = quoteChoiceValue(choice);
              return <option key={choice.id ?? choiceValue} value={choiceValue}>{choiceLabel(choice, humanize(choiceValue))}</option>;
            })}
          </select>
        </BreakdownCard>
      );
    }

    return (
      <BreakdownCard
        key={card.key}
        cardKey={card.key}
        label={field.label}
        value={displayValue}
        editable
        active={activeEditor === card.key}
        onActivate={setActiveEditor}
        helpText={field.helpText}
      >
        <input type="hidden" name="optionDetailLabel" value={field.label} />
        <input type="hidden" name="optionDetailValue" value={displayAnswer(field, value)} />
        <input
         
          type={["number", "quantity"].includes(fieldType) ? "number" : "text"}
          min={["number", "quantity"].includes(fieldType) ? "0" : undefined}
          step={["number", "quantity"].includes(fieldType) ? "any" : undefined}
          value={value}
         
          onChange={(event) => updateAnswer(field.key, event.target.value)}
          onKeyDown={finishTextEdit}
          style={inputStyle}
        />
        <DoneButton onClick={() => setActiveEditor(null)} />
      </BreakdownCard>
    );
  }

  return (
    <form action={updateQuoteLineAction} style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 12, background: "#f8fafc", display: "grid", gap: 12 }}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="lineId" value={line.id} />
      <input type="hidden" name="linkedProductId" value={product?.id ?? ""} />
      <input type="hidden" name="productName" value={lineTitle} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="unitPrice" value={unitPrice} />
      <input type="hidden" name="notes" value={notes} />
      <input type="hidden" name="optionSummary" value={rawSummary} />
      <input type="hidden" name="productSaveMarkupMultiplier" value={String(pricingSettings?.markupMultiplier ?? "1.5")} />
      <input type="hidden" name="productSaveProfitMultiplier" value={String(pricingSettings?.profitMultiplier ?? "1.2")} />
      {configuredFields.map((field) => (
        <span key={`saved-product-answer-${field.id ?? field.key}`} style={{ display: "none" }}>
          <input type="hidden" name="productOptionKey" value={field.key} />
          <input type="hidden" name="productOptionValue" value={answers[field.key] ?? ""} />
        </span>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 3 }}>
          <strong>Line breakdown</strong>
          <span style={{ color: "#64748b", fontSize: 13 }}>
            {product
              ? "Click an editable card to change it. Available product options and dependent lists are used automatically."
              : hasStructuredQuickSnapshot
                ? "Click a card to reopen the original quick-builder control. Pricing is recalculated from the saved configuration."
                : "This older line contains a finished summary only. Rebuild its options in the quick quote builder rather than editing wording directly."}
          </span>
        </div>
        <span style={{ color: "#475467", fontSize: 13 }}>Created {formatDateTime(line.createdAt)}</span>
      </div>

      {!product ? (
        <section style={{ border: hasStructuredQuickSnapshot ? "1px solid #bfdbfe" : "1px solid #fed7aa", borderRadius: 14, padding: 12, background: hasStructuredQuickSnapshot ? "#eff6ff" : "#fffbeb", display: "grid", gap: 5 }}>
          <strong style={{ color: hasStructuredQuickSnapshot ? "#1d4ed8" : "#9a3412" }}>
            {hasStructuredQuickSnapshot ? "Structured quick-quote line" : "Older line needs its options rebuilt"}
          </strong>
          <span style={{ color: "#475467", fontSize: 13 }}>
            {hasStructuredQuickSnapshot
              ? "Material IDs, sizes, print choices, finishing, labour, dispatch and pricing inputs are preserved. Archived material snapshots remain available for this historical line."
              : "Direct text editing has been removed. The builder will reconstruct the known material, size, print and finishing selections from this summary, then let you confirm or correct them."}
          </span>
        </section>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8, alignItems: "start" }}>
        {optionCards.map(renderOptionCard)}
        {product ? (
          <BreakdownCard
            cardKey="quantity"
            label="Quantity"
            value={quantity || "0"}
            editable
            active={activeEditor === "quantity"}
            onActivate={setActiveEditor}
          >
            <input type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} onKeyDown={finishTextEdit} style={inputStyle} />
            <DoneButton onClick={() => setActiveEditor(null)} />
          </BreakdownCard>
        ) : (
          <BreakdownCard
            cardKey="quantity"
            label="Quantity"
            value={quantity || "0"}
            editable={hasStructuredQuickSnapshot}
            active={false}
            onActivate={() => {}}
          />
        )}
        <BreakdownCard cardKey="unit-price" label="Unit price" value={formatMoney(unitPrice)} active={false} onActivate={setActiveEditor} />
        <BreakdownCard cardKey="line-total" label="Line total" value={formatMoney(enteredLineTotal)} active={false} onActivate={setActiveEditor} />
        {product ? (
          <BreakdownCard
            cardKey="notes"
            label="Internal notes"
            value={notes || "No internal notes"}
            editable
            active={activeEditor === "notes"}
            onActivate={setActiveEditor}
          >
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} style={textareaStyle} />
            <DoneButton onClick={() => setActiveEditor(null)} />
          </BreakdownCard>
        ) : (
          <BreakdownCard
            cardKey="notes"
            label="Internal notes"
            value={notes || "No internal notes"}
            editable={hasStructuredQuickSnapshot}
            active={false}
            onActivate={() => {}}
          />
        )}
      </div>

      {product ? (
        <section style={{ border: recalculationMode !== "none" ? "1px solid #bbf7d0" : "1px solid #fed7aa", borderRadius: 16, padding: 12, background: recalculationMode !== "none" ? "#f0fdf4" : "#fffcf5", display: "grid", gap: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 950, color: recalculationMode !== "none" ? "#067647" : "#b54708", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {recalculationMode === "product_setup" ? "Recalculated from product setup" : recalculationMode === "saved_price_scale" ? "Scaled from the saved Carbon Book price" : "Automatic pricing not available"}
          </span>
          {recalculationMode !== "none" ? (
            <>
              <strong>{formatMoney(recalculatedUnitPrice)} unit price · {formatMoney(recalculatedLineTotal)} line total at qty {quantityNumber}</strong>
              {recalculationMode === "saved_price_scale" ? <span style={{ color: "#475467", fontSize: 13 }}>{savedPriceScale.explanation}. The original {formatMoney(line.unitPrice)} price remains the baseline.</span> : null}
              <span style={{ color: "#475467", fontSize: 13 }}>Unit price and line total are read-only here and follow the saved product pricing setup.</span>
            </>
          ) : (
            <span style={{ color: "#7a2e0e", fontSize: 13 }}>This product has no active material or charge rows and is not a Carbon Book with scalable size/pages/copies, so its existing unit price is preserved.</span>
          )}
        </section>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {product ? <button type="submit" style={buttonStyle}>Save line changes</button> : null}
          <button type="button" onClick={openSaveProduct} style={{ ...buttonStyle, background: "#ffffff", color: "#155eef", border: "1px solid #b9cdfc" }}>Save as reusable product</button>
        </div>
        <span style={{ color: "#64748b", fontSize: 13 }}>
          {product
            ? "Editable cards open in place; calculated price cards stay locked."
            : hasStructuredQuickSnapshot
              ? "Quick-builder lines are changed through their original controls; unit price and line total stay calculated."
              : "Rebuilding replaces the legacy text summary with a structured, recalculating line."}
        </span>
      </div>

      {showSaveProduct ? (
        <section style={{ border: "1px solid #c7d7fe", borderRadius: 18, padding: 14, background: "linear-gradient(135deg,#ffffff,#f4f7ff)", display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <strong style={{ fontSize: 17 }}>{product ? "Reuse or update this saved product" : "Save this quote line as a product"}</strong>
              <span style={{ color: "#64748b", fontSize: 13 }}>Current selections become the defaults. Quote-specific quantity, client details, due dates and notes are not saved to the product.</span>
            </div>
            <button type="button" onClick={() => setShowSaveProduct(false)} style={{ border: "1px solid #cfd9e8", borderRadius: 12, background: "#fff", color: "#475467", padding: "7px 10px", fontWeight: 900, cursor: "pointer" }}>Close</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Product name</span>
              <input name="productSaveName" value={productSaveName} onChange={(event) => setProductSaveName(event.target.value)} required style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Department</span>
              <select name="productDepartment" value={productDepartment} onChange={(event) => setProductDepartment(event.target.value)} style={inputStyle}>
                <option value="signage">Signage</option>
                <option value="plan_printing">Plan printing</option>
                <option value="poster_printing">Poster printing</option>
                <option value="small_format">Small format</option>
                <option value="installation">Install</option>
                <option value="general">Outsourced / general</option>
              </select>
            </label>
          </div>
          <input type="hidden" name="productFamily" value={product?.productFamily ?? productFamilyForDepartment(productDepartment)} />

          {product ? (
            <fieldset style={{ border: "1px solid #dfe7f2", borderRadius: 14, padding: 12, background: "#fff", display: "grid", gap: 9 }}>
              <legend style={labelTextStyle}>Pricing to save</legend>
              <label style={{ display: "flex", gap: 9, alignItems: "start", fontWeight: 850 }}>
                <input type="radio" name="productPricingMode" value="recipe" checked={productPricingMode === "recipe"} onChange={() => setProductPricingMode("recipe")} />
                <span><strong>Keep the product manufacturing method</strong><br /><small style={{ color: "#64748b" }}>Copies the linked materials, labour, charges and available option lists. These selections become its defaults.</small></span>
              </label>
              <label style={{ display: "flex", gap: 9, alignItems: "start", fontWeight: 850 }}>
                <input type="radio" name="productPricingMode" value="current_price" checked={productPricingMode === "current_price"} onChange={() => setProductPricingMode("current_price")} />
                <span><strong>Use the current {formatMoney(unitPrice)} unit price</strong><br /><small style={{ color: "#64748b" }}>Keeps the option lists but replaces the costing method with this quote line's current price basis.</small></span>
              </label>
            </fieldset>
          ) : (
            <section style={{ border: "1px solid #dfe7f2", borderRadius: 14, padding: 12, background: "#fff", display: "grid", gap: 9 }}>
              <input type="hidden" name="productPricingMode" value="current_price" />
              <input type="hidden" name="productCreateEditableOptions" value={createEditableOptions ? "yes" : "no"} />
              <strong>Saved price: {formatMoney(unitPrice)} per unit</strong>
              <label style={{ display: "flex", gap: 9, alignItems: "start", fontWeight: 850 }}>
                <input type="checkbox" checked={createEditableOptions} onChange={(event) => setCreateEditableOptions(event.target.checked)} />
                <span>Create editable dropdowns from the current line details<br /><small style={{ color: "#64748b" }}>The present values become defaults. More choices can be added later on the Products page.</small></span>
              </label>
            </section>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="submit" name="productSaveMode" value="new" formAction={saveQuoteLineAsProductAction} style={{ ...buttonStyle, background: "#155eef" }}>Save as new product</button>
            {product ? (
              <button type="submit" name="productSaveMode" value="update" formAction={saveQuoteLineAsProductAction} style={{ ...buttonStyle, background: productPricingMode === "current_price" ? "#b54708" : "#067647" }}>Update existing product</button>
            ) : null}
            <span style={{ color: "#64748b", fontSize: 12 }}>{product ? "Saving as new leaves the original product untouched. Updating changes the product used by every future quote." : "The new product will appear immediately in Predefined products."}</span>
          </div>
        </section>
      ) : null}
    </form>
  );
}
