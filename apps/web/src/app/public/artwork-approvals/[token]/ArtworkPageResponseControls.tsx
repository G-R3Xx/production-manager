"use client";

import { useEffect, useState } from "react";
import { useArtworkDecisions } from "./ArtworkDecisionContext";

type PageStatus = "pending" | "approved" | "changes_requested";

export function ArtworkPageResponseControls({
  pageId,
  status,
  notes,
  isOpen
}: {
  token?: string;
  pageId: string;
  status: PageStatus;
  notes: string | null;
  isOpen: boolean;
}) {
  const { decisionFor, setDecision } = useArtworkDecisions();
  const decision = decisionFor(pageId);
  const localStatus = decision.status || status;
  const localNotes = decision.notes ?? (localStatus === "changes_requested" ? notes : null);
  const [showChanges, setShowChanges] = useState(localStatus === "changes_requested");
  const [changeNote, setChangeNote] = useState(localNotes ?? "");
  const approved = localStatus === "approved";
  const changesRequested = localStatus === "changes_requested";

  useEffect(() => {
    setShowChanges(localStatus === "changes_requested");
    setChangeNote(localNotes ?? "");
  }, [localNotes, localStatus]);

  function approvePage() {
    setDecision(pageId, "approved", null);
    setShowChanges(false);
  }

  function saveChangeRequest() {
    const trimmed = changeNote.trim();
    if (!trimmed) return;
    setDecision(pageId, "changes_requested", trimmed);
    setShowChanges(false);
  }

  return (
    <section style={{ borderTop: "1px solid #d0d5dd", paddingTop: 12, display: "grid", gap: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong style={{ fontSize: 12 }}>Decision for this page</strong>
        <span style={{ borderRadius: 999, border: `1px solid ${approved ? "#abefc6" : changesRequested ? "#fed7aa" : "#d0d5dd"}`, background: approved ? "#ecfdf3" : changesRequested ? "#fff7ed" : "#f8fafc", color: approved ? "#067647" : changesRequested ? "#c2410c" : "#475467", padding: "4px 8px", fontSize: 10, fontWeight: 950 }}>{approved ? "Approved" : changesRequested ? "Changes requested" : "Awaiting decision"}</span>
      </div>
      {localNotes && !showChanges ? <p style={{ margin: 0, borderRadius: 10, background: changesRequested ? "#fff7ed" : "#f8fafc", color: changesRequested ? "#9a3412" : "#475467", padding: 9, fontSize: 11, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{localNotes}</p> : null}

      {isOpen ? (
        <>
          {!approved ? (
            <button type="button" onClick={approvePage} style={{ minHeight: 40, border: "none", borderRadius: 11, background: "#067647", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 13px", width: "100%" }}>✓ Approve this page</button>
          ) : (
            <button type="button" onClick={() => setDecision(pageId, "pending", null)} style={{ minHeight: 36, border: "1px solid #d0d5dd", borderRadius: 11, background: "#fff", color: "#475467", fontWeight: 850, cursor: "pointer" }}>Undo page decision</button>
          )}

          {!showChanges ? (
            <button type="button" onClick={() => setShowChanges(true)} style={{ minHeight: 38, border: "1px solid #fed7aa", borderRadius: 11, background: "#fff", color: "#c2410c", fontWeight: 900, cursor: "pointer" }}>{approved ? "Request a change instead" : changesRequested ? "Edit change request" : "Request changes to this page"}</button>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <textarea value={changeNote} onChange={(event) => setChangeNote(event.target.value)} required placeholder="Describe exactly what needs changing on this page…" style={{ minHeight: 88, border: "1px solid #fed7aa", borderRadius: 11, padding: 10, font: "inherit", fontSize: 12, resize: "vertical" }} />
              <button type="button" onClick={saveChangeRequest} disabled={!changeNote.trim()} style={{ minHeight: 40, border: "none", borderRadius: 11, background: changeNote.trim() ? "#c2410c" : "#fda29b", color: "#fff", fontWeight: 950, cursor: changeNote.trim() ? "pointer" : "not-allowed", padding: "0 13px", width: "100%" }}>Set change request</button>
              <button type="button" onClick={() => { setShowChanges(false); setChangeNote(localNotes ?? ""); }} style={{ border: "none", background: "transparent", color: "#667085", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>Cancel</button>
            </div>
          )}
          <span style={{ color: "#667085", fontSize: 10, lineHeight: 1.35 }}>Page decisions are kept locally until you submit the complete review below.</span>
        </>
      ) : null}
    </section>
  );
}
