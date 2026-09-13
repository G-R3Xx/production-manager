"use client";

import { useState, useTransition } from "react";
import { applyMaterialPriceSheetAction, previewMaterialPriceSheetAction } from "./actions";

type RowStatus = "change" | "unchanged" | "unmatched" | "ambiguous" | "invalid";
type PreviewRow = {
  rowNumber: number;
  sourceName: string;
  sourceSupplier: string | null;
  matchedMaterialId: string | null;
  matchedMaterialName: string | null;
  currentPurchaseCost: number | null;
  proposedPurchaseCost: number | null;
  priceCheckedAt: string | null;
  status: RowStatus;
  note: string;
};
type Preview = {
  format: "production-manager" | "legacy-small-format" | "unknown";
  rows: PreviewRow[];
  parsedRows: number;
  matchedRows: number;
  changeRows: number;
  unchangedRows: number;
  unmatchedRows: number;
  ambiguousRows: number;
  invalidRows: number;
};

type PreviewResult =
  | { ok: true; fileName: string; preview: Preview }
  | { ok: false; error: string };

type ApplyResult =
  | { ok: true; updated: number; syncQueued: number; skipped: number; unchanged: number }
  | { ok: false; error: string };

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 5 });

function statusLabel(status: RowStatus): string {
  switch (status) {
    case "change": return "Will update";
    case "unchanged": return "No change";
    case "unmatched": return "No match";
    case "ambiguous": return "Check match";
    case "invalid": return "Invalid";
  }
}

function statusStyle(status: RowStatus) {
  if (status === "change") return { background: "#ecfdf3", color: "#067647", border: "1px solid #abefc6" };
  if (status === "unchanged") return { background: "#f2f4f7", color: "#475467", border: "1px solid #eaecf0" };
  return { background: "#fff7ed", color: "#b54708", border: "1px solid #fed7aa" };
}

