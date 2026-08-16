"use client";

export function PrintJobSheetButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="job-sheet-print-button"
      style={{
        border: 0,
        borderRadius: 12,
        padding: "11px 16px",
        background: "#0f172a",
        color: "#fff",
        fontWeight: 900,
        cursor: "pointer"
      }}
    >
      Print / Save PDF
    </button>
  );
}
