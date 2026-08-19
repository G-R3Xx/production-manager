"use client";

import { useEffect, useState } from "react";
import type { FastQuoteLineResponseResult } from "./actions";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

export function QuoteLiveTotals({ subtotal, gst, total }: { subtotal: number; gst: number; total: number }) {
  const [values, setValues] = useState({ subtotal, gst, total });

  useEffect(() => {
    setValues({ subtotal, gst, total });
  }, [subtotal, gst, total]);

  useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<FastQuoteLineResponseResult>).detail;
      if (!detail?.ok || detail.subtotal == null || detail.gst == null || detail.total == null) return;
      setValues({ subtotal: detail.subtotal, gst: detail.gst, total: detail.total });
    };
    window.addEventListener("quote-line-response-saved", onSaved);
    return () => window.removeEventListener("quote-line-response-saved", onSaved);
  }, []);

  return (
    <div style={{ borderTop: "1px solid #e4e7ec", paddingTop: 14, display: "grid", justifyContent: "end", gap: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: "160px 140px", gap: 10 }}><span>Subtotal</span><strong style={{ textAlign: "right" }}>{formatMoney(values.subtotal)}</strong></div>
      <div style={{ display: "grid", gridTemplateColumns: "160px 140px", gap: 10 }}><span>GST</span><strong style={{ textAlign: "right" }}>{formatMoney(values.gst)}</strong></div>
      <div style={{ display: "grid", gridTemplateColumns: "160px 140px", gap: 10, fontSize: 22 }}><span>Total</span><strong style={{ textAlign: "right" }}>{formatMoney(values.total)}</strong></div>
    </div>
  );
}
