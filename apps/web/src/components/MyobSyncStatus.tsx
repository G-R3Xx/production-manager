import type { CSSProperties } from "react";

export function readMyobSyncStatus(value: unknown, linked: boolean): "pending" | "syncing" | "synced" | "error" | "not_synced" {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "pending" || status === "syncing" || status === "synced" || status === "error") return status;
  return linked ? "synced" : "not_synced";
}

export function MyobSyncStatus({ status, linked, error }: { status?: unknown; linked: boolean; error?: unknown }) {
  const state = readMyobSyncStatus(status, linked);
  const styles: Record<typeof state, CSSProperties> = {
    pending: { background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" },
    syncing: { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
    synced: { background: "#ecfdf3", color: "#067647", border: "1px solid #abefc6" },
    error: { background: "#fff1f2", color: "#b42318", border: "1px solid #fda29b" },
    not_synced: { background: "#f8fafc", color: "#475467", border: "1px solid #e2e8f0" }
  };
  const label = state === "pending" ? "MYOB: queued" : state === "syncing" ? "MYOB: syncing" : state === "synced" ? "MYOB: synced" : state === "error" ? "MYOB: sync failed" : "MYOB: not synced";
  return <span title={state === "error" ? String(error ?? "MYOB sync failed") : undefined} style={{ ...styles[state], display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 900 }}>{label}</span>;
}
