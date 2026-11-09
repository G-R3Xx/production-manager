"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PROJECT_TASK_STATUSES, plannedHoursLabel, projectSectionDateRangeLabel } from "@/lib/project-timeline";
import type { ProjectTimelineTaskRecord, ProjectSubJobRecord } from "@/server/project-timelines";
import type { ActiveStaffOption } from "@/server/users";
import { removeProjectTaskAction } from "../actions";
import { ProjectTaskForm } from "./ProjectTaskForm";

const card: CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 20, boxShadow: "0 8px 25px rgba(15,23,42,.04)" };
const field: CSSProperties = { display: "grid", gap: 5, minWidth: 0, fontSize: 12, fontWeight: 750, color: "#475569" };
const input: CSSProperties = { width: "100%", minWidth: 0, minHeight: 41, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 9, boxSizing: "border-box", background: "#fff", color: "#0f172a" };

type SavedTaskEvent = { projectId: string; task: ProjectTimelineTaskRecord; revision?: string };
/** An immediate, confirmed local snapshot; no router.refresh() required after a task save. */
function useProjectTaskSnapshot(projectId: string, serverTasks: ProjectTimelineTaskRecord[]) {
  const [changes, setChanges] = useState<Record<string, ProjectTimelineTaskRecord>>({});
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<SavedTaskEvent>).detail;
      if (detail?.projectId !== projectId || !detail.task?.id) return;
      setChanges(old => ({ ...old, [detail.task.id]: detail.task }));
    };
    window.addEventListener("pm-project-task-saved", receive);
    return () => window.removeEventListener("pm-project-task-saved", receive);
  }, [projectId]);
  useEffect(() => {
    setChanges(old => {
      let changed = false;
      const next = { ...old };
      for (const row of serverTasks) {
        const current = next[row.id];
        if (current && current.title === row.title && current.subJobId === row.subJobId &&
          current.plannedStart === row.plannedStart && current.plannedEnd === row.plannedEnd &&
          current.allocatedMinutes === row.allocatedMinutes && current.assigneeProfileId === row.assigneeProfileId &&
          current.status === row.status && current.notes === row.notes) {
          delete next[row.id]; changed = true;
        }
      }
      return changed ? next : old;
    });
  }, [serverTasks]);
  return useMemo(() => {
    const ids = new Set(serverTasks.map(task => task.id));
    return [...serverTasks.map(task => changes[task.id] ?? task),
      ...Object.values(changes).filter(task => !ids.has(task.id))];
  }, [serverTasks, changes]);
}

export function ProjectTaskSummary({ projectId, tasks }: { projectId: string; tasks: ProjectTimelineTaskRecord[] }) {
  const live = useProjectTaskSnapshot(projectId, tasks);
  return <><span>{live.length} scheduled tasks</span>
    <span>{plannedHoursLabel(live.reduce((sum, task) => sum + task.allocatedMinutes, 0))} allocated work</span></>;
}

function Fields({ task, subJobId, sections, staff, period, isEdit = false }: {
  task?: ProjectTimelineTaskRecord;
  subJobId: string | null;
  sections: ProjectSubJobRecord[];
  staff: ActiveStaffOption[];
  period: { start: string; finish: string };
  isEdit?: boolean;
}) {
  return <>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 12 }}>
      <label style={field}>Task name
        <input style={input} name="title" required maxLength={200} defaultValue={task?.title ?? ""} placeholder="e.g. Print graphics" />
      </label>
      {isEdit ? <label style={field}>Sub Job section
        <select style={input} name="subJobId" defaultValue={task?.subJobId ?? ""}>
          <option value="">General / Unassigned</option>
          {sections.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}
        </select>
      </label> : <input type="hidden" name="subJobId" value={subJobId ?? ""} />}
      <label style={field}>Planned start
        <input style={input} name="plannedStart" type="datetime-local" step={60} required defaultValue={task?.plannedStart ?? period.start} />
      </label>
      <label style={field}>Planned finish
        <input style={input} name="plannedEnd" type="datetime-local" step={60} required defaultValue={task?.plannedEnd ?? period.finish} />
      </label>
      <label style={field}>Allocated work hours
        <input style={input} name="allocatedHours" type="number" min={0} max={8760} step="0.25" required defaultValue={task ? task.allocatedMinutes / 60 : 1} />
      </label>
      <label style={field}>Assigned staff
        <select style={input} name="assigneeProfileId" defaultValue={task?.assigneeProfileId ?? ""}>
          <option value="">Unassigned</option>
          {staff.map(person => <option key={person.userProfileId} value={person.userProfileId}>{person.shortName || person.fullName}</option>)}
        </select>
      </label>
      <label style={field}>Planning status
        <select style={input} name="status" defaultValue={task?.status ?? "planned"}>
          {PROJECT_TASK_STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
    <label style={field}>Notes (optional)
      <textarea name="notes" rows={2} maxLength={4000} defaultValue={task?.notes ?? ""} style={{ ...input, resize: "vertical", padding: 10 }} />
    </label>
    {task?.productionStepId ? <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>Linked Production Step: the original checklist keeps its own completion status. Changing this timeline schedule does not create or change the checklist step.</p> : null}
  </>;
}


