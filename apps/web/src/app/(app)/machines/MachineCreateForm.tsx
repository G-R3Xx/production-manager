"use client";

import { useRouter } from "next/navigation";
import { Profiler, useEffect, useTransition, useState, type FormEvent, type ReactNode } from "react";
import { createMachineRpc, machineValuesFromFormData } from "./machineRpc";

import { useMachineTiming } from "./machineTiming";

export function MachineCreateForm({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const timing = useMachineTiming(pending || refreshing);
  useEffect(() => {
    if (!refreshing && timing.trace.current && !pending) {
      timing.trace.current.mark("settledReactEffect");
      timing.trace.current.finish("success");
    }
  }, [refreshing, pending]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || refreshing) return;
    const trace = timing.begin("create", event.timeStamp);
    const form = event.currentTarget;
    const values = machineValuesFromFormData(new FormData(form));
    if (!values.name) {
      setError("Machine name is required.");
      trace.finish("validation-error");
      return;
    }

    setPending(true);
    setError("");
    setMessage("");
    trace.mark("formRead");
    try {
      await createMachineRpc(tenantId, values, trace);
      form.reset();
      trace.mark("formReset");
      setMessage(`${values.name} added`);
      trace.mark("routerRefreshRequested");
      startRefresh(() => router.refresh());
    } catch (err) {
      trace.finish("error");
      setError(err instanceof Error ? err.message : "Machine could not be created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Profiler id="machine-create" onRender={timing.onRender}><form data-no-global-loader="true"
      onClickCapture={(event) => { if ((event.target as Element).closest("button[type=submit], button:not([type])")) timing.interaction.current = event.timeStamp; }}
      onKeyDownCapture={(event) => { if (event.key === "Enter") timing.interaction.current = event.timeStamp; }}
      onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
      {children}
      {error ? <div style={{ color: "#b42318", fontWeight: 800 }}>{error}</div> : null}
      {message ? <div style={{ color: "#15803d", fontWeight: 800 }}>{message}</div> : null}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          disabled={pending || refreshing}
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
          {pending ? "Adding…" : refreshing ? "Updating list…" : "Add equipment"}
        </button>
      </div>
    </form></Profiler>
  );
}
