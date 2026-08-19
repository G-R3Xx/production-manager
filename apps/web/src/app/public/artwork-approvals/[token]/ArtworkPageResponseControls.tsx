"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { approveArtworkPageAction, requestArtworkPageChangesAction } from "./actions";

type PageStatus = "pending" | "approved" | "changes_requested";

function SubmitButton({ label, pendingLabel, background }: { label: string; pendingLabel: string; background: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} style={{ minHeight: 40, border: "none", borderRadius: 11, background: pending ? "#98a2b3" : background, color: "#fff", fontWeight: 950, cursor: pending ? "wait" : "pointer", padding: "0 13px", width: "100%" }}>{pending ? pendingLabel : label}</button>;
}

export function ArtworkPageResponseControls({
  token,
  pageId,
  status,
  notes,
  isOpen
}: {
  token: string;
  pageId: string;
  status: PageStatus;
  notes: string | null;
  isOpen: boolean;
}) {
  const [showChanges, setShowChanges] = useState(status === "changes_requested");
  const approved = status === "approved";
  const changesRequested = status === "changes_requested";

  useEffect(() => {
    setShowChanges(status === "changes_requested");
  }, [status]);

  return (
    <section style={{ borderTop: "1px solid #d0d5dd", paddingTop: 12, display: "grid", gap: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong style={{ fontSize: 12 }}>Decision for this page</strong>
        <span style={{ borderRadius: 999, border: `1px solid ${approved ? "#abefc6" : changesRequested ? "#fed7aa" : "#d0d5dd"}`, background: approved ? "#ecfdf3" : changesRequested ? "#fff7ed" : "#f8fafc", color: approved ? "#067647" : changesRequested ? "#c2410c" : "#475467", padding: "4px 8px", fontSize: 10, fontWeight: 950 }}>{approved ? "Approved" : changesRequested ? "Changes requested" : "Awaiting decision"}</span>
      </div>
      {notes ? <p style={{ margin: 0, borderRadius: 10, background: changesRequested ? "#fff7ed" : "#f8fafc", color: changesRequested ? "#9a3412" : "#475467", padding: 9, fontSize: 11, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{notes}</p> : null}

      {isOpen ? (
        <>
          {!approved ? (
            <form action={approveArtworkPageAction}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="pageId" value={pageId} />
              <SubmitButton label="✓ Approve this page" pendingLabel="Approving page…" background="#067647" />
            </form>
          ) : null}

          {!showChanges ? (
            <button type="button" onClick={() => setShowChanges(true)} style={{ minHeight: 38, border: "1px solid #fed7aa", borderRadius: 11, background: "#fff", color: "#c2410c", fontWeight: 900, cursor: "pointer" }}>{approved ? "Request a change instead" : "Request changes to this page"}</button>
          ) : (
            <form action={requestArtworkPageChangesAction} style={{ display: "grid", gap: 8 }}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="pageId" value={pageId} />
              <textarea name="notes" defaultValue={notes ?? ""} required placeholder="Describe exactly what needs changing on this page…" style={{ minHeight: 88, border: "1px solid #fed7aa", borderRadius: 11, padding: 10, font: "inherit", fontSize: 12, resize: "vertical" }} />
              <SubmitButton label="Send page change request" pendingLabel="Sending request…" background="#c2410c" />
              {!changesRequested ? <button type="button" onClick={() => setShowChanges(false)} style={{ border: "none", background: "transparent", color: "#667085", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>Cancel</button> : null}
            </form>
          )}
        </>
      ) : null}
    </section>
  );
}