export function MaterialPriceSheetManager() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [syncMyob, setSyncMyob] = useState(false);
  const [isPending, startTransition] = useTransition();

  function chooseFile(next: File | null) {
    setFile(next);
    setPreview(null);
    setMessage("");
    setError("");
  }

  function runPreview() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await previewMaterialPriceSheetAction(formData) as PreviewResult;
      if (!result.ok) {
        setPreview(null);
        setError(result.error);
        return;
      }
      setPreview(result.preview);
      setMessage(result.preview.format === "legacy-small-format"
        ? "Legacy Small Format sheet detected. PM will only apply safe, unambiguous matches; unmatched rows are left untouched."
        : "Production Manager price sheet detected. Rows are matched by the hidden/stable PM Material ID.");
    });
  }

  function applyChanges() {
    if (!file || !preview || preview.changeRows < 1) return;
    if (!window.confirm(`Apply ${preview.changeRows} material price change${preview.changeRows === 1 ? "" : "s"}? Existing quotes will not be repriced.`)) return;
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.set("file", file);
    if (syncMyob) formData.set("syncMyob", "true");
    startTransition(async () => {
      const result = await applyMaterialPriceSheetAction(formData) as ApplyResult;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`${result.updated} material price${result.updated === 1 ? "" : "s"} updated${result.syncQueued ? ` · ${result.syncQueued} MYOB sync${result.syncQueued === 1 ? "" : "s"} queued` : ""}${result.skipped ? ` · ${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped safely` : ""}.`);
      setPreview(null);
      setFile(null);
      const input = document.getElementById("material-price-csv") as HTMLInputElement | null;
      if (input) input.value = "";
    });
  }

  const visibleRows = preview?.rows.slice(0, 80) ?? [];

  return (
    <details style={{ border: "1px solid #bfdbfe", borderRadius: 18, background: "#f8fbff", padding: 16 }}>
      <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 18, color: "#1e3a8a" }}>Spreadsheet price updates</summary>
      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        <div style={{ display: "grid", gap: 6, color: "#475467", lineHeight: 1.5 }}>
          <strong style={{ color: "#101828" }}>Fast workflow: download → edit in Excel/Sheets → upload → preview → apply.</strong>
          <span>For routine updates, use the PM-exported CSV because every row contains a stable Material ID. Your older Small Format CSV layout is also recognised as a legacy import, but uncertain matches are deliberately skipped.</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/api/materials/price-sheet?group=small-format" style={{ minHeight: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 12, padding: "0 14px", background: "#2563eb", color: "#fff", fontWeight: 850, textDecoration: "none" }}>Download Small Format CSV</a>
          <a href="/api/materials/price-sheet?group=all" style={{ minHeight: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 12, padding: "0 14px", background: "#fff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontWeight: 850, textDecoration: "none" }}>Download all material prices</a>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: "#344054" }}>Upload edited CSV</span>
            <input id="material-price-csv" type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} style={{ minHeight: 42, border: "1px solid #d0d5dd", borderRadius: 12, background: "#fff", padding: 8 }} />
          </label>
          <button type="button" onClick={runPreview} disabled={isPending || !file} style={{ minHeight: 42, borderRadius: 12, border: "none", background: isPending || !file ? "#98a2b3" : "#111827", color: "#fff", fontWeight: 850, padding: "0 16px", cursor: isPending || !file ? "not-allowed" : "pointer" }}>{isPending ? "Checking…" : "Preview changes"}</button>
        </div>

        {message ? <div style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 12, padding: 12, fontWeight: 700 }}>{message}</div> : null}
        {error ? <div style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 12, padding: 12, fontWeight: 700 }}>{error}</div> : null}

        {preview ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ borderRadius: 999, padding: "5px 10px", background: "#eef2ff", color: "#4338ca", fontWeight: 850, fontSize: 12 }}>{preview.format === "production-manager" ? "PM price sheet" : "Legacy Small Format"}</span>
              <span style={{ fontSize: 13, color: "#475467" }}>{preview.changeRows} changes · {preview.unchangedRows} unchanged · {preview.unmatchedRows + preview.ambiguousRows + preview.invalidRows} need attention</span>
            </div>

            <div style={{ overflowX: "auto", border: "1px solid #e4e7ec", borderRadius: 14, background: "#fff" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", color: "#344054", textAlign: "left" }}>
                    <th style={{ padding: "10px 12px" }}>CSV row</th>
                    <th style={{ padding: "10px 12px" }}>Spreadsheet item</th>
                    <th style={{ padding: "10px 12px" }}>PM material</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Current</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>New</th>
                    <th style={{ padding: "10px 12px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.sourceName}`} style={{ borderTop: "1px solid #eaecf0", verticalAlign: "top" }}>
                      <td style={{ padding: "10px 12px", color: "#667085" }}>{row.rowNumber}</td>
                      <td style={{ padding: "10px 12px" }}><strong>{row.sourceName}</strong>{row.sourceSupplier ? <div style={{ color: "#667085", marginTop: 3 }}>{row.sourceSupplier}</div> : null}</td>
                      <td style={{ padding: "10px 12px" }}>{row.matchedMaterialName ?? <span style={{ color: "#b54708" }}>Not safely matched</span>}<div style={{ color: "#667085", marginTop: 3, maxWidth: 380 }}>{row.note}</div></td>
                      <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{row.currentPurchaseCost == null ? "—" : money.format(row.currentPurchaseCost)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap", fontWeight: row.status === "change" ? 850 : 600 }}>{row.proposedPurchaseCost == null ? "—" : money.format(row.proposedPurchaseCost)}</td>
                      <td style={{ padding: "10px 12px" }}><span style={{ ...statusStyle(row.status), display: "inline-flex", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 850, whiteSpace: "nowrap" }}>{statusLabel(row.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > visibleRows.length ? <div style={{ color: "#667085", fontSize: 12 }}>Showing the first {visibleRows.length} of {preview.rows.length} parsed rows.</div> : null}

            <label style={{ display: "flex", alignItems: "center", gap: 9, color: "#344054", fontSize: 13, fontWeight: 700 }}>
              <input type="checkbox" checked={syncMyob} onChange={(event) => setSyncMyob(event.target.checked)} />
              Also queue updated material costs to MYOB Items
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={applyChanges} disabled={isPending || preview.changeRows < 1} style={{ minHeight: 44, borderRadius: 12, border: "none", background: isPending || preview.changeRows < 1 ? "#98a2b3" : "#067647", color: "#fff", fontWeight: 900, padding: "0 18px", cursor: isPending || preview.changeRows < 1 ? "not-allowed" : "pointer" }}>{isPending ? "Applying…" : `Apply ${preview.changeRows} price change${preview.changeRows === 1 ? "" : "s"}`}</button>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
