"use client";

export function PrintQuoteButton() {
  return (
    <button
      type="button"
      className="quote-print-hide"
      onClick={() => window.print()}
      style={{
        minHeight: 40,
        borderRadius: 12,
        border: "1px solid #cbd5e1",
        background: "#fff",
        color: "#0f172a",
        fontWeight: 900,
        cursor: "pointer",
        padding: "0 14px",
        marginTop: 4
      }}
    >
      Print
    </button>
  );
}
