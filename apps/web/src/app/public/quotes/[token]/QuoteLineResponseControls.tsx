"use client";

import { useEffect, useState, useTransition } from "react";
import { respondToQuoteLineFastAction, type FastQuoteLineResponseResult } from "./actions";

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
  const [localStatus, setLocalStatus] = useState(status);
  const [localNotes, setLocalNotes] = useState(notes ?? null);
  const [showChanges, setShowChanges] = useState(false);
  const [changeNote, setChangeNote] = useState(status === "changes_requested" ? notes ?? "" : "");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [quoteLocked, setQuoteLocked] = useState(locked);
  const [isPending, startTransition] = useTransition();
  const label = statusLabel(localStatus);

  useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<FastQuoteLineResponseResult>).detail;
      if (detail?.quoteStatus === "accepted" || detail?.quoteStatus === "declined") setQuoteLocked(true);
    };
    window.addEventListener("quote-line-response-saved", onSaved);
    return () => window.removeEventListener("quote-line-response-saved", onSaved);
  }, []);

  const submitResponse = (response: "approved" | "changes_requested" | "cancelled", responseNotes: string | null = null) => {
    if (isPending || quoteLocked) return;
    const trimmedNotes = String(responseNotes ?? "").trim() || null;
    if (response === "changes_requested" && !trimmedNotes) {
      setFeedback("Please add a short note first.");
      return;
    }

    const previousStatus = localStatus;
    const previousNotes = localNotes;
    setLocalStatus(response);
    setLocalNotes(trimmedNotes);
    setFeedback("Saving…");
    if (response !== "changes_requested") setShowChanges(false);

    startTransition(async () => {
      const result = await respondToQuoteLineFastAction({ token, lineId, response, notes: trimmedNotes });
      if (!result.ok) {
        setLocalStatus(previousStatus);
        setLocalNotes(previousNotes);
        setFeedback(result.message);
        return;
      }
      setLocalStatus(result.lineStatus ?? response);
      setLocalNotes(result.notes ?? trimmedNotes);
      setFeedback("Saved");
      setShowChanges(false);
      window.dispatchEvent(new CustomEvent<FastQuoteLineResponseResult>("quote-line-response-saved", { detail: result }));
      window.setTimeout(() => setFeedback((value) => value === "Saved" ? null : value), 1300);
    });
  };

  if (quoteLocked) {
    return (
      <div className="quote-line-actions quote-print-hide" style={{ display: "grid", justifyItems: "end", gap: 5 }}>
        {label ? <strong style={{ fontSize: 12, color: localStatus === "approved" ? "#067647" : localStatus === "cancelled" ? "#b42318" : "#c2410c" }}>{label}</strong> : null}
        {localNotes ? <span style={{ maxWidth: 230, color: "#667085", fontSize: 11, textAlign: "right", lineHeight: 1.35 }}>{localNotes}</span> : null}
      </div>
    );
  }

  return (
    <div className="quote-line-actions quote-print-hide" style={{ display: "grid", justifyItems: "end", gap: 6, minWidth: 0 }}>
      <div style={{ minHeight: 16, display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
        {label ? <strong style={{ fontSize: 11, color: localStatus === "approved" ? "#067647" : localStatus === "cancelled" ? "#b42318" : "#c2410c" }}>{label}</strong> : null}
        {feedback ? <span style={{ fontSize: 10, color: feedback === "Saved" ? "#067647" : feedback === "Saving…" ? "#667085" : "#b42318" }}>{feedback}</span> : null}
      </div>
      <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button disabled={isPending} type="button" onClick={() => submitResponse("approved")} style={{ ...baseButton, opacity: isPending ? 0.65 : 1, border: "1px solid #abefc6", background: localStatus === "approved" ? "#dcfae6" : "#ecfdf3", color: "#067647" }}>Approve</button>
        <button disabled={isPending} type="button" onClick={() => submitResponse("cancelled")} style={{ ...baseButton, opacity: isPending ? 0.65 : 1, border: "1px solid #fecaca", background: localStatus === "cancelled" ? "#fee4e2" : "#fff5f4", color: "#b42318" }}>Cancel</button>
        <button disabled={isPending} type="button" onClick={() => setShowChanges((value) => !value)} style={{ ...baseButton, opacity: isPending ? 0.65 : 1, border: "1px solid #fed7aa", background: localStatus === "changes_requested" ? "#ffedd5" : "#fff7ed", color: "#c2410c" }}>Request changes</button>
      </div>
      {showChanges ? (
        <div style={{ width: "min(260px, 100%)", display: "grid", gap: 5 }}>
          <textarea value={changeNote} onChange={(event) => setChangeNote(event.target.value)} placeholder="What needs changing?" style={{ minHeight: 58, resize: "vertical", borderRadius: 9, border: "1px solid #fed7aa", padding: "7px 9px", font: "inherit", fontSize: 12 }} />
          <button disabled={isPending} type="button" onClick={() => submitResponse("changes_requested", changeNote)} style={{ ...baseButton, opacity: isPending ? 0.65 : 1, border: "1px solid #c2410c", background: "#c2410c", color: "#fff" }}>Send change request</button>
        </div>
      ) : localNotes && localStatus === "changes_requested" ? <span style={{ maxWidth: 250, color: "#9a3412", fontSize: 11, textAlign: "right", lineHeight: 1.35 }}>{localNotes}</span> : null}
    </div>
  );
}
