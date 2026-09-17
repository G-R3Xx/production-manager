"use client";

import { useActionState, useEffect, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updateMachineInlineAction, type MachineSaveState } from "./actions";

const initialState: MachineSaveState = { status: "idle", message: "", savedAt: 0 };

export function MachineEditForm({ machineId, children }: { machineId: string; children: ReactNode }) {
  const [state, action, pending] = useActionState(updateMachineInlineAction, initialState);
  const [refreshing, startRefresh] = useTransition();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "success" || !state.savedAt) return;
    if (detailsRef.current) detailsRef.current.open = false;
    startRefresh(() => router.refresh());
  }, [router, state.savedAt, state.status]);

  return <div style={{ display: "grid", gap: 5, justifyItems: "end" }}>
    <details ref={detailsRef}>
      <summary style={{ listStyle: "none", cursor: "pointer", border: "1px solid #94a3b8", borderRadius: 9, padding: "8px 10px", fontWeight: 800 }}>
        {pending ? "Saving…" : "Edit"}
      </summary>
      <div style={{ position: "absolute", zIndex: 20, right: 18, marginTop: 8, width: "min(980px,calc(100vw - 48px))", border: "1px solid #dbe4f0", borderRadius: 16, background: "#fff", padding: 18, boxShadow: "0 20px 60px rgba(15,23,42,.22)" }}>
        <form action={action} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="id" value={machineId} />
          {children}
          {state.status === "error" ? <div style={{ border: "1px solid #fecaca", borderRadius: 11, padding: 10, background: "#fef2f2", color: "#b42318", fontWeight: 800 }}>{state.message}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button disabled={pending} style={{ minHeight: 44, minWidth: 130, border: 0, borderRadius: 10, background: pending ? "#94a3b8" : "#2563eb", color: "#fff", fontWeight: 900, padding: "0 18px", cursor: pending ? "wait" : "pointer" }}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </details>
    {state.status === "success" ? <span style={{ color: "#15803d", fontSize: 11, fontWeight: 900 }}>{refreshing ? "Saved · refreshing" : state.message}</span> : null}
  </div>;
}
