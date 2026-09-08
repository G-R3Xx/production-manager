"use client";

import { useEffect, useState, useTransition } from "react";
import { updateQuoteLineMarkupAction } from "./actions";

type Props = {
  quoteId: string;
  lineId: string;
  markupMultiplier: number;
  standardMarkupMultiplier: number;
  disabledReason?: string | null;
};

function valueText(value: number): string {
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : "1.50";
}

export function QuoteLineMarkupEditor({ quoteId, lineId, markupMultiplier, standardMarkupMultiplier, disabledReason }: Props) {
  const [value, setValue] = useState(() => valueText(markupMultiplier));
  const [pending, startTransition] = useTransition();
  const isOverride = Math.abs((Number(value) || 0) - standardMarkupMultiplier) > 0.000001;

  useEffect(() => setValue(valueText(markupMultiplier)), [markupMultiplier]);

  if (disabledReason) {
    return (
      <span
        title={disabledReason}
        onClick={(event) => event.stopPropagation()}
        style={{ borderRadius: 999, background: "#f2f4f7", color: "#667085", padding: "6px 9px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}
      >
        Markup — {disabledReason}
      </span>
    );
  }

  function saveMarkup() {
    const formData = new FormData();
    formData.set("quoteId", quoteId);
    formData.set("lineId", lineId);
    formData.set("markupMultiplier", value);
    startTransition(async () => {
      await updateQuoteLineMarkupAction(formData);
    });
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", border: isOverride ? "1px solid #fdba74" : "1px solid #d0d5dd", borderRadius: 11, padding: "4px 5px 4px 8px", background: isOverride ? "#fff7ed" : "#fff" }}
    >
      <label style={{ display: "flex", gap: 4, alignItems: "center", color: isOverride ? "#9a3412" : "#475467", fontSize: 11, fontWeight: 950, whiteSpace: "nowrap" }}>
        Markup ×
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          inputMode="decimal"
          aria-label="Quote line markup multiplier"
          style={{ width: 62, minHeight: 30, border: "1px solid #cfd9e8", borderRadius: 8, padding: "0 7px", fontWeight: 900, color: "#101828", background: "#fff" }}
        />
      </label>
      {isOverride ? (
        <button type="button" disabled={pending} onClick={() => setValue(valueText(standardMarkupMultiplier))} title={`Reset to standard ×${standardMarkupMultiplier.toFixed(2)}`} style={{ minHeight: 30, border: 0, background: "transparent", color: "#155eef", fontSize: 10, fontWeight: 950, padding: "0 3px", cursor: pending ? "wait" : "pointer" }}>Standard</button>
      ) : null}
      <button type="button" disabled={pending} onClick={saveMarkup} style={{ minHeight: 30, border: 0, borderRadius: 8, background: "#155eef", color: "#fff", fontSize: 10, fontWeight: 950, padding: "0 8px", cursor: pending ? "wait" : "pointer", opacity: pending ? 0.65 : 1 }}>{pending ? "Saving…" : "Save"}</button>
    </div>
  );
}