export function ProjectTaskSections({ projectId, canEdit, tasks, subJobs, staff, period }: {
  projectId: string; canEdit: boolean; tasks: ProjectTimelineTaskRecord[];
  subJobs: ProjectSubJobRecord[]; staff: ActiveStaffOption[]; period: { start: string; finish: string };
}) {
  const liveTasks = useProjectTaskSnapshot(projectId, tasks);
  const sections: { id: string | null; title: string }[] = [{ id: null, title: "General / Unassigned" }, ...subJobs];
  return <>
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: "7px 0 0", fontSize: 20, color: "#0f172a" }}>Tasks by Sub Job</h2>
      {sections.map(section => {
        const sectionTasks = liveTasks.filter(task => task.subJobId === section.id);
        return <article key={section.id ?? "general"} style={{ ...card, display: "grid", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, color: "#1e3a8a", fontSize: 18 }}>{section.title}</h3>
            <span style={{ color: "#64748b", fontWeight: 800, fontSize: 12, textAlign: "right" }}>
              {sectionTasks.length} tasks · {plannedHoursLabel(sectionTasks.reduce((total, task) => total + task.allocatedMinutes, 0))} allocated
              <span style={{ display: "block", marginTop: 4, fontWeight: 550 }}>{projectSectionDateRangeLabel(sectionTasks)}</span>
            </span>
          </div>
          {sectionTasks.length > 0 ? <div style={{ display: "grid", gap: 8 }}>
            {sectionTasks.map(task => <div key={task.id} id={`task-${task.id}`} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 13px", background: "#f8fafc", minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "grid", gap: 3 }}>
                  <strong style={{ color: "#0f172a" }}>{task.title}</strong>
                  <span style={{ color: "#64748b", fontSize: 12 }}>{task.plannedStart.replace("T", " ")} – {task.plannedEnd.replace("T", " ")} · {plannedHoursLabel(task.allocatedMinutes)} work{task.assigneeName ? ` · ${task.assigneeName}` : ""}</span>
                </div>
                <span style={{ fontSize: 11, color: "#334155", fontWeight: 850, padding: "5px 9px", borderRadius: 20, background: "#e5eefc" }}>
                  {task.productionStepId ? `Production: ${task.productionStepStatus ?? "unlinked"}` : task.status.replace(/_/g, " ")}
                </span>
              </div>
              {canEdit ? <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontWeight: 800, color: "#1d4ed8", fontSize: 13 }}>Edit schedule / allocation</summary>
                <ProjectTaskForm projectId={projectId} taskId={task.id} mode="edit">
                  <Fields task={task} subJobId={section.id} sections={subJobs} staff={staff} period={period} isEdit />
                </ProjectTaskForm>
                <form action={removeProjectTaskAction} style={{ marginTop: 10 }}>
                  <input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="taskId" value={task.id}/>
                  <button style={{ border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 9, background: "#fff5f5", padding: "8px 13px", fontWeight: 800, cursor: "pointer" }} type="submit">Remove from timeline</button>
                </form>
              </details> : null}
            </div>)}
          </div> : <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>No scheduled tasks in this section.</p>}
          {canEdit ? <details style={{ background: "#f8fbff", border: "1px dashed #bfd2ea", padding: 13, borderRadius: 12 }}>
            <summary style={{ color: "#1e40af", fontSize: 13, fontWeight: 850, cursor: "pointer" }}>+ Add a planning task under {section.title}</summary>
            <ProjectTaskForm projectId={projectId} mode="create">
              <Fields subJobId={section.id} sections={subJobs} staff={staff} period={period} />
            </ProjectTaskForm>
          </details> : null}
        </article>;
      })}
    </section>
  </>;
}
