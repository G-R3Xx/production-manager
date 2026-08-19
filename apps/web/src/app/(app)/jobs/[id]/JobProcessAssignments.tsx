"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const processes = [
  { key: "enquiry", label: "Enquiry", description: "Review and qualify the request." },
  { key: "survey", label: "Survey", description: "Schedule and complete the site survey." },
  { key: "quote", label: "Quote", description: "Prepare, send and revise the quote." },
  { key: "artwork", label: "Artwork", description: "Prepare proofs and collect approvals." },
  { key: "production", label: "Production", description: "Own production and its procedure steps." },
  { key: "dispatch", label: "Pickup / delivery / install", description: "Complete the final handoff or installation." },
  { key: "invoicing", label: "Invoicing", description: "Invoice and close the job." },
] as const;

type ProcessKey = (typeof processes)[number]["key"];
type Assignment = {
  processKey: ProcessKey;
  assigneeProfileIds: string[];
  dueDate: string | null;
};
type StaffOption = { id: string; name: string; role: string };
type Draft = { assigneeProfileIds: string[]; dueDate: string };

export function JobProcessAssignments({
  jobId,
  currentProcessKey,
  assignments,
  staff,
}: {
  jobId: string;
  currentProcessKey: ProcessKey | null;
  assignments: Assignment[];
  staff: StaffOption[];
}) {
  const initial = useMemo(() => Object.fromEntries(processes.map((process) => {
    const saved = assignments.find((assignment) => assignment.processKey === process.key);
    return [process.key, { assigneeProfileIds: saved?.assigneeProfileIds ?? [], dueDate: saved?.dueDate ?? "" }];
  })) as Record<ProcessKey, Draft>, [assignments]);
  const [drafts, setDrafts] = useState<Record<ProcessKey, Draft>>(initial);
  const [saved, setSaved] = useState<Record<ProcessKey, Draft>>(initial);
  const [state, setState] = useState<Partial<Record<ProcessKey, "saving" | "saved" | "error">>>({});
  const [errors, setErrors] = useState<Partial<Record<ProcessKey, string>>>({});
  const draftsRef = useRef(drafts);
  const savedRef = useRef(saved);
  const currentIndex = processes.findIndex((process) => process.key === currentProcessKey);

  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => {
    const currentDrafts = draftsRef.current;
    const currentSaved = savedRef.current;
    const mergedDrafts = { ...currentDrafts };
    for (const process of processes) {
      const locallyChanged = JSON.stringify(currentDrafts[process.key]) !== JSON.stringify(currentSaved[process.key]);
      if (!locallyChanged) mergedDrafts[process.key] = initial[process.key];
    }
    setDrafts(mergedDrafts);
    setSaved(initial);
  }, [initial]);

  function updateDraft(processKey: ProcessKey, next: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [processKey]: { ...current[processKey], ...next } }));
    setState((current) => ({ ...current, [processKey]: undefined }));
  }

  function toggleStaff(processKey: ProcessKey, staffId: string) {
    const ids = drafts[processKey].assigneeProfileIds;
    updateDraft(processKey, {
      assigneeProfileIds: ids.includes(staffId) ? ids.filter((id) => id !== staffId) : [...ids, staffId],
    });
  }

  async function save(processKey: ProcessKey) {
    setState((current) => ({ ...current, [processKey]: "saving" }));
    setErrors((current) => ({ ...current, [processKey]: "" }));
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/process-assignments/${processKey}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(drafts[processKey]),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Assignment could not be saved.");
      const next = {
        assigneeProfileIds: result.assignment.assigneeProfileIds ?? [],
        dueDate: result.assignment.dueDate ?? "",
      };
      setDrafts((current) => ({ ...current, [processKey]: next }));
      setSaved((current) => ({ ...current, [processKey]: next }));
      setState((current) => ({ ...current, [processKey]: "saved" }));
    } catch (error) {
      setState((current) => ({ ...current, [processKey]: "error" }));
      setErrors((current) => ({ ...current, [processKey]: error instanceof Error ? error.message : "Assignment could not be saved." }));
    }
  }

  return (
    <section style={{ background: "#fff", border: "1px solid #dfe7f2", borderRadius: 22, padding: 20, boxShadow: "0 12px 34px rgba(15,23,42,.05)", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "#4f46e5", fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".06em" }}>Process ownership</p>
          <h2 style={{ margin: "4px 0 3px" }}>Assign the right people at every stage</h2>
          <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Choose multiple staff and an optional due date. Production procedure steps inherit the Production or Dispatch team unless individually overridden.</p>
        </div>
        <span style={{ borderRadius: 999, padding: "6px 10px", color: "#155eef", background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 12, fontWeight: 900 }}>Saves without reloading</span>
      </div>

      <div style={{ display: "grid", gap: 9 }}>
        {processes.map((process, index) => {
          const draft = drafts[process.key];
          const isCurrent = process.key === currentProcessKey;
          const phase = isCurrent ? "Current" : currentIndex >= 0 && index < currentIndex ? "Passed" : "Upcoming";
          const dirty = JSON.stringify(draft) !== JSON.stringify(saved[process.key]);
          const status = state[process.key];
          return (
            <div key={process.key} style={{ display: "grid", gridTemplateColumns: "minmax(190px,.75fr) minmax(260px,1.6fr) minmax(150px,.55fr) auto", gap: 12, alignItems: "center", border: isCurrent ? "2px solid #155eef" : "1px solid #e4e7ec", borderRadius: 16, padding: 12, background: isCurrent ? "#f5f8ff" : "#fff" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{process.label}</strong>
                  <span style={{ borderRadius: 999, padding: "3px 7px", background: isCurrent ? "#155eef" : phase === "Passed" ? "#ecfdf3" : "#f2f4f7", color: isCurrent ? "#fff" : phase === "Passed" ? "#067647" : "#667085", fontSize: 10, fontWeight: 950 }}>{phase}</span>
                </div>
                <span style={{ display: "block", marginTop: 3, color: "#667085", fontSize: 11 }}>{process.description}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {staff.map((person) => {
                  const selected = draft.assigneeProfileIds.includes(person.id);
                  return <button key={person.id} type="button" aria-pressed={selected} onClick={() => toggleStaff(process.key, person.id)} title={person.role} style={{ minHeight: 32, borderRadius: 999, border: selected ? "1px solid #155eef" : "1px solid #d0d5dd", background: selected ? "#eff6ff" : "#fff", color: selected ? "#155eef" : "#475467", padding: "0 10px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>{selected ? "✓ " : "+ "}{person.name}</button>;
                })}
                {!staff.length ? <span style={{ color: "#b42318", fontSize: 12 }}>No active staff available.</span> : null}
              </div>
              <label style={{ display: "grid", gap: 4, fontSize: 10, color: "#667085", fontWeight: 900, textTransform: "uppercase" }}>Process due
                <input type="date" value={draft.dueDate} onChange={(event) => updateDraft(process.key, { dueDate: event.target.value })} style={{ minHeight: 38, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 9px", background: "#fff" }} />
              </label>
              <div style={{ display: "grid", gap: 4, justifyItems: "stretch", minWidth: 96 }}>
                <button type="button" disabled={!dirty || status === "saving"} onClick={() => save(process.key)} style={{ minHeight: 38, border: 0, borderRadius: 10, background: dirty ? "#0f172a" : "#eef2f6", color: dirty ? "#fff" : "#98a2b3", fontWeight: 900, cursor: dirty ? "pointer" : "default", padding: "0 12px" }}>{status === "saving" ? "Saving…" : dirty ? "Save" : status === "saved" ? "Saved ✓" : "Saved"}</button>
                {status === "error" ? <span style={{ color: "#b42318", fontSize: 10, maxWidth: 180 }}>{errors[process.key]}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
