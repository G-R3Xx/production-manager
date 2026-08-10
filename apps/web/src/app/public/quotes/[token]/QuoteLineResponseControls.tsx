"use client";

import { useState } from "react";
import { respondToQuoteLineAction } from "./actions";

type Props = {
  token: string;
  lineId: string;
  status: string;
  notes?: string | null;
  locked?: boolean;
};

const baseButton = {
  minHeight: 32,
  borderRadius: 10,
  padding: "0 10px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer"
} as const;

function statusLabel(status: string): string | null {
  if (status === "approved") return "Approved";
  if (status === "cancelled") return "Cancelled";
  if (status === "changes_requested") return "Changes requested";
  return null;
}

export function QuoteLineResponseControls({ token, lineId, status, notes, locked = false }: Props) {
  const [showChanges, setShowChanges] = useState(false);
  const label = statusLabel(status);

  if (locked) {
    return (
      <div className="quote-line-actions quote-print-hide" style={{ display: "grid", justifyItems: "end", gap: 5 }}>
        {label ? <strong style={{ fontSize: 12, color: status === "approved" ? "#067647" : status === "cancelled" ? "#b42318" : "#c2410c" }}>{label}</strong> : null}
        {notes ? <span style={{ maxWidth: 230, color: "#667085", fontSize: 11, textAlign: "right", lineHeight: 1.35 }}>{notes}</span> : null}
      </div>
    );
  }

  return (
    <div className="quote-line-actions quote-print-hide" style={{ display: "grid", justifyItems: "end", gap: 6, minWidth: 0 }}>
      {label ? <strong style={{ fontSize: 11, color: status === "approved" ? "#067647" : status === "cancelled" ? "#b42318" : "#c2410c" }}>{label}</strong> : null}
      <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <form action={respondToQuoteLineAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="lineId" value={lineId} />
          <input type="hidden" name="response" value="approved" />
          <button type="submit" style={{ ...baseButton, border: "1px solid #abefc6", background: status === "approved" ? "#dcfae6" : "#ecfdf3", color: "#067647" }}>Approve</button>
        </form>
        <form action={respondToQuoteLineAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="lineId" value={lineId} />
          <input type="hidden" name="response" value="cancelled" />
          <button type="submit" style={{ ...baseButton, border: "1px solid #fecaca", background: status === "cancelled" ? "#fee4e2" : "#fff5f4", color: "#b42318" }}>Cancel</button>
        </form>
        <button type="button" onClick={() => setShowChanges((value: boolean) => !value)} style={{ ...baseButton, border: "1px solid #fed7aa", background: status === "changes_requested" ? "#ffedd5" : "#fff7ed", color: "#c2410c" }}>Request changes</button>
      </div>
      {showChanges ? (
        <form action={respondToQuoteLineAction} style={{ width: "min(260px, 100%)", display: "grid", gap: 5 }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="lineId" value={lineId} />
          <input type="hidden" name="response" value="changes_requested" />
          <textarea name="notes" required defaultValue={status === "changes_requested" ? notes ?? "" : ""} placeholder="What needs changing?" style={{ minHeight: 58, resize: "vertical", borderRadius: 9, border: "1px solid #fed7aa", padding: "7px 9px", font: "inherit", fontSize: 12 }} />
          <button type="submit" style={{ ...baseButton, border: "1px solid #c2410c", background: "#c2410c", color: "#fff" }}>Send change request</button>
        </form>
      ) : notes && status === "changes_requested" ? <span style={{ maxWidth: 250, color: "#9a3412", fontSize: 11, textAlign: "right", lineHeight: 1.35 }}>{notes}</span> : null}
    </div>
  );
}
