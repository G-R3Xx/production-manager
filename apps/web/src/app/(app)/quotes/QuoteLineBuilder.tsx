"use client";

import { useEffect, useMemo, useState } from "react";
import { addQuoteLineAction } from "./actions";

type QuoteChoice = {
  id?: string | null;
  label?: string | null;
  value?: string | null;
  priceDelta?: string | null;
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

type QuoteProduct = {
  id: string;
  name: string;
  sku?: string | null;
  fields: QuoteQuestion[];
};

type QuoteLineBuilderProps = {
  quoteId: string;
  products: QuoteProduct[];
};

const inputStyle = {
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: "0 14px",
  width: "100%",
  boxSizing: "border-box" as const,
  background: "#fff"
};

const textareaStyle = {
  minHeight: 96,
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: "12px 14px",
  width: "100%",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
  background: "#fff"
};

const buttonStyle = {
  minHeight: 44,
  borderRadius: 12,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  padding: "0 16px"
};

const secondaryButtonStyle = {
  minHeight: 40,
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  background: "#fff",
  color: "#111827",
  fontWeight: 800,
  cursor: "pointer",
  padding: "0 14px"
};

const labelStyle = { display: "grid", gap: 6 };
const labelTextStyle = { fontWeight: 800, fontSize: 13, color: "#344054" };
const mutedStyle = { margin: 0, color: "#667085", lineHeight: 1.5 };
const chipStyle = { borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 10px", fontSize: 12, fontWeight: 800 };
const priceCardStyle = { border: "1px solid #d1fadf", borderRadius: 12, padding: 12, background: "#f6fef9", display: "grid", gap: 4 };

function humanize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/(\d+)x(\d+)/i, "$1 × $2");
}

function moneyNumber(value: string | number | null | undefined): number {
  const amount = Number(String(value ?? "0").replace(/,/g, "").replace(/\$/g, "").trim());
  return Number.isFinite(amount) ? amount : 0;
}

function moneyInput(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatMoney(value: string | number | null | undefined): string {
  return `$${moneyNumber(value).toFixed(2)}`;
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

function selectedChoicePrice(field: QuoteQuestion, value: string): number {
  const matched = selectedChoice(field, value);
  return moneyNumber(matched?.priceDelta ?? "0");
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

function priceBreakdownFor(fields: QuoteQuestion[], answers: Record<string, string>) {
  return fields
    .filter((field) => isVisible(field, answers))
    .filter((field) => !["quantity", "number", "text"].includes(field.type) && field.key !== "quantity")
    .map((field) => {
      const value = answers[field.key] ?? "";
      const price = selectedChoicePrice(field, value);
      if (!value || price === 0) return null;
      return { label: field.label, answer: answerLabel(field, value), price };
    })
    .filter((item): item is { label: string; answer: string; price: number } => Boolean(item));
}

function autoUnitPriceFor(fields: QuoteQuestion[], answers: Record<string, string>): number {
  return priceBreakdownFor(fields, answers).reduce((total, item) => total + item.price, 0);
}

function needsTextInput(type: string): boolean {
  return ["text", "number", "quantity"].includes(type);
}

function inputTypeFor(type: string): string {
  if (["number", "quantity"].includes(type)) return "number";
  return "text";
}

export function QuoteLineBuilder({ quoteId, products }: QuoteLineBuilderProps) {
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
  const autoSummary = selectedProduct && selectedProduct.fields.length > 0 ? summaryFor(selectedProduct.fields, answers) : manualSummary;
  const priceBreakdown = useMemo(() => priceBreakdownFor(selectedProduct?.fields ?? [], answers), [selectedProduct, answers]);
  const autoUnitPrice = useMemo(() => autoUnitPriceFor(selectedProduct?.fields ?? [], answers), [selectedProduct, answers]);

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
        <p style={mutedStyle}>Create a product first, then add quote questions on the Products page.</p>
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

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, display: "grid", gap: 12, background: "#fcfcfd" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <strong>2. Select options for this quote line</strong>
            <p style={{ ...mutedStyle, marginTop: 4 }}>These are the quote questions created on the product setup page. Prices attached to answers are calculated below.</p>
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
                      { label: "Yes", value: "yes", priceDelta: "0" },
                      { label: "No", value: "no", priceDelta: "0" }
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
                        const choicePrice = moneyNumber(choice.priceDelta ?? "0");
                        const label = choice.label ?? humanize(choiceValue);
                        return <option key={choice.id ?? choiceValue} value={choiceValue}>{choicePrice === 0 ? label : `${label} (${formatMoney(choicePrice)})`}</option>;
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

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, display: "grid", gap: 12 }}>
        <strong>3. Auto price and add line</strong>
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
          <span style={{ fontSize: 12, fontWeight: 900, color: "#067647", textTransform: "uppercase", letterSpacing: "0.05em" }}>Calculated from selected options</span>
          <strong>{formatMoney(autoUnitPrice)}</strong>
          {priceBreakdown.length > 0 ? (
            <span style={{ color: "#344054", fontSize: 13 }}>
              {priceBreakdown.map((item) => `${item.label}: ${item.answer} ${formatMoney(item.price)}`).join(" · ")}
            </span>
          ) : (
            <span style={{ color: "#667085", fontSize: 13 }}>No priced options selected yet. Add prices to this product's quote questions on the Products page.</span>
          )}
          {unitPriceOverridden ? <button type="button" onClick={useAutoPrice} style={secondaryButtonStyle}>Use auto price</button> : null}
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
