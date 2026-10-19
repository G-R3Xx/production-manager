"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { updateMachineInlineAction, type MachineSaveState } from "./actions";

const initialState: MachineSaveState = { status: "idle", message: "", savedAt: 0 };

export function MachineEditForm({ machineId, tenantId, children }: { machineId: string; tenantId: string; children: ReactNode }) {
  const [state, action, pending] = useActionState(updateMachineInlineAction, initialState);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.savedAt) return;
    if (state.status === "error" && detailsRef.current) detailsRef.current.open = true;
    if (state.status === "success") formRef.current?.removeAttribute("data-production-manager-unsaved");
  }, [state.savedAt, state.status]);

  return <div style={{ display: "grid", gap: 5, justifyItems: "end" }}>
    <details ref={detailsRef}>
      <summary style={{ listStyle: "none", cursor: "pointer", border: "1px solid #94a3b8", borderRadius: 9, padding: "8px 10px", fontWeight: 800 }}>
        {pending ? "Saving…" : "Edit"}
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
          if (event.currentTarget === event.target && detailsRef.current) detailsRef.current.open = false;
        }}
      >
        <div style={{ width: "min(980px,calc(100vw - 40px))", maxHeight: "calc(100vh - 40px)", overflowY: "auto", overscrollBehavior: "contain", border: "1px solid #dbe4f0", borderRadius: 16, background: "#fff", boxShadow: "0 20px 60px rgba(15,23,42,.28)" }}>
        <form
          ref={formRef}
          action={action}
          onSubmit={() => {
            if (detailsRef.current) detailsRef.current.open = false;
          }}
          style={{ display: "grid", gap: 12, padding: 18 }}
        >
          <input type="hidden" name="id" value={machineId} />
          <input type="hidden" name="tenantId" value={tenantId} />
          {children}
          {state.status === "error" ? <div style={{ border: "1px solid #fecaca", borderRadius: 11, padding: 10, background: "#fef2f2", color: "#b42318", fontWeight: 800 }}>{state.message}</div> : null}
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
    {!pending && state.status === "success" ? <span style={{ color: "#15803d", fontSize: 11, fontWeight: 900 }}>{state.message}</span> : null}
  </div>;
}
