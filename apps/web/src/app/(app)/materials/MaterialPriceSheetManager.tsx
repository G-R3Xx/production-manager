"use client";

import { useState, useTransition } from "react";
import { applyMaterialPriceSheetAction, previewMaterialPriceSheetAction } from "./actions";

type RowStatus = "change" | "unchanged" | "unmatched" | "ambiguous" | "invalid";
type Operation = "update" | "add" | "hide" | "delete" | "restore" | "none";
type PreviewRow = {
  rowNumber: number;
  sheetName?: string;
  sourceName: string;
  sourceSupplier: string | null;
  matchedMaterialId: string | null;
  matchedMaterialName: string | null;
  currentPurchaseCost: number | null;
  proposedPurchaseCost: number | null;
  priceCheckedAt: string | null;
  operation: Operation;
  status: RowStatus;
  note: string;
};
type Preview = {
  format: "production-manager-xlsx" | "production-manager" | "legacy-small-format" | "unknown";
  rows: PreviewRow[];
  parsedRows: number;
  matchedRows: number;
  changeRows: number;
  unchangedRows: number;
  unmatchedRows: number;
  ambiguousRows: number;
  invalidRows: number;
  addRows: number;
  hideRows: number;
  deleteRows: number;
  restoreRows: number;
  updateRows: number;
};
type PreviewResult = { ok: true; fileName: string; preview: Preview } | { ok: false; error: string };
type ApplyResult =
  | { ok: true; updated: number; added: number; hidden: number; deleted: number; restored: number; syncQueued: number; skipped: number; unchanged: number }
  | { ok: false; error: string };

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 5 });

function operationLabel(operation: Operation): string {
  switch (operation) {
    case "add": return "Add material";
    case "hide": return "Hide";
    case "delete": return "Delete / archive";
    case "restore": return "Restore";
    case "update": return "Update price";
    default: return "No change";
  }
}
function statusLabel(row: PreviewRow): string {
  if (row.status === "change") return operationLabel(row.operation);
  if (row.status === "unchanged") return "No change";
  if (row.status === "unmatched") return "No match";
  if (row.status === "ambiguous") return "Check match";
  return "Invalid";
}
function statusStyle(status: RowStatus) {
  if (status === "change") return { background: "#ecfdf3", color: "#067647", border: "1px solid #abefc6" };
  if (status === "unchanged") return { background: "#f2f4f7", color: "#475467", border: "1px solid #eaecf0" };
  return { background: "#fff7ed", color: "#b54708", border: "1px solid #fed7aa" };
}

