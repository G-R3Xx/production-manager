"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { machineValuesFromFormData, updateMachineRpc } from "./machineRpc";

type CardSnapshot = Record<string, string>;

const cardFields = ["name", "type", "speed", "equipment", "capacity", "print"] as const;

function optimisticCardValues(formData: FormData): CardSnapshot {
  const values = machineValuesFromFormData(formData);
  const maxStackSheets = Number(values.maxStackSheets || "0");
  const speedUom = values.speedUom.replaceAll("_", " ") || "sqm per hour";

  return {
    name: values.name,
    type: values.machineType || "other",
    speed: `${values.speedValue} ${speedUom}`,
    equipment: `$${values.hourlyCost}/hr · ${values.setupMinutes} min setup`,
    capacity: maxStackSheets > 0
      ? `${maxStackSheets} sheets per stack`
      : values.maxWidthMm
        ? `${values.maxWidthMm} mm max width`
        : "No capacity limit set",
    print: `Ink $${values.inkCostPerSqm}/m² · Colour $${values.colourImpressionCost}/side · Mono $${values.monoImpressionCost}/side`,
  };
}

function machineCard(machineId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-machine-card-id="${CSS.escape(machineId)}"]`);
}

function captureCard(machineId: string): CardSnapshot {
  const root = machineCard(machineId);
  const snapshot: CardSnapshot = {};
  if (!root) return snapshot;
  for (const field of cardFields) {
    snapshot[field] = root.querySelector<HTMLElement>(`[data-machine-field="${field}"]`)?.textContent ?? "";
  }
  return snapshot;
}

function applyCard(machineId: string, values: CardSnapshot): void {
  const root = machineCard(machineId);
  if (!root) return;
  for (const field of cardFields) {
    const value = values[field];
    if (value === undefined) continue;
    const node = root.querySelector<HTMLElement>(`[data-machine-field="${field}"]`);
    if (node) node.textContent = value;
  }
}

export function MachineEditForm({ machineId, tenantId, children }: { machineId: string; tenantId: string; children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const nextValues = optimisticCardValues(formData);
    const previousValues = captureCard(machineId);
    const requestStartedAt = performance.now();

    // Editing equipment should feel instant. Update the visible card and close the
    // editor immediately; the authenticated database save continues in the background.
    applyCard(machineId, nextValues);
    if (detailsRef.current) detailsRef.current.open = false;
    setPending(true);
    setStatus("idle");
    setMessage("");

    try {
      const values = machineValuesFromFormData(formData);
      await updateMachineRpc(tenantId, machineId, values);

      formRef.current?.removeAttribute("data-production-manager-unsaved");
      setStatus("success");
      setMessage(`${nextValues.name || "Machine"} saved`);

      console.info("[machine-save-client]", {
        machineId,
        requestElapsedMs: Math.round(performance.now() - requestStartedAt),
        transport: "supabase-rpc",
      });
    } catch (error) {
      // A failed optimistic save must never leave the screen claiming values that
      // were not persisted. Restore the previous card and reopen the editor.
      applyCard(machineId, previousValues);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Machine could not be saved.");
      if (detailsRef.current) detailsRef.current.open = true;
    } finally {
      setPending(false);
    }
  }

  return <div style={{ display: "grid", gap: 5, justifyItems: "end" }}>
    <details ref={detailsRef}>
      <summary style={{ listStyle: "none", cursor: "pointer", border: "1px solid #94a3b8", borderRadius: 9, padding: "8px 10px", fontWeight: 800 }}>
        Edit
      </summary>
      <div
        style={{
          position: "fixed",
          zIndex: 1000,
          inset: 0,
          background: "rgba(15,23,42,.28)",
          backdropFilter: "blur(2px)",
          display: "grid",
          placeItems: "center",
          padding: 20,
        }}
        onClick={(event) => {
          if (event.currentTarget === event.target && detailsRef.current && !pending) detailsRef.current.open = false;
        }}
      >
        <div style={{ width: "min(980px,calc(100vw - 40px))", maxHeight: "calc(100vh - 40px)", overflowY: "auto", overscrollBehavior: "contain", border: "1px solid #dbe4f0", borderRadius: 16, background: "#fff", boxShadow: "0 20px 60px rgba(15,23,42,.28)" }}>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          style={{ display: "grid", gap: 12, padding: 18 }}
        >
          <input type="hidden" name="id" value={machineId} />
          <input type="hidden" name="tenantId" value={tenantId} />
          {children}
          {status === "error" ? <div style={{ border: "1px solid #fecaca", borderRadius: 11, padding: 10, background: "#fef2f2", color: "#b42318", fontWeight: 800 }}>{message}</div> : null}
          <div style={{ position: "sticky", bottom: -18, margin: "2px -18px -18px", padding: "12px 18px", borderTop: "1px solid #e2e8f0", background: "rgba(255,255,255,.97)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "flex-end", zIndex: 2 }}>
            <button disabled={pending} style={{ minHeight: 44, minWidth: 130, border: 0, borderRadius: 10, background: pending ? "#94a3b8" : "#2563eb", color: "#fff", fontWeight: 900, padding: "0 18px", cursor: pending ? "wait" : "pointer" }}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </details>
    {pending ? <span style={{ color: "#2563eb", fontSize: 11, fontWeight: 900 }}>Saving…</span> : null}
    {!pending && status === "success" ? <span style={{ color: "#15803d", fontSize: 11, fontWeight: 900 }}>{message}</span> : null}
  </div>;
}
