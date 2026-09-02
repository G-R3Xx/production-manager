"use client";

import { useFormStatus } from "react-dom";

type Props = {
  disabled: boolean;
  recipient: string;
  alreadySent: boolean;
};

export function ArtworkEmailSendButton({ disabled, recipient, alreadySent }: Props) {
  const { pending } = useFormStatus();
  const inactive = disabled || pending;
  const title = pending
    ? "Sending artwork approval…"
    : alreadySent
      ? "Resend artwork approval"
      : "Email artwork approval";
  const detail = pending
    ? "Building the PDF pack and sending the artwork…"
    : `Send client link + PDF to ${recipient}`;

  return (
    <button
      type="submit"
      className="artwork-email-send"
      disabled={inactive}
      aria-busy={pending}
    >
      <span className="artwork-email-send-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      </span>
      <span className="artwork-email-send-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="artwork-email-send-arrow" aria-hidden="true">→</span>
    </button>
  );
}
