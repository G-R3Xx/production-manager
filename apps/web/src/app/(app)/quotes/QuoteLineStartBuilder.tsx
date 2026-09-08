"use client";

import { useState } from "react";
import { QuoteLineBuilder, type QuoteProduct } from "./QuoteLineBuilder";
import {
  QuoteMaterialFlowBuilder,
  type MyobMatrixItem,
  type PricingSettings,
  type QuoteMaterial,
} from "./QuoteMaterialFlowBuilder";

type StartMode = "saved" | "quick";

type QuoteLineStartBuilderProps = {
  quoteId: string;
  products: QuoteProduct[];
  materials: QuoteMaterial[];
  myobMatrixItems?: MyobMatrixItem[];
  pricingSettings?: PricingSettings;
  canOverrideMarkup?: boolean;
};

const optionButton = (active: boolean) => ({
  border: active ? "2px solid #2563eb" : "1px solid #cfd9e8",
  borderRadius: 14,
  padding: "12px 14px",
  background: active ? "#eff6ff" : "#fff",
  color: active ? "#1d4ed8" : "#0f172a",
  cursor: "pointer",
  textAlign: "left" as const,
  display: "grid",
  gap: 4,
  minWidth: 0,
});

export function QuoteLineStartBuilder({
  quoteId,
  products,
  materials,
  myobMatrixItems = [],
  pricingSettings,
  canOverrideMarkup = false,
}: QuoteLineStartBuilderProps) {
  const [mode, setMode] = useState<StartMode>("saved");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 950, color: "#475467", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Start from
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
          <button type="button" onClick={() => setMode("saved")} style={optionButton(mode === "saved")}>
            <strong style={{ fontSize: 15 }}>Saved product</strong>
            <span style={{ fontSize: 12, lineHeight: 1.45, color: mode === "saved" ? "#1e40af" : "#667085" }}>
              Select a predefined Signage or Small format product and configure its saved options.
            </span>
          </button>
          <button type="button" onClick={() => setMode("quick")} style={optionButton(mode === "quick")}>
            <strong style={{ fontSize: 15 }}>Quick / custom line</strong>
            <span style={{ fontSize: 12, lineHeight: 1.45, color: mode === "quick" ? "#1e40af" : "#667085" }}>
              Build one-off signage, print, plan, poster, service, install or component work.
            </span>
          </button>
        </div>
      </section>

      <div style={{ borderTop: "1px solid #e5edf7", paddingTop: 14 }}>
        {mode === "saved" ? (
          <QuoteLineBuilder
            quoteId={quoteId}
            products={products}
            materials={materials}
            pricingSettings={pricingSettings}
          />
        ) : (
          <QuoteMaterialFlowBuilder
            quoteId={quoteId}
            materials={materials}
            myobMatrixItems={myobMatrixItems}
            canOverrideMarkup={canOverrideMarkup}
            pricingSettings={pricingSettings}
          />
        )}
      </div>
    </div>
  );
}
