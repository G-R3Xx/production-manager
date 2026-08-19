"use client";

import { useFormStatus } from "react-dom";

export function ReopenArtworkPageButton({ pageLabel }: { pageLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(`Reopen ${pageLabel}?\n\nThis revokes approval for this page. If the whole artwork set was already accepted, Production Manager will start a new revision and pause active production until the revised set is approved again.`)) {
          event.preventDefault();
        }
      }}
      style={{ minHeight: 34, width: "100%", borderRadius: 10, border: "1px solid #fdba74", background: pending ? "#f2f4f7" : "#fff7ed", color: "#c2410c", fontWeight: 900, cursor: pending ? "wait" : "pointer", fontSize: 11 }}
    >
      {pending ? "Reopening page…" : "Reopen page approval"}
    </button>
  );
}
