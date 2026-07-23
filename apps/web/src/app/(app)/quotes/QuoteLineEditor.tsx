"use client";

import { useEffect, useMemo, useState } from "react";
import { saveQuoteLineAsProductAction, updateQuoteLineAction } from "./actions";
import { availableQuoteChoices, quoteChoiceValue, splitQuoteAnswerValues } from "./quoteOptionDependencies";
import {
  calculateQuoteProductPricing,
  type PricingSettings,
  type QuoteChoice,
  type QuoteMaterial,
  type QuoteProduct,
  type QuoteQuestion
} from "./QuoteLineBuilder";

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
  };
  product?: QuoteLineEditorProduct | null;
  materials: QuoteMaterial[];
  pricingSettings?: PricingSettings;
};

type SummaryRow = { label: string; value: string };

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
  const summaryRows = useMemo(() => parseSummary(line.optionSummary), [line.optionSummary]);
  const configuredFields = useMemo(() => (product?.fields ?? []).filter((field) => field.key !== "quantity"), [product]);
  const configuredLabels = useMemo(() => new Set(configuredFields.map((field) => normalise(field.label))), [configuredFields]);
  const legacyRows = useMemo(() => summaryRows.filter((row) => !configuredLabels.has(normalise(row.label))), [summaryRows, configuredLabels]);
  const initialAnswers = useMemo(() => {
    const valuesByLabel = new Map(summaryRows.map((row) => [normalise(row.label), row.value]));
    const initial = Object.fromEntries(configuredFields.map((field) => [field.key, answerFromSummary(field, valuesByLabel.get(normalise(field.label)))]));
    return sanitiseAnswers(configuredFields, initial);
  }, [configuredFields, summaryRows]);
  const [answers, setAnswers] = useState<Record<string, string>>(() => initialAnswers);
  const [lineTitle, setLineTitle] = useState(line.productName);
  const [quantity, setQuantity] = useState(line.quantity);
  const [unitPrice, setUnitPrice] = useState(() => cleanMoneyInput(line.unitPrice));
  const [optionsEdited, setOptionsEdited] = useState(false);
  const [unitPriceOverridden, setUnitPriceOverridden] = useState(false);
  const [showSaveProduct, setShowSaveProduct] = useState(false);
  const [productSaveName, setProductSaveName] = useState(line.productName);
  const [productDepartment, setProductDepartment] = useState(product?.department ?? "signage");
  const [productPricingMode, setProductPricingMode] = useState(product ? "recipe" : "current_price");
  const [createEditableOptions, setCreateEditableOptions] = useState(true);

  const visibleFields = configuredFields.filter((field) => isVisible(field, answers));
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
    if (optionsEdited && recalculationMode !== "none" && !unitPriceOverridden) {
      setUnitPrice(recalculatedUnitPrice.toFixed(2));
    }
  }, [optionsEdited, recalculationMode, recalculatedUnitPrice, unitPriceOverridden]);

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

  function useRecalculatedPrice() {
    setUnitPrice(recalculatedUnitPrice.toFixed(2));
    setUnitPriceOverridden(false);
  }

  function openSaveProduct() {
    setProductSaveName(lineTitle.trim() || line.productName);
    setProductDepartment(product?.department ?? productDepartment ?? "signage");
    setProductPricingMode(product ? "recipe" : "current_price");
    setShowSaveProduct(true);
  }

  return (
    <form action={updateQuoteLineAction} style={{ border: "1px solid #dbeafe", borderRadius: 16, padding: 12, background: "#f8fbff", display: "grid", gap: 12 }}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="lineId" value={line.id} />
      <input type="hidden" name="linkedProductId" value={product?.id ?? ""} />
      <input type="hidden" name="productSaveMarkupMultiplier" value={String(pricingSettings?.markupMultiplier ?? "1.5")} />
      <input type="hidden" name="productSaveProfitMultiplier" value={String(pricingSettings?.profitMultiplier ?? "1.2")} />
      {configuredFields.map((field) => (
        <span key={`saved-product-answer-${field.id ?? field.key}`} style={{ display: "none" }}>
          <input type="hidden" name="productOptionKey" value={field.key} />
          <input type="hidden" name="productOptionValue" value={answers[field.key] ?? ""} />
        </span>
      ))}

      {product && configuredFields.length > 0 ? (
        <section style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 3 }}>
            <strong>Editable product options</strong>
            <span style={{ color: "#64748b", fontSize: 13 }}>Choose from the options saved on the Products page. Dependent lists update automatically.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            {visibleFields.map((field) => {
              const fieldType = normalizedQuestionType(field);
              const value = answers[field.key] ?? "";

              if (fieldType === "multi_select") {
                const choices = availableChoicesForField(field, answers);
                const selected = splitQuoteAnswerValues(value);
                return (
                  <fieldset key={field.id ?? field.key} style={{ border: "1px solid #dfe7f2", borderRadius: 14, padding: 12, background: "#fff", display: "grid", gap: 8 }}>
                    <legend style={labelTextStyle}>{field.label}</legend>
                    <input type="hidden" name="optionDetailLabel" value={field.label} />
                    <input type="hidden" name="optionDetailValue" value={displayAnswer(field, value)} />
                    {choices.map((choice) => {
                      const choiceValue = quoteChoiceValue(choice);
                      return (
                        <label key={choice.id ?? choiceValue} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
                          <input type="checkbox" checked={selected.includes(choiceValue)} onChange={(event) => toggleMultiAnswer(field, choiceValue, event.target.checked)} />
                          <span>{choiceLabel(choice, humanize(choiceValue))}</span>
                        </label>
                      );
                    })}
                    {field.helpText ? <small style={{ color: "#667085" }}>{field.helpText}</small> : null}
                  </fieldset>
                );
              }

              if (["select", "size_select", "color", "yes_no"].includes(fieldType)) {
                const choices = availableChoicesForField(field, answers);
                return (
                  <label key={field.id ?? field.key} style={labelStyle}>
                    <span style={labelTextStyle}>{field.label}</span>
                    <input type="hidden" name="optionDetailLabel" value={field.label} />
                    <input type="hidden" name="optionDetailValue" value={displayAnswer(field, value)} />
                    <select value={value} required={field.required !== false} onChange={(event) => updateAnswer(field.key, event.target.value)} style={inputStyle}>
                      <option value="">Choose {field.label.toLowerCase()}</option>
                      {choices.length === 0 ? <option value="">No matching options set up</option> : null}
                      {choices.map((choice) => {
                        const choiceValue = quoteChoiceValue(choice);
                        return <option key={choice.id ?? choiceValue} value={choiceValue}>{choiceLabel(choice, humanize(choiceValue))}</option>;
                      })}
                    </select>
                    {field.helpText ? <small style={{ color: "#667085" }}>{field.helpText}</small> : null}
                  </label>
                );
              }

              return (
                <label key={field.id ?? field.key} style={labelStyle}>
                  <span style={labelTextStyle}>{field.label}</span>
                  <input type="hidden" name="optionDetailLabel" value={field.label} />
                  <input
                    name="optionDetailValue"
                    type={["number", "quantity"].includes(fieldType) ? "number" : "text"}
                    min={["number", "quantity"].includes(fieldType) ? "0" : undefined}
                    step={["number", "quantity"].includes(fieldType) ? "any" : undefined}
                    value={value}
                    required={field.required !== false}
                    onChange={(event) => updateAnswer(field.key, event.target.value)}
                    style={inputStyle}
                  />
                  {field.helpText ? <small style={{ color: "#667085" }}>{field.helpText}</small> : null}
                </label>
              );
            })}

            {legacyRows.map((row, index) => (
              <label key={`legacy-${row.label}-${index}`} style={labelStyle}>
                <span style={labelTextStyle}>{row.label}</span>
                <input type="hidden" name="optionDetailLabel" value={row.label} />
                <input name="optionDetailValue" defaultValue={row.value} style={inputStyle} />
              </label>
            ))}
          </div>
        </section>
      ) : summaryRows.length > 0 ? (
        <section style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 3 }}>
            <strong>Editable option details</strong>
            <span style={{ color: "#64748b", fontSize: 13 }}>This line is not linked to an available saved product, so its existing details remain editable as text.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            {summaryRows.map((row, index) => (
              <label key={`${row.label}-${index}`} style={labelStyle}>
                <span style={labelTextStyle}>{row.label}</span>
                <input type="hidden" name="optionDetailLabel" value={row.label} />
                <input name="optionDetailValue" defaultValue={row.value} style={inputStyle} />
              </label>
            ))}
          </div>
        </section>
      ) : (
        <label style={labelStyle}>
          <span style={labelTextStyle}>Client-facing / production summary</span>
          <textarea name="optionSummary" defaultValue={line.optionSummary ?? ""} style={{ ...textareaStyle, minHeight: 74 }} />
        </label>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Line title</span>
          <input name="productName" value={lineTitle} onChange={(event) => setLineTitle(event.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Quantity</span>
          <input name="quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Unit price</span>
          <input
            name="unitPrice"
            value={unitPrice}
            onChange={(event) => {
              setUnitPrice(event.target.value);
              setUnitPriceOverridden(true);
            }}
            inputMode="decimal"
            style={inputStyle}
          />
        </label>
      </div>

      {product ? (
        <section style={{ border: recalculationMode !== "none" ? "1px solid #bbf7d0" : "1px solid #fed7aa", borderRadius: 16, padding: 12, background: recalculationMode !== "none" ? "#f0fdf4" : "#fffcf5", display: "grid", gap: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 950, color: recalculationMode !== "none" ? "#067647" : "#b54708", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {recalculationMode === "product_setup" ? "Recalculated from product setup" : recalculationMode === "saved_price_scale" ? "Scaled from the saved Carbon Book price" : "Automatic pricing not available"}
          </span>
          {recalculationMode !== "none" ? (
            <>
              <strong>{formatMoney(recalculatedUnitPrice)} recalculated unit price · {formatMoney(recalculatedLineTotal)} recalculated line total at qty {quantityNumber}</strong>
              {recalculationMode === "saved_price_scale" ? <span style={{ color: "#475467", fontSize: 13 }}>{savedPriceScale.explanation}. The original {formatMoney(line.unitPrice)} price remains the baseline.</span> : null}
              <span style={{ color: "#475467", fontSize: 13 }}>Current entered value: {formatMoney(unitPrice)} per unit · {formatMoney(enteredLineTotal)} line total.</span>
              {unitPriceOverridden ? <button type="button" onClick={useRecalculatedPrice} style={{ ...buttonStyle, background: "#067647", justifySelf: "start" }}>Use recalculated price</button> : null}
            </>
          ) : (
            <span style={{ color: "#7a2e0e", fontSize: 13 }}>This product has no active material or charge rows and is not a Carbon Book with scalable size/pages/copies, so the existing manual unit price is preserved.</span>
          )}
        </section>
      ) : null}

      <label style={labelStyle}>
        <span style={labelTextStyle}>Internal notes</span>
        <textarea name="notes" defaultValue={line.notes ?? ""} style={textareaStyle} />
      </label>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={buttonStyle}>Save line changes</button>
          <button type="button" onClick={openSaveProduct} style={{ ...buttonStyle, background: "#ffffff", color: "#155eef", border: "1px solid #b9cdfc" }}>Save as reusable product</button>
        </div>
        <span style={{ color: "#64748b", fontSize: 13 }}>Product option changes recalculate the unit price; quantity recalculates the line total.</span>
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
                <span><strong>Keep the product pricing recipe</strong><br /><small style={{ color: "#64748b" }}>Copies the linked materials, labour, charges and available option lists. These selections become its defaults.</small></span>
              </label>
              <label style={{ display: "flex", gap: 9, alignItems: "start", fontWeight: 850 }}>
                <input type="radio" name="productPricingMode" value="current_price" checked={productPricingMode === "current_price"} onChange={() => setProductPricingMode("current_price")} />
                <span><strong>Use the current {formatMoney(unitPrice)} unit price</strong><br /><small style={{ color: "#64748b" }}>Keeps the option lists but replaces the recipe with this quote line's current price basis.</small></span>
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
