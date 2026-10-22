"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { createMachineRpc, machineValuesFromFormData } from "./machineRpc";

export function MachineCreateForm({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = machineValuesFromFormData(new FormData(form));
    if (!values.name) {
      setError("Machine name is required.");
      return;
    }

    setPending(true);
    setError("");
    setMessage("");
    const startedAt = performance.now();
    try {
      await createMachineRpc(tenantId, values);
      form.reset();
      setMessage(`${values.name} added`);
      console.info("[machine-create-client]", { elapsedMs: Math.round(performance.now() - startedAt) });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Machine could not be created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
      {children}
      {error ? <div style={{ color: "#b42318", fontWeight: 800 }}>{error}</div> : null}
      {message ? <div style={{ color: "#15803d", fontWeight: 800 }}>{message}</div> : null}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          disabled={pending}
          style={{
            minHeight: 44,
            minWidth: 150,
            border: 0,
            borderRadius: 10,
            background: pending ? "#94a3b8" : "#2563eb",
            color: "#fff",
            fontWeight: 900,
            padding: "0 20px",
            cursor: pending ? "wait" : "pointer",
          }}
        >
          {pending ? "Adding…" : "Add equipment"}
        </button>
      </div>
    </form>
  );
}