export function MaterialPriceSheetManager() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [syncMyob, setSyncMyob] = useState(false);
  const [isPending, startTransition] = useTransition();

  function chooseFile(next: File | null) { setFile(next); setPreview(null); setMessage(""); setError(""); }
  function runPreview() {
    if (!file) { setError("Choose the edited .xlsx workbook first."); return; }
    setError(""); setMessage(""); const formData = new FormData(); formData.set("file", file);
    startTransition(async () => {
      const result = await previewMaterialPriceSheetAction(formData) as PreviewResult;
      if (!result.ok) { setPreview(null); setError(result.error); return; }
      setPreview(result.preview);
      setMessage(result.preview.format === "legacy-small-format"
        ? "Legacy Small Format CSV detected. PM will only apply safe price matches. For add/hide/delete, use the new PM Excel workbook."
        : "PM material workbook detected. Department tabs and stable Material IDs will be used to apply changes safely.");
    });
  }
  function applyChanges() {
    if (!file || !preview || preview.changeRows < 1) return;
    const summary = [
      preview.updateRows ? `${preview.updateRows} price update${preview.updateRows === 1 ? "" : "s"}` : "",
      preview.addRows ? `${preview.addRows} new material${preview.addRows === 1 ? "" : "s"}` : "",
      preview.hideRows ? `${preview.hideRows} hidden` : "",
      preview.deleteRows ? `${preview.deleteRows} deleted/archived` : "",
      preview.restoreRows ? `${preview.restoreRows} restored` : ""
    ].filter(Boolean).join(" · ");
    if (!window.confirm(`Apply these material changes?\n\n${summary}\n\nExisting quotes and historical jobs will not be repriced.`)) return;
    setError(""); setMessage(""); const formData = new FormData(); formData.set("file", file); if (syncMyob) formData.set("syncMyob", "true");
    startTransition(async () => {
      const result = await applyMaterialPriceSheetAction(formData) as ApplyResult;
      if (!result.ok) { setError(result.error); return; }
      const parts = [
        result.updated ? `${result.updated} price${result.updated === 1 ? "" : "s"} updated` : "",
        result.added ? `${result.added} material${result.added === 1 ? "" : "s"} added` : "",
        result.hidden ? `${result.hidden} hidden` : "",
        result.deleted ? `${result.deleted} deleted/archived` : "",
        result.restored ? `${result.restored} restored` : "",
        result.syncQueued ? `${result.syncQueued} MYOB sync${result.syncQueued === 1 ? "" : "s"} queued` : "",
        result.skipped ? `${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped safely` : ""
      ].filter(Boolean);
      setMessage(parts.length ? `${parts.join(" · ")}.` : "No changes were required.");
      setPreview(null); setFile(null);
      const input = document.getElementById("material-price-workbook") as HTMLInputElement | null; if (input) input.value = "";
    });
  }

  const visibleRows = preview?.rows.filter((row) => row.status !== "unchanged").slice(0, 100) ?? [];

  return (
    <details style={{ border: "1px solid #bfdbfe", borderRadius: 18, background: "#f8fbff", padding: 16 }}>
      <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 18, color: "#1e3a8a" }}>Spreadsheet material manager</summary>
      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        <div style={{ display: "grid", gap: 6, color: "#475467", lineHeight: 1.5 }}>
          <strong style={{ color: "#101828" }}>One Google Sheets workbook, split into department tabs.</strong>
          <span>The workbook contains <b>Signage</b>, <b>Small Format</b>, <b>Plan Printing</b>, <b>Poster Printing</b> and <b>Shared + Consumables</b>. Update prices, add new materials, hide old stock, archive/delete it, or restore it — then upload the workbook and preview before anything is changed.</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/api/materials/price-sheet" style={{ minHeight: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 12, padding: "0 14px", background: "#2563eb", color: "#fff", fontWeight: 850, textDecoration: "none" }}>Download material workbook (.xlsx)</a>
          <a href="/api/materials/price-sheet?format=csv&group=small-format" style={{ minHeight: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 12, padding: "0 14px", background: "#fff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontWeight: 850, textDecoration: "none" }}>Legacy Small Format CSV</a>
        </div>

        <div style={{ border: "1px solid #dbeafe", background: "#eff6ff", borderRadius: 12, padding: 12, color: "#1e3a8a", fontSize: 13, lineHeight: 1.5 }}>
          <b>Google Sheets:</b> upload/open the .xlsx in Google Sheets. When finished choose <b>File → Download → Microsoft Excel (.xlsx)</b>, then upload that file below. For new material rows set <b>Action = ADD</b>. For existing rows use <b>HIDE</b>, <b>DELETE</b> or <b>RESTORE</b> in the Action column.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: "#344054" }}>Upload edited workbook</span>
            <input id="material-price-workbook" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} style={{ minHeight: 42, border: "1px solid #d0d5dd", borderRadius: 12, background: "#fff", padding: 8 }} />
          </label>
          <button type="button" onClick={runPreview} disabled={isPending || !file} style={{ minHeight: 42, borderRadius: 12, border: "none", background: isPending || !file ? "#98a2b3" : "#111827", color: "#fff", fontWeight: 850, padding: "0 16px", cursor: isPending || !file ? "not-allowed" : "pointer" }}>{isPending ? "Checking…" : "Preview changes"}</button>
        </div>

        {message ? <div style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 12, padding: 12, fontWeight: 700 }}>{message}</div> : null}
        {error ? <div style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 12, padding: 12, fontWeight: 700 }}>{error}</div> : null}

        {preview ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ borderRadius: 999, padding: "5px 10px", background: "#eef2ff", color: "#4338ca", fontWeight: 850, fontSize: 12 }}>{preview.format === "production-manager-xlsx" ? "PM multi-tab workbook" : preview.format === "legacy-small-format" ? "Legacy Small Format CSV" : "PM CSV"}</span>
              <span style={{ fontSize: 13, color: "#475467" }}>{preview.changeRows} changes · {preview.unchangedRows} unchanged · {preview.unmatchedRows + preview.ambiguousRows + preview.invalidRows} need attention</span>
              {preview.addRows ? <span style={{ fontSize: 12, fontWeight: 850, color: "#067647" }}>{preview.addRows} add</span> : null}
              {preview.hideRows ? <span style={{ fontSize: 12, fontWeight: 850 }}>{preview.hideRows} hide</span> : null}
              {preview.deleteRows ? <span style={{ fontSize: 12, fontWeight: 850, color: "#b42318" }}>{preview.deleteRows} delete/archive</span> : null}
              {preview.restoreRows ? <span style={{ fontSize: 12, fontWeight: 850, color: "#175cd3" }}>{preview.restoreRows} restore</span> : null}
            </div>

            {visibleRows.length ? (
              <div style={{ overflowX: "auto", border: "1px solid #e4e7ec", borderRadius: 14, background: "#fff" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920, fontSize: 13 }}>
                  <thead><tr style={{ background: "#f9fafb", color: "#344054", textAlign: "left" }}>
                    <th style={{ padding: "10px 12px" }}>Tab / row</th><th style={{ padding: "10px 12px" }}>Spreadsheet item</th><th style={{ padding: "10px 12px" }}>PM material</th><th style={{ padding: "10px 12px", textAlign: "right" }}>Current</th><th style={{ padding: "10px 12px", textAlign: "right" }}>New</th><th style={{ padding: "10px 12px" }}>Action</th>
                  </tr></thead>
                  <tbody>{visibleRows.map((row) => (
                    <tr key={`${row.sheetName ?? "csv"}-${row.rowNumber}-${row.sourceName}`} style={{ borderTop: "1px solid #eaecf0", verticalAlign: "top" }}>
                      <td style={{ padding: "10px 12px", color: "#667085", whiteSpace: "nowrap" }}>{row.sheetName ? `${row.sheetName} · ${row.rowNumber}` : row.rowNumber}</td>
                      <td style={{ padding: "10px 12px" }}><strong>{row.sourceName}</strong>{row.sourceSupplier ? <div style={{ color: "#667085", marginTop: 3 }}>{row.sourceSupplier}</div> : null}</td>
                      <td style={{ padding: "10px 12px" }}>{row.matchedMaterialName ?? (row.operation === "add" ? <span style={{ color: "#067647", fontWeight: 800 }}>New material</span> : <span style={{ color: "#b54708" }}>Not safely matched</span>)}<div style={{ color: "#667085", marginTop: 3, maxWidth: 420 }}>{row.note}</div></td>
                      <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{row.currentPurchaseCost == null ? "—" : money.format(row.currentPurchaseCost)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap", fontWeight: row.status === "change" ? 850 : 600 }}>{row.proposedPurchaseCost == null ? "—" : money.format(row.proposedPurchaseCost)}</td>
                      <td style={{ padding: "10px 12px" }}><span style={{ ...statusStyle(row.status), display: "inline-flex", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 850, whiteSpace: "nowrap" }}>{statusLabel(row)}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div style={{ color: "#667085", fontSize: 13 }}>No changed or invalid rows to show.</div>}
            {preview.rows.filter((row) => row.status !== "unchanged").length > visibleRows.length ? <div style={{ color: "#667085", fontSize: 12 }}>Showing the first {visibleRows.length} changed/attention rows.</div> : null}

            <label style={{ display: "flex", alignItems: "center", gap: 9, color: "#344054", fontSize: 13, fontWeight: 700 }}>
              <input type="checkbox" checked={syncMyob} onChange={(event) => setSyncMyob(event.target.checked)} />
              Also queue changed/new material records to MYOB Items
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={applyChanges} disabled={isPending || preview.changeRows < 1} style={{ minHeight: 44, borderRadius: 12, border: "none", background: isPending || preview.changeRows < 1 ? "#98a2b3" : "#067647", color: "#fff", fontWeight: 900, padding: "0 18px", cursor: isPending || preview.changeRows < 1 ? "not-allowed" : "pointer" }}>{isPending ? "Applying…" : `Apply ${preview.changeRows} material change${preview.changeRows === 1 ? "" : "s"}`}</button>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
