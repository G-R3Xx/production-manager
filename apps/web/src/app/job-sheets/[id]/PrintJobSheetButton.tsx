"use client";

function safeDocumentTitle(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 140) || "Production Job Sheet";
}

export function PrintJobSheetButton({ printTitle }: { printTitle: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const previousTitle = document.title;
        const nextTitle = safeDocumentTitle(printTitle);
        const restoreTitle = () => {
          document.title = previousTitle;
          window.removeEventListener("afterprint", restoreTitle);
        };

        document.title = nextTitle;
        window.addEventListener("afterprint", restoreTitle, { once: true });
        window.print();
      }}
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
