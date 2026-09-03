"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type ManualApprovalAction = (formData: FormData) => void | Promise<void>;

type Props = {
  action: ManualApprovalAction;
  quoteId: string;
  clientName?: string | null;
};

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        minHeight: 44,
        borderRadius: 12,
        border: "1px solid #067647",
        background: pending ? "#94a3b8" : "#067647",
        color: "#fff",
        fontWeight: 950,
        padding: "0 16px",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "Recording…" : "Mark quote accepted"}
    </button>
  );
}

export function ManualQuoteApprovalModalForm({ action, quoteId, clientName }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Use when the client approved the attached PDF by email or another offline method."
        style={{
          minHeight: 44,
          borderRadius: 14,
          border: "1px solid #86efac",
          background: "#f0fdf4",
          color: "#067647",
          fontWeight: 950,
          padding: "0 14px",
          cursor: "pointer",
        }}
      >
        Record email / PDF approval
      </button>

      {open ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(15,23,42,0.55)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-quote-approval-title"
            style={{
              width: "min(560px, 100%)",
              borderRadius: 20,
              border: "1px solid #dbe4f0",
              background: "#fff",
              boxShadow: "0 24px 70px rgba(15,23,42,0.28)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #e4e7ec", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
              <div>
                <div style={{ color: "#067647", fontSize: 11, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>
                  Offline client approval
                </div>
                <h2 id="manual-quote-approval-title" style={{ margin: 0, color: "#101828", fontSize: 21 }}>Record quote approval</h2>
                <p style={{ margin: "6px 0 0", color: "#667085", fontSize: 13, lineHeight: 1.45 }}>
                  Use this when {clientName || "the client"} has approved the emailed PDF, replied by email, or confirmed approval another way outside the online quote page.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid #e4e7ec", background: "#fff", color: "#475467", fontSize: 20, cursor: "pointer" }}>×</button>
            </div>

            <form action={action} style={{ padding: 20, display: "grid", gap: 16 }}>
              <input type="hidden" name="quoteId" value={quoteId} />
              <div style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 12, padding: "11px 12px", fontSize: 12, lineHeight: 1.5 }}>
                Confirming this will mark the quote <strong>Accepted</strong> and allow the normal MYOB/order workflow to continue. Use it only after you have received the client&apos;s approval.
              </div>
              <label style={{ display: "grid", gap: 7, color: "#344054", fontSize: 12, fontWeight: 900 }}>
                Approval note (optional)
                <textarea
                  name="manualApprovalNote"
                  placeholder="e.g. Approved by Michael Burgess via email on 3 Sep 2026"
                  style={{ minHeight: 90, borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", padding: 12, fontSize: 14, color: "#101828", fontFamily: "inherit", resize: "vertical" }}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setOpen(false)} style={{ minHeight: 44, borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", color: "#344054", fontWeight: 900, padding: "0 16px", cursor: "pointer" }}>Cancel</button>
                <ConfirmButton />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
