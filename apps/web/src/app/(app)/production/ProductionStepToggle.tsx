"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  stepId: string;
  label?: string;
  initialStatus: string;
  initialCheckedAt?: string | null;
  initialCheckedBy?: string | null;
  board?: boolean;
};

function formatChecked(value: string | null): string {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" });
}

export function ProductionStepToggle({ stepId, label, initialStatus, initialCheckedAt = null, initialCheckedBy = null, board = false }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus === "done" ? "done" : "pending");
  const [checkedAt, setCheckedAt] = useState<string | null>(initialCheckedAt);
  const [checkedBy, setCheckedBy] = useState<string | null>(initialCheckedBy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus(initialStatus === "done" ? "done" : "pending");
    setCheckedAt(initialCheckedAt);
    setCheckedBy(initialCheckedBy);
  }, [initialStatus, initialCheckedAt, initialCheckedBy]);

  async function toggle() {
    if (busy) return;
    const previous = { status, checkedAt, checkedBy };
    const nextStatus = status === "done" ? "pending" : "done";
    setBusy(true);
    setError("");
    setStatus(nextStatus);
    if (nextStatus === "done") setCheckedAt(new Date().toISOString());
    else { setCheckedAt(null); setCheckedBy(null); }
    try {
      const response = await fetch(`/api/production/steps/${encodeURIComponent(stepId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Step could not be updated");
      setCheckedAt(result.checkedAt ?? null);
      setCheckedBy(result.checkedBy ?? null);
      if (result.bridgeMessage) setError(result.bridgeMessage);
      router.refresh();
    } catch (caught) {
      setStatus(previous.status);
      setCheckedAt(previous.checkedAt);
      setCheckedBy(previous.checkedBy);
      setError(caught instanceof Error ? caught.message : "Step could not be updated");
    } finally {
      setBusy(false);
    }
  }

  if (board) {
    return <button type="button" onClick={toggle} disabled={busy || status === "done"} style={{ border: "1px solid rgba(147,197,253,0.42)", borderRadius: 999, background: status === "done" ? "rgba(16,185,129,.25)" : "rgba(37,99,235,0.22)", color: status === "done" ? "#a7f3d0" : "#dbeafe", cursor: busy ? "wait" : "pointer", padding: "7px 10px", fontSize: 12, fontWeight: 950 }}>
      {busy ? "Saving…" : status === "done" ? "Done ✓" : "Mark done"}
    </button>;
  }

  return <>
    <button type="button" onClick={toggle} disabled={busy} aria-label={status === "done" ? "Reopen step" : "Check off step"} style={{ width: 30, height: 30, borderRadius: 999, border: status === "done" ? "1px solid #12b76a" : "1px solid #cfd9e8", background: status === "done" ? "#12b76a" : "#fff", color: "#fff", cursor: busy ? "wait" : "pointer", fontWeight: 950 }}>{busy ? "…" : status === "done" ? "✓" : ""}</button>
    <div style={{ display: "grid", gap: 2 }}>
      <strong style={{ fontSize: 14 }}>{label}</strong>
      {status === "done" ? <span style={{ color: "#067647", fontSize: 12 }}>Checked by {checkedBy || "staff"} · {formatChecked(checkedAt)}</span> : <span style={{ color: error ? "#b42318" : "#667085", fontSize: 12 }}>{error || "Pending"}</span>}
      {status === "done" && error ? <span style={{ color: "#b45309", fontSize: 11 }}>{error}</span> : null}
    </div>
  </>;
}
