"use client";

import { useMemo, useState } from "react";
import { updateQuoteLineAction } from "./actions";
import { availableQuoteChoices, quoteChoiceValue, splitQuoteAnswerValues, type QuoteOptionChoiceLike } from "./quoteOptionDependencies";

type QuoteLineEditorChoice = QuoteOptionChoiceLike & {
  widthMm?: string | null;
  heightMm?: string | null;
};

type QuoteLineEditorField = {
  id?: string | null;
  key: string;
  label: string;
  type?: string | null;
  required?: boolean;
  defaultValue?: string | null;
  helpText?: string | null;
  options?: QuoteLineEditorChoice[] | null;
  showWhen?: {
    optionKey?: string | null;
    optionValues?: string[] | null;
  } | null;
};

type QuoteLineEditorProduct = {
  id: string;
  name: string;
  fields: QuoteLineEditorField[];
};

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

export function QuoteLineEditor({ quoteId, line, product }: QuoteLineEditorProps) {
  const summaryRows = useMemo(() => parseSummary(line.optionSummary), [line.optionSummary]);
  const configuredFields = useMemo(() => (product?.fields ?? []).filter((field) => field.key !== "quantity"), [product]);
  const configuredLabels = useMemo(() => new Set(configuredFields.map((field) => normalise(field.label))), [configuredFields]);
  const legacyRows = useMemo(() => summaryRows.filter((row) => !configuredLabels.has(normalise(row.label))), [summaryRows, configuredLabels]);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const valuesByLabel = new Map(summaryRows.map((row) => [normalise(row.label), row.value]));
    const initial = Object.fromEntries(configuredFields.map((field) => [field.key, answerFromSummary(field, valuesByLabel.get(normalise(field.label)))]));
    return sanitiseAnswers(configuredFields, initial);
  });

  const visibleFields = configuredFields.filter((field) => isVisible(field, answers));

  function updateAnswer(key: string, value: string) {
    setAnswers((current) => sanitiseAnswers(configuredFields, { ...current, [key]: value }));
  }

  function toggleMultiAnswer(field: QuoteLineEditorField, value: string, checked: boolean) {
    setAnswers((current) => {
      const selected = splitQuoteAnswerValues(current[field.key]);
      const nextValues = checked ? Array.from(new Set([...selected, value])) : selected.filter((item) => item !== value);
      return sanitiseAnswers(configuredFields, { ...current, [field.key]: nextValues.join(",") });
    });
  }

  return (
    <form action={updateQuoteLineAction} style={{ border: "1px solid #dbeafe", borderRadius: 16, padding: 12, background: "#f8fbff", display: "grid", gap: 12 }}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="lineId" value={line.id} />

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
          <input name="productName" defaultValue={line.productName} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Quantity</span>
          <input name="quantity" defaultValue={line.quantity} inputMode="decimal" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Unit price</span>
          <input name="unitPrice" defaultValue={cleanMoneyInput(line.unitPrice)} inputMode="decimal" style={inputStyle} />
        </label>
      </div>
      <label style={labelStyle}>
        <span style={labelTextStyle}>Internal notes</span>
        <textarea name="notes" defaultValue={line.notes ?? ""} style={textareaStyle} />
      </label>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" style={buttonStyle}>Save line changes</button>
        <span style={{ color: "#64748b", fontSize: 13 }}>Saving rebuilds the summary and recalculates quantity × unit price.</span>
      </div>
    </form>
  );
}
