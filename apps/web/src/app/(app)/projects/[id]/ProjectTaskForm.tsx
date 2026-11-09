"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { saveProjectTaskInlineAction } from "../actions";

type Props = {
  projectId: string;
  taskId?: string;
  mode: "create" | "edit";
  children: ReactNode;
};

/** Saving a task must not wait for a Next.js redirect and full project-page render.
 * Confirm the database write and update every in-page task view immediately.
 * Do not refresh the expensive server-component page after a successful write. */
export function ProjectTaskForm({ projectId, taskId, mode, children }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setFeedback(null);
    const started = performance.now();
    const form = new FormData(event.currentTarget);
    form.set("projectId", projectId);
    if (taskId) form.set("taskId", taskId);
    try {
      const result = await saveProjectTaskInlineAction(form);
      const responseMs = Math.round(performance.now() - started);
      if (!result.ok) {
        console.warn("[pm:project-task-save] rejected", { mode, responseMs, error: result.error });
        setFeedback({ success: false, text: result.error });
        return;
      }
      console.info("[pm:project-task-save] confirmed", { mode, responseMs, ...result.timings });
      setFeedback({ success: true, text: mode === "create" ? "Task added" : "Task updated" });
      // In-page event: the existing Gantt can show the confirmed row immediately,
      // without waiting for every other project-page query to finish.
      window.dispatchEvent(new CustomEvent("pm-project-task-saved", {
        detail: { projectId, task: result.task, revision: result.revision }
      }));
      // Alert other browser tabs, but never reload this tab after a confirmed save.
      // Its Gantt listener already advanced its revision baseline synchronously.
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("pm-project-schedule");
        channel.postMessage({ projectId });
        channel.close();
      }
      if (mode === "create") formRef.current?.reset();
      // Compare confirmed server time with time until the browser has painted
      // the local task update; this must not wait for the Project page reload.
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        console.info("[pm:project-task-save] ui-visible-ms", Math.round(performance.now() - started));
      }));
    } catch (error) {
      console.warn("[pm:project-task-save] transport-error", { mode, elapsedMs: Math.round(performance.now() - started), error });
      setFeedback({ success: false, text: "Task couldn't be saved. Check the connection and try again." });
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  // This form saves inline and deliberately does not navigate. The global route
  // overlay listens in the capture phase and otherwise blocks the already-saved
  // screen for its full 18-second safety timeout.
  return <form ref={formRef} data-no-global-loader="true" onSubmit={submit} style={{ display: "grid", gap: 12, paddingTop: 13 }}>
    {children}
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <button type="submit" disabled={saving} style={{ border: 0, borderRadius: 9, background: saving ? "#94a3b8" : "#1e3a8a", color: "#fff", padding: "10px 14px", minHeight: 41, fontWeight: 800, cursor: saving ? "wait" : "pointer" }}>
        {saving ? "Saving…" : mode === "create" ? "Add task" : "Save task"}
      </button>
      {feedback ? <span role="status" aria-live="polite" style={{ color: feedback.success ? "#047857" : "#b91c1c", fontSize: 13, fontWeight: 750 }}>
        {feedback.text}
      </span> : null}
    </div>
  </form>;
}
