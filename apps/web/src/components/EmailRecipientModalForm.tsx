"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type EmailAction = (formData: FormData) => void | Promise<void>;

type Props = {
  action: EmailAction;
  hiddenFields: Record<string, string>;
  defaultEmail?: string | null;
  disabled?: boolean;
  variant: "quote" | "artwork";
  alreadySent?: boolean;
  modalTitle: string;
  modalDescription: string;
  submitLabel?: string;
};

function SendButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        minHeight: 44,
        borderRadius: 12,
        border: "1px solid #0f766e",
        background: pending ? "#94a3b8" : "#0f766e",
        color: "#fff",
        fontWeight: 950,
        padding: "0 16px",
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "Sending…" : label}
    </button>
  );
}

export function EmailRecipientModalForm({
  action,
  hiddenFields,
  defaultEmail,
  disabled = false,
  variant,
  alreadySent = false,
  modalTitle,
  modalDescription,
  submitLabel = "Send link + PDF",
}: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");

  const isArtwork = variant === "artwork";
  const triggerTitle = alreadySent
    ? isArtwork ? "Resend artwork approval" : "Resend link + PDF"
    : isArtwork ? "Email artwork approval" : "Send client link + PDF";

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setEmail(defaultEmail ?? "");
          setOpen(true);
        }}
        className={isArtwork ? "artwork-email-send" : undefined}
        style={isArtwork ? undefined : {
          minHeight: 44,
          borderRadius: 14,
          border: "1px solid #0f766e",
          background: "#0f766e",
          color: "#fff",
          fontWeight: 950,
          padding: "0 14px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {isArtwork ? (
          <>
            <span className="artwork-email-send-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </span>
            <span className="artwork-email-send-copy">
              <strong>{triggerTitle}</strong>
              <small>{defaultEmail ? `Confirm recipient: ${defaultEmail}` : "Choose the recipient email address"}</small>
            </span>
            <span className="artwork-email-send-arrow" aria-hidden="true">→</span>
          </>
        ) : triggerTitle}
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
            background: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-recipient-modal-title"
            style={{
              width: "min(520px, 100%)",
              borderRadius: 20,
              border: "1px solid #dbe4f0",
              background: "#fff",
              boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #e4e7ec", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
              <div>
                <div style={{ color: isArtwork ? "#7c3aed" : "#0f766e", fontSize: 11, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>
                  Confirm email recipient
                </div>
                <h2 id="email-recipient-modal-title" style={{ margin: 0, color: "#101828", fontSize: 21 }}>{modalTitle}</h2>
                <p style={{ margin: "6px 0 0", color: "#667085", fontSize: 13, lineHeight: 1.45 }}>{modalDescription}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid #e4e7ec", background: "#fff", color: "#475467", fontSize: 20, cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            <form action={action} style={{ padding: 20, display: "grid", gap: 16 }}>
              {Object.entries(hiddenFields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <label style={{ display: "grid", gap: 7, color: "#344054", fontSize: 12, fontWeight: 900 }}>
                Send to
                <input
                  type="email"
                  name="recipientEmail"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoFocus
                  placeholder="client@example.com"
                  style={{
                    minHeight: 48,
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    padding: "0 13px",
                    fontSize: 15,
                    color: "#101828",
                    outline: "none",
                  }}
                />
              </label>

              <div style={{ border: "1px solid #dbeafe", background: "#eff6ff", color: "#475467", borderRadius: 12, padding: "10px 12px", fontSize: 12, lineHeight: 1.45 }}>
                This changes the recipient for <strong>this email only</strong>. It does not overwrite the client/contact email saved in Production Manager.
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{ minHeight: 44, borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", color: "#344054", fontWeight: 900, padding: "0 16px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <SendButton label={submitLabel} />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
