"use client";

import { useMemo, useState } from "react";
import { createAndPushInvoiceAction } from "./actions";

type Line = {
  id: string;
  productName: string;
  optionSummary: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  invoicedQty: number;
  remainingQty: number;
  remainingValue: number;
};

type Props = {
  jobId: string;
  quoteId: string;
  quoteNumber: string | null;
  lines: Line[];
  quoteSubtotal: number;
  remainingSubtotal: number;
  fixedAdvanceSubtotal: number;
  canCreate: boolean;
  hasInvoices: boolean;
  fullyInvoiced: boolean;
};

const money = (value: number) => value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

export function InvoiceBuilder(props: Props) {
  const [kind, setKind] = useState<"full_remaining" | "selected_lines" | "deposit" | "progress" | "final_balance" | "variation">(
    props.fullyInvoiced ? "variation" : props.hasInvoices ? "final_balance" : "full_remaining"
  );
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [advancePercent, setAdvancePercent] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [variationQty, setVariationQty] = useState(1);
  const [variationUnitPrice, setVariationUnitPrice] = useState(0);

  const selectedSubtotal = useMemo(() => props.lines.reduce((sum, line) => {
    const requested = Math.max(0, Math.min(line.remainingQty, Number(qtys[line.id] ?? 0)));
    return sum + requested * line.unitPrice;
  }, 0), [props.lines, qtys]);
  const advanceSubtotal = advancePercent > 0 ? props.quoteSubtotal * (advancePercent / 100) : advanceAmount;
  const variationSubtotal = Math.max(0, variationQty) * Math.max(0, variationUnitPrice);
  const previewSubtotal = kind === "selected_lines"
    ? selectedSubtotal
    : kind === "deposit" || kind === "progress"
      ? Math.min(props.remainingSubtotal, Math.max(0, advanceSubtotal))
      : kind === "variation"
        ? variationSubtotal
        : props.remainingSubtotal;
  const gst = previewSubtotal * 0.1;

  if (!props.canCreate) {
    return <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412", padding: 14, borderRadius: 14, fontWeight: 800 }}>Only Owner, Manager and Accounts roles can create MYOB invoices.</div>;
  }

  return (
    <form action={createAndPushInvoiceAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="jobId" value={props.jobId} />
      <input type="hidden" name="quoteId" value={props.quoteId} />
      <input type="hidden" name="invoiceKind" value={kind} />

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${props.fullyInvoiced ? 1 : 4},minmax(0,1fr))`, gap: 10 }}>
        {[
          ...(props.fullyInvoiced ? [] : [
            { value: props.hasInvoices ? "final_balance" : "full_remaining", title: props.hasInvoices ? "Final / remaining balance" : "Full job", text: props.hasInvoices ? "Invoice everything still owing. Previous deposits/progress are credited automatically." : "Create the full invoice from the accepted MYOB Order where possible." },
            { value: "selected_lines", title: "Selected lines / partial qty", text: "Invoice only chosen quote lines or partial quantities." },
            { value: "deposit", title: "Deposit / progress", text: "Invoice a percentage or fixed amount now, then credit it from the final balance later." },
          ]),
          { value: "variation", title: "Variation / extra", text: "Invoice approved additional work outside the accepted quote without changing the original quote value." },
        ].map((option) => {
          const selected = kind === option.value || (option.value === "deposit" && kind === "progress");
          return <button key={option.value} type="button" onClick={() => setKind(option.value as typeof kind)} style={{ textAlign: "left", padding: 14, borderRadius: 14, border: selected ? "2px solid #155eef" : "1px solid #d0d5dd", background: selected ? "#eff6ff" : "#fff", cursor: "pointer" }}>
            <strong style={{ display: "block", fontSize: 15, color: "#101828" }}>{option.title}</strong>
            <span style={{ display: "block", color: "#667085", fontSize: 12, marginTop: 5, lineHeight: 1.45 }}>{option.text}</span>
          </button>;
        })}
      </div>

      {kind === "selected_lines" ? (
        <div style={{ border: "1px solid #dfe7f2", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) 78px 95px 82px 100px 110px 118px", gap: 10, padding: "10px 12px", background: "#f8fafc", color: "#475467", fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>
            <span>Quote line</span><span>Original</span><span>Prev. invoiced</span><span>Remaining</span><span>Invoice qty</span><span>Price P/U</span><span>This invoice</span>
          </div>
          {props.lines.filter((line) => line.remainingQty > 0.0001).map((line) => {
            const qty = Math.max(0, Math.min(line.remainingQty, Number(qtys[line.id] ?? 0)));
            return <div key={line.id} style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) 78px 95px 82px 100px 110px 118px", gap: 10, padding: 12, borderTop: "1px solid #eef2f6", alignItems: "center" }}>
              <div><strong>{line.productName}</strong>{line.optionSummary ? <div style={{ color: "#667085", fontSize: 12, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line.optionSummary}</div> : null}</div>
              <span>{line.quantity.toLocaleString("en-AU")}</span>
              <span>{line.invoicedQty.toLocaleString("en-AU")}</span>
              <strong>{line.remainingQty.toLocaleString("en-AU")}</strong>
              <input name={`qty_${line.id}`} type="number" min="0" max={line.remainingQty} step="0.01" value={qtys[line.id] ?? ""} onChange={(event) => setQtys((current) => ({ ...current, [line.id]: Number(event.target.value) }))} style={{ width: "100%", minHeight: 38, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 9px" }} />
              <span>{money(line.unitPrice)}</span>
              <strong>{money(qty * line.unitPrice)}</strong>
            </div>;
          })}
        </div>
      ) : null}

      {kind === "deposit" || kind === "progress" ? (
        <div style={{ display: "grid", gridTemplateColumns: ".8fr 1fr 1fr 1.4fr", gap: 12, padding: 14, border: "1px solid #dfe7f2", borderRadius: 16, background: "#fbfdff" }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900 }}>Invoice type
            <select value={kind} onChange={(event) => setKind(event.target.value as "deposit" | "progress")} style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 10px", background: "#fff" }}>
              <option value="deposit">Deposit</option>
              <option value="progress">Progress claim</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900 }}>Percentage of accepted job
            <input name="advancePercent" type="number" min="0" max="100" step="0.1" value={advancePercent || ""} onChange={(event) => { setAdvancePercent(Number(event.target.value)); if (Number(event.target.value) > 0) setAdvanceAmount(0); }} placeholder="e.g. 50" style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 10px" }} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900 }}>Or fixed amount ex GST
            <input name="advanceAmount" type="number" min="0" step="0.01" value={advanceAmount || ""} onChange={(event) => { setAdvanceAmount(Number(event.target.value)); if (Number(event.target.value) > 0) setAdvancePercent(0); }} placeholder="e.g. 1000.00" style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 10px" }} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900 }}>Invoice description
            <input key={kind} name="advanceLabel" defaultValue={kind === "deposit" ? "Deposit" : "Progress claim"} style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 10px" }} />
          </label>
          <div style={{ gridColumn: "1 / -1", color: "#667085", fontSize: 12 }}>If both percentage and amount are entered, percentage takes priority. The final balance automatically credits these advance invoices.</div>
        </div>
      ) : null}


      {kind === "variation" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr .5fr .8fr", gap: 12, padding: 14, border: "1px solid #fed7aa", borderRadius: 16, background: "#fffaf5" }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900 }}>Approved variation / extra description
            <input name="variationDescription" placeholder="e.g. Additional ACM panel requested after approval" style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 10px" }} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900 }}>Qty
            <input name="variationQty" type="number" min="0.01" step="0.01" value={variationQty} onChange={(event) => setVariationQty(Number(event.target.value))} style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 10px" }} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900 }}>Price P/U ex GST
            <input name="variationUnitPrice" type="number" min="0.01" step="0.01" value={variationUnitPrice || ""} onChange={(event) => setVariationUnitPrice(Number(event.target.value))} placeholder="0.00" style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 10px" }} />
          </label>
          <div style={{ gridColumn: "1 / -1", color: "#9a3412", fontSize: 12, fontWeight: 700 }}>Use this only for client-approved additional work. It is invoiced in MYOB as an extra against the job and does not reduce the remaining value of the original accepted quote.</div>
        </div>
      ) : null}

      {(kind === "full_remaining" || kind === "final_balance") && props.fixedAdvanceSubtotal > 0.01 ? (
        <div style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 800 }}>
          Previous deposit / progress invoices: {money(props.fixedAdvanceSubtotal)} ex GST. PM will automatically add this as a credit on the final invoice so the job cannot be billed twice.
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", padding: 16, borderRadius: 16, background: "#0f172a", color: "#fff" }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <span><small style={{ display: "block", opacity: .7, fontWeight: 900 }}>THIS INVOICE EX GST</small><strong style={{ fontSize: 22 }}>{money(previewSubtotal)}</strong></span>
          <span><small style={{ display: "block", opacity: .7, fontWeight: 900 }}>GST</small><strong style={{ fontSize: 22 }}>{money(gst)}</strong></span>
          <span><small style={{ display: "block", opacity: .7, fontWeight: 900 }}>INVOICE TOTAL</small><strong style={{ fontSize: 25 }}>{money(previewSubtotal + gst)}</strong></span>
        </div>
        <button type="submit" disabled={previewSubtotal <= 0.01} style={{ minHeight: 48, border: 0, borderRadius: 12, background: previewSubtotal > 0.01 ? "#2e90fa" : "#475467", color: "#fff", padding: "0 20px", fontWeight: 950, cursor: previewSubtotal > 0.01 ? "pointer" : "not-allowed" }}>Create MYOB invoice →</button>
      </div>
      <p style={{ margin: 0, color: "#667085", fontSize: 12 }}>PM validates the remaining job value again when you submit, so a stale browser cannot double-invoice the job. New MYOB invoices are created without automatically emailing the client.</p>
    </form>
  );
}
