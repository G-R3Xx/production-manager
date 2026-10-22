"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteMachineRpc, duplicateMachineRpc } from "./machineRpc";

const buttonStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  background: "#fff",
  padding: "8px 10px",
  fontWeight: 750,
  cursor: "pointer",
} as const;

export function MachineActions({ tenantId, machineId, machineName }: { tenantId: string; machineId: string; machineName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"duplicate" | "delete" | null>(null);
  const [message, setMessage] = useState("");

  async function duplicate() {
    if (busy) return;
    setBusy("duplicate");
    setMessage("");
    const startedAt = performance.now();
    try {
      await duplicateMachineRpc(tenantId, machineId);
      setMessage("Duplicated");
      console.info("[machine-duplicate-client]", { elapsedMs: Math.round(performance.now() - startedAt) });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Machine could not be duplicated.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    if (!window.confirm(`Permanently delete “${machineName}”?`)) return;
    const card = document.querySelector<HTMLElement>(`[data-machine-card-id="${CSS.escape(machineId)}"]`);
    const previousDisplay = card?.style.display ?? "";
    if (card) card.style.display = "none";
    setBusy("delete");
    setMessage("");
    const startedAt = performance.now();
    try {
      await deleteMachineRpc(tenantId, machineId);
      console.info("[machine-delete-client]", { elapsedMs: Math.round(performance.now() - startedAt) });
    } catch (error) {
      if (card) card.style.display = previousDisplay;
      setMessage(error instanceof Error ? error.message : "Machine could not be deleted.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={duplicate} disabled={Boolean(busy)} style={{ ...buttonStyle, opacity: busy ? 0.65 : 1 }}>
          {busy === "duplicate" ? "Duplicating…" : "Duplicate"}
        </button>
        <button type="button" onClick={remove} disabled={Boolean(busy)} style={{ ...buttonStyle, borderColor: "#fecaca", color: "#b42318", opacity: busy ? 0.65 : 1 }}>
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
      {message ? <span style={{ maxWidth: 280, color: message === "Duplicated" ? "#15803d" : "#b42318", fontSize: 11, fontWeight: 850, textAlign: "right" }}>{message}</span> : null}
    </div>
  );
}
