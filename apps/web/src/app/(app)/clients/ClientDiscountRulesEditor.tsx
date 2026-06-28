"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

type DiscountRuleRow = {
  id: string;
  productType: string;
  minQty: string;
  discountPercent: string;
  maxQty: string;
  note: string;
};

const productTypeOptions = [
  "Signage",
  "ACM",
  "Acrylic",
  "Corflute",
  "PVC",
  "Banner",
  "Vinyl",
  "Small format",
  "Cards",
  "Brochures",
  "Books",
  "Carbon books",
  "Service",
  "Install",
  "Component"
];

const quantityOptions = ["1", "5", "10", "25", "50", "100", "250", "500", "1000"];
const discountOptions = ["2.5", "5", "7.5", "10", "12.5", "15", "20", "25", "30"];
const maxQuantityOptions = ["", ...quantityOptions];

const selectStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 12,
  border: "1px solid #cfd9e8",
  padding: "0 12px",
  width: "100%",
  boxSizing: "border-box",
  background: "#fff"
};

const inputStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 12,
  border: "1px solid #cfd9e8",
  padding: "0 12px",
  width: "100%",
  boxSizing: "border-box",
  background: "#fff"
};

const smallButtonStyle: CSSProperties = {
  minHeight: 38,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#111827",
  fontWeight: 850,
  cursor: "pointer",
  padding: "0 12px"
};

function normaliseRuleNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return "";
  return String(parsed);
}

function newBlankRule(id: string): DiscountRuleRow {
  return {
    id,
    productType: "Signage",
    minQty: "10",
    discountPercent: "5",
    maxQty: "",
    note: ""
  };
}

function parseInitialRulesText(value: string): DiscountRuleRow[] {
  const rows = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      return {
        id: `initial-${index}`,
        productType: parts[0] || "Signage",
        minQty: normaliseRuleNumber(parts[1] || ""),
        discountPercent: normaliseRuleNumber(parts[2] || ""),
        maxQty: normaliseRuleNumber(parts[3] || ""),
        note: parts.slice(4).join(" | ").trim()
      };
    })
    .filter((row) => row.productType && row.minQty && row.discountPercent);

  return rows.length > 0
    ? rows
    : [
        { id: "default-0", productType: "Signage", minQty: "10", discountPercent: "5", maxQty: "", note: "" },
        { id: "default-1", productType: "Small format", minQty: "250", discountPercent: "7.5", maxQty: "", note: "" }
      ];
}

function valuesWithCurrent(options: string[], current: string): string[] {
  const trimmed = current.trim();
  if (!trimmed || options.includes(trimmed)) return options;
  return [...options, trimmed];
}

function displayPercent(value: string): string {
  return value ? `${value}%` : "Choose discount";
}

function buildRulesText(rows: DiscountRuleRow[]): string {
  return rows
    .map((row) => ({
      productType: row.productType.trim(),
      minQty: normaliseRuleNumber(row.minQty),
      discountPercent: normaliseRuleNumber(row.discountPercent),
      maxQty: normaliseRuleNumber(row.maxQty),
      note: row.note.trim()
    }))
    .filter((row) => row.productType && row.minQty && row.discountPercent)
    .map((row) => [row.productType, row.minQty, row.discountPercent, row.maxQty, row.note].join(" | ").replace(/( \|\s*)+$/g, ""))
    .join("\n");
}

export function ClientDiscountRulesEditor({ initialRulesText }: { initialRulesText: string }) {
  const [rows, setRows] = useState<DiscountRuleRow[]>(() => parseInitialRulesText(initialRulesText));
  const [nextId, setNextId] = useState(() => parseInitialRulesText(initialRulesText).length + 1);

  const hiddenValue = useMemo(() => buildRulesText(rows), [rows]);

  function updateRow(id: string, patch: Partial<DiscountRuleRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function addRule() {
    const id = `added-${nextId}`;
    setRows((current) => [...current, newBlankRule(id)]);
    setNextId((current) => current + 1);
  }

  function removeRule(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  return (
    <div style={{ border: "1px solid #fef0c7", borderRadius: 20, padding: 14, background: "#fffbeb", display: "grid", gap: 12 }}>
      <input type="hidden" name="discountRulesText" value={hiddenValue} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>Quantity / product type discounts</strong>
          <p style={{ margin: 0, color: "#92400e", fontSize: 13 }}>Build each rule from selectors instead of typing the pipe format manually.</p>
        </div>
        <button type="button" onClick={addRule} style={{ ...smallButtonStyle, background: "#111827", borderColor: "#111827", color: "#fff" }}>+ Add rule</button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {rows.length === 0 ? (
          <div style={{ border: "1px dashed #fbbf24", borderRadius: 16, padding: 14, background: "#fff", color: "#92400e" }}>
            No discount rules. Add one if this client gets a quantity discount.
          </div>
        ) : rows.map((row, index) => (
          <div key={row.id} style={{ border: "1px solid #fde68a", borderRadius: 16, padding: 12, background: "#fff", display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.25fr 0.75fr 0.85fr 0.85fr auto", gap: 8, alignItems: "end" }}>
              <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 850, color: "#475467" }}>
                Product type
                <select value={row.productType} onChange={(event) => updateRow(row.id, { productType: event.currentTarget.value })} style={selectStyle}>
                  {valuesWithCurrent(productTypeOptions, row.productType).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 850, color: "#475467" }}>
                From qty
                <select value={row.minQty} onChange={(event) => updateRow(row.id, { minQty: event.currentTarget.value })} style={selectStyle}>
                  {valuesWithCurrent(quantityOptions, row.minQty).map((option) => (
                    <option key={option} value={option}>{option}+</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 850, color: "#475467" }}>
                Discount
                <select value={row.discountPercent} onChange={(event) => updateRow(row.id, { discountPercent: event.currentTarget.value })} style={selectStyle}>
                  {valuesWithCurrent(discountOptions, row.discountPercent).map((option) => (
                    <option key={option} value={option}>{displayPercent(option)}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 850, color: "#475467" }}>
                Max qty
                <select value={row.maxQty} onChange={(event) => updateRow(row.id, { maxQty: event.currentTarget.value })} style={selectStyle}>
                  {valuesWithCurrent(maxQuantityOptions, row.maxQty).map((option) => (
                    <option key={option || "none"} value={option}>{option ? option : "No max"}</option>
                  ))}
                </select>
              </label>

              <button type="button" onClick={() => removeRule(row.id)} style={{ ...smallButtonStyle, color: "#b42318", borderColor: "#fda29b" }} aria-label={`Remove discount rule ${index + 1}`}>Remove</button>
            </div>

            <input value={row.note} onChange={(event) => updateRow(row.id, { note: event.currentTarget.value })} placeholder="Optional note, eg repeat order / trade account" style={inputStyle} />
          </div>
        ))}
      </div>

      <p style={{ margin: 0, color: "#92400e", fontSize: 12, lineHeight: 1.5 }}>
        Example: <b>Signage</b> from <b>10+</b> gets <b>5%</b>. Quotes will apply the best matching rule automatically.
      </p>
    </div>
  );
}
