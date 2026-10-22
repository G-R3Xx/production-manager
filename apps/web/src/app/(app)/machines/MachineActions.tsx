"use client";

import { useRouter } from "next/navigation";
import { Profiler, useEffect, useTransition, useState, type MouseEvent } from "react";
import { deleteMachineRpc, duplicateMachineRpc } from "./machineRpc";

import { useMachineTiming } from "./machineTiming";

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
  const [refreshing, startRefresh] = useTransition();
  const timing = useMachineTiming(Boolean(busy) || refreshing);
  useEffect(() => {
    if (!refreshing && !busy && timing.trace.current) {
      timing.trace.current.mark("settledReactEffect");
      timing.trace.current.finish("success");
    }
  }, [refreshing, busy]);
  const [message, setMessage] = useState("");

  async function duplicate(event: MouseEvent<HTMLButtonElement>) {
    if (busy || refreshing) return;
    const trace = timing.begin("duplicate", event.timeStamp);
    setBusy("duplicate");
    setMessage("");
    try {
      await duplicateMachineRpc(tenantId, machineId, trace);
      setMessage("Duplicated");
      trace.mark("routerRefreshRequested");
      startRefresh(() => router.refresh());
    } catch (error) {
      trace.finish("error");
      setMessage(error instanceof Error ? error.message : "Machine could not be duplicated.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(event: MouseEvent<HTMLButtonElement>) {
    if (busy || refreshing) return;
    const trace = timing.begin("delete", event.timeStamp);
    trace.detail("routerRefresh", "not requested");
    if (!window.confirm(`Permanently delete “${machineName}”?`)) { trace.finish("cancelled"); return; }
    trace.mark("deleteConfirmed");
    const card = document.querySelector<HTMLElement>(`[data-machine-card-id="${CSS.escape(machineId)}"]`);
    const previousDisplay = card?.style.display ?? "";
    if (card) card.style.display = "none";
    trace.mark("cardHidden");
    trace.paint("cardHiddenFrameOpportunity");
    setBusy("delete");
    setMessage("");
    try {
      await deleteMachineRpc(tenantId, machineId, trace);
      trace.finish("success");
    } catch (error) {
      trace.finish("error");
      if (card) card.style.display = previousDisplay;
      setMessage(error instanceof Error ? error.message : "Machine could not be deleted.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Profiler id="machine-actions" onRender={timing.onRender}><div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={duplicate} disabled={Boolean(busy) || refreshing} style={{ ...buttonStyle, opacity: busy ? 0.65 : 1 }}>
          {busy === "duplicate" ? "Duplicating…" : refreshing ? "Updating list…" : "Duplicate"}
        </button>
        <button type="button" onClick={remove} disabled={Boolean(busy) || refreshing} style={{ ...buttonStyle, borderColor: "#fecaca", color: "#b42318", opacity: busy ? 0.65 : 1 }}>
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
      {message ? <span style={{ maxWidth: 280, color: message === "Duplicated" ? "#15803d" : "#b42318", fontSize: 11, fontWeight: 850, textAlign: "right" }}>{message}</span> : null}
    </div></Profiler>
  );
}
