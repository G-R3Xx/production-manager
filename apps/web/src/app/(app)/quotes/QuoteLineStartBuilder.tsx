"use client";

import { lazy, Suspense, useState } from "react";
import type { QuoteProduct } from "./QuoteLineBuilder";
import type { MyobMatrixItem, PricingSettings, QuoteMaterial } from "./QuoteMaterialFlowBuilder";
import type { QuoteCostingResources } from "./quoteCostingResources";
import type { QuoteSubJob } from "@/lib/quote-sub-jobs";

const QuoteLineBuilder = lazy(() => import("./QuoteLineBuilder").then((module) => ({ default: module.QuoteLineBuilder })));
const QuoteMaterialFlowBuilder = lazy(() => import("./QuoteMaterialFlowBuilder").then((module) => ({ default: module.QuoteMaterialFlowBuilder })));
const VisualQuoteCatalogue = lazy(() => import("./VisualQuoteCatalogue").then((module) => ({ default: module.VisualQuoteCatalogue })));

type StartMode = "saved" | "quick";

type QuoteLineStartBuilderProps = {
  quoteId: string;
  subJobs?: QuoteSubJob[];
  products: QuoteProduct[];
  materials: QuoteMaterial[];
  myobMatrixItems?: MyobMatrixItem[];
  pricingSettings?: PricingSettings;
  canOverrideMarkup?: boolean;
  costingResources?: QuoteCostingResources;
  quoteEntryLayout?: "list" | "catalogue";
  categoryImages?: Record<string, string | null | undefined>;
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
  subJobs = [],
  products,
  materials,
  myobMatrixItems = [],
  pricingSettings,
  canOverrideMarkup = false,
  costingResources,
  quoteEntryLayout = "list",
  categoryImages = {},
}: QuoteLineStartBuilderProps) {
  const [mode, setMode] = useState<StartMode>("saved");
  const [subJobId, setSubJobId] = useState("");
  const sectionPicker = subJobs.length ? (
    <label style={{ display: "grid", gap: 6, maxWidth: 480, fontSize: 13, fontWeight: 850, color: "#344054" }}>
      Add line under Sub Job
      <select value={subJobId} onChange={(event) => setSubJobId(event.target.value)} style={{ minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff" }}>
        <option value="">General / Unassigned</option>
        {subJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
      </select>
    </label>
  ) : null;

  if (quoteEntryLayout === "catalogue") {
    return (
      <div style={{ display: "grid", gap: 12 }}>
      {sectionPicker}
      <Suspense fallback={<div style={{ minHeight: 150, display: "grid", placeItems: "center", color: "#64748b", fontSize: 13, fontWeight: 800 }}>Loading visual catalogue…</div>}>
        <VisualQuoteCatalogue
          quoteId={quoteId}
          subJobId={subJobId}
          products={products}
          materials={materials}
          myobMatrixItems={myobMatrixItems}
          pricingSettings={pricingSettings}
          canOverrideMarkup={canOverrideMarkup}
          costingResources={costingResources}
          categoryImages={categoryImages}
        />
      </Suspense>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {sectionPicker}
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
        <Suspense fallback={<div style={{ minHeight: 90, display: "grid", placeItems: "center", color: "#64748b", fontSize: 13, fontWeight: 800 }}>Loading selected quote tool…</div>}>
          {mode === "saved" ? (
            <QuoteLineBuilder
              quoteId={quoteId}
              subJobId={subJobId}
              products={products}
              materials={materials}
              pricingSettings={pricingSettings}
              costingResources={costingResources}
            />
          ) : (
            <QuoteMaterialFlowBuilder
              quoteId={quoteId}
              subJobId={subJobId}
              materials={materials}
              myobMatrixItems={myobMatrixItems}
              canOverrideMarkup={canOverrideMarkup}
              pricingSettings={pricingSettings}
              costingResources={costingResources}
              categoryImages={categoryImages}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
