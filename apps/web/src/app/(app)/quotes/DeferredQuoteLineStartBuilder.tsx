"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import type { QuoteProduct } from "./QuoteLineBuilder";
import type { MyobMatrixItem, PricingSettings, QuoteMaterial } from "./QuoteMaterialFlowBuilder";

type Props = {
  quoteId: string;
  products: QuoteProduct[];
  materials: QuoteMaterial[];
  myobMatrixItems?: MyobMatrixItem[];
  pricingSettings?: PricingSettings;
  canOverrideMarkup?: boolean;
};

export function DeferredQuoteLineStartBuilder(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [Builder, setBuilder] = useState<ComponentType<Props> | null>(null);

  useEffect(() => {
    const details = hostRef.current?.closest("details");
    if (!details) {
      setShouldLoad(true);
      return;
    }
    const syncOpenState = () => setShouldLoad(details.open);
    syncOpenState();
    details.addEventListener("toggle", syncOpenState);
    return () => details.removeEventListener("toggle", syncOpenState);
  }, []);

  useEffect(() => {
    if (!shouldLoad || Builder) return;
    let cancelled = false;
    void import("./QuoteLineStartBuilder").then((module) => {
      if (!cancelled) setBuilder(() => module.QuoteLineStartBuilder);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Builder]);

  return (
    <div ref={hostRef}>
      {shouldLoad ? (
        Builder ? <Builder {...props} /> : (
          <div style={{ minHeight: 110, display: "grid", placeItems: "center", border: "1px dashed #93c5fd", borderRadius: 14, color: "#1d4ed8", background: "#f8fbff", fontSize: 13, fontWeight: 850 }}>
            Loading quote builder…
          </div>
        )
      ) : null}
    </div>
  );
}
