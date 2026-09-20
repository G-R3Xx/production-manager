"use client";

import { useEffect, useState, useTransition } from "react";
import { updateQuoteLineProfitAction } from "./actions";

type Props = {
  quoteId: string;
  lineId: string;
  profitPercent: number;
  standardProfitPercent: number;
  disabledReason?: string | null;
};

function valueText(value: number): string {
  return Number.isFinite(value) && value >= 0 ? value.toFixed(2).replace(/\.00$/, "") : "20";
}

export function QuoteLineProfitEditor({ quoteId, lineId, profitPercent, standardProfitPercent, disabledReason }: Props) {
  const [value, setValue] = useState(() => valueText(profitPercent));
  const [pending, startTransition] = useTransition();
  const isOverride = Math.abs((Number(value) || 0) - standardProfitPercent) > 0.000001;

  useEffect(() => setValue(valueText(profitPercent)), [profitPercent]);

  if (disabledReason) {
    return <span title={disabledReason} onClick={(event) => event.stopPropagation()} style={{ borderRadius: 999, background: "#f2f4f7", color: "#667085", padding: "6px 9px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>Profit — {disabledReason}</span>;
  }

  function saveProfit() {
    const formData = new FormData();
    formData.set("quoteId", quoteId);
    formData.set("lineId", lineId);
    formData.set("profitPercent", value);
    startTransition(async () => { await updateQuoteLineProfitAction(formData); });
  }

  return (
    <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", border: isOverride ? "1px solid #c4b5fd" : "1px solid #d0d5dd", borderRadius: 11, padding: "4px 5px 4px 8px", background: isOverride ? "#faf5ff" : "#fff" }}>
      <label style={{ display: "flex", gap: 4, alignItems: "center", color: isOverride ? "#6d28d9" : "#475467", fontSize: 11, fontWeight: 950, whiteSpace: "nowrap" }}>
        Profit
        <input value={value} onChange={(event) => setValue(event.target.value)} type="number" min="0" max="1000" step="0.01" inputMode="decimal" aria-label="Quote line profit percentage" style={{ width: 62, minHeight: 30, border: "1px solid #cfd9e8", borderRadius: 8, padding: "0 7px", fontWeight: 900, color: "#101828", background: "#fff" }} />%
      </label>
      {isOverride ? <button type="button" disabled={pending} onClick={() => setValue(valueText(standardProfitPercent))} title={`Reset to standard ${standardProfitPercent}%`} style={{ minHeight: 30, border: 0, background: "transparent", color: "#6d28d9", fontSize: 10, fontWeight: 950, padding: "0 3px", cursor: pending ? "wait" : "pointer" }}>Standard</button> : null}
      <button type="button" disabled={pending} onClick={saveProfit} style={{ minHeight: 30, border: 0, borderRadius: 8, background: "#7c3aed", color: "#fff", fontSize: 10, fontWeight: 950, padding: "0 8px", cursor: pending ? "wait" : "pointer", opacity: pending ? 0.65 : 1 }}>{pending ? "Saving…" : "Save"}</button>
    </div>
  );
}
