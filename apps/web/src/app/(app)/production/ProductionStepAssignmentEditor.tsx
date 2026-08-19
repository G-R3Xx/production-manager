"use client";

import { useState } from "react";

type StaffOption = { id: string; name: string };
type Assignment = {
  assigneeProfileIds: string[];
  dueDate: string | null;
  assignmentSource: string;
  assignmentProcessKey: string;
};

export function ProductionStepAssignmentEditor({ stepId, initial, staff }: { stepId: string; initial: Assignment; staff: StaffOption[] }) {
  const [assignment, setAssignment] = useState(initial);
  const [draftIds, setDraftIds] = useState(initial.assigneeProfileIds);
  const [dueDate, setDueDate] = useState(initial.dueDate ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const names = assignment.assigneeProfileIds.map((id) => staff.find((person) => person.id === id)?.name || "Staff");

  function toggleStaff(id: string) {
    setDraftIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setMessage("");
  }

  async function persist(inherit: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/production/steps/${encodeURIComponent(stepId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assigneeProfileIds: draftIds, dueDate, inherit }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Step assignment could not be saved.");
      const next = result.step as Assignment;
      setAssignment(next);
      setDraftIds(next.assigneeProfileIds ?? []);
      setDueDate(next.dueDate ?? "");
      setMessage(inherit ? "Process defaults restored ✓" : "Override saved ✓");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Step assignment could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details style={{ borderTop: "1px solid #eef2f6", paddingTop: 7 }}>
      <summary style={{ cursor: "pointer", color: "#475467", fontSize: 11, fontWeight: 850 }}>
        {assignment.assignmentSource === "manual" ? "Staff override" : `Inherited from ${assignment.assignmentProcessKey === "dispatch" ? "Dispatch" : "Production"}`}
        {names.length ? ` · ${names.join(", ")}` : " · Unassigned"}
        {assignment.dueDate ? ` · Due ${assignment.dueDate}` : ""}
      </summary>
      <div style={{ display: "grid", gap: 9, marginTop: 9, padding: 10, borderRadius: 12, background: "#f8fafc" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {staff.map((person) => {
            const selected = draftIds.includes(person.id);
            return <button key={person.id} type="button" aria-pressed={selected} onClick={() => toggleStaff(person.id)} style={{ minHeight: 30, borderRadius: 999, border: selected ? "1px solid #155eef" : "1px solid #cbd5e1", background: selected ? "#eff6ff" : "#fff", color: selected ? "#155eef" : "#475467", padding: "0 9px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>{selected ? "✓ " : "+ "}{person.name}</button>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 3, fontSize: 10, fontWeight: 900, color: "#667085", textTransform: "uppercase" }}>Step due
            <input type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); setMessage(""); }} style={{ minHeight: 36, border: "1px solid #cbd5e1", borderRadius: 9, padding: "0 8px", background: "#fff" }} />
          </label>
          <button type="button" disabled={busy} onClick={() => persist(false)} style={{ minHeight: 36, border: 0, borderRadius: 9, background: "#0f172a", color: "#fff", padding: "0 11px", fontWeight: 900, cursor: busy ? "wait" : "pointer" }}>{busy ? "Saving…" : "Save step override"}</button>
          <button type="button" disabled={busy || assignment.assignmentSource !== "manual"} onClick={() => persist(true)} style={{ minHeight: 36, border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: assignment.assignmentSource === "manual" ? "#344054" : "#98a2b3", padding: "0 11px", fontWeight: 900, cursor: assignment.assignmentSource === "manual" ? "pointer" : "default" }}>Use process defaults</button>
          {message ? <span style={{ color: "#067647", fontSize: 11, fontWeight: 850 }}>{message}</span> : null}
          {error ? <span style={{ color: "#b42318", fontSize: 11, fontWeight: 850 }}>{error}</span> : null}
        </div>
      </div>
    </details>
  );
}
