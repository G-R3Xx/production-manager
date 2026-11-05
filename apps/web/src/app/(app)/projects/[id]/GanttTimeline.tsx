"use client";
import { useMemo, useState, type CSSProperties } from "react";
import type { ProjectTimelineTaskRecord, ProjectSubJobRecord } from "@/server/project-timelines";
import { timelineDayRange, timelineDayIndex, timelinePosition, plannedHoursLabel, sydneyTodayDayIndex } from "@/lib/project-timeline";

type Props = { tasks: ProjectTimelineTaskRecord[]; sections: ProjectSubJobRecord[] };
type Zoom = "day" | "week" | "month";
const DAY_MS = 86_400_000;

function dateForDay(day: number) { return new Date(day * DAY_MS); }
function statusColor(task: ProjectTimelineTaskRecord): string {
  // The production checklist wins when a task is linked: scheduling cannot falsely complete it.
  if (task.productionStepId && task.productionStepStatus) {
    if (task.productionStepStatus === "done") return "#18836b";
    if (task.status === "blocked") return "#d97706";
    return task.productionStepStatus === "in_progress" ? "#2563eb" : "#64748b";
  }
  if (task.status === "completed") return "#18836b";
  if (task.status === "blocked") return "#d97706";
  if (task.status === "in_progress") return "#2563eb";
  return "#64748b";
}

export function GanttTimeline({ tasks, sections }: Props) {
  const [zoom, setZoom] = useState<Zoom>("week");
  const model = useMemo(() => {
    const { first, last } = timelineDayRange(tasks);
    const dayCount = last - first + 1;
    const columnWidth = zoom === "day" ? 34 : zoom === "week" ? 13 : 5;
    const width = Math.max(680, dayCount * columnWidth);
    const ticks: { left: number; label: string }[] = [];
    const today = sydneyTodayDayIndex();
    for (let day = first; day <= last; day++) {
      const dt = dateForDay(day);
      const shouldShow = day === first || zoom === "day" || (zoom === "week" && dt.getUTCDay() === 1) ||
        (zoom === "month" && dt.getUTCDate() === 1);
      if (shouldShow) ticks.push({
        left: ((day - first) / dayCount) * 100,
        label: zoom === "day" ? dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }) :
          zoom === "week" ? dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }) :
          dt.toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" })
      });
    }
    return { first, last, dayCount, width, ticks, todayLeft: today >= first && today <= last ? ((today - first) / dayCount) * 100 : null };
  }, [tasks, zoom]);
  const groups = [{ id: null, title: "General / Unassigned" }, ...sections.map(s => ({ id: s.id, title: s.title }))]
    .map(group => ({ ...group, tasks: tasks.filter(task => task.subJobId === group.id) })).filter(group => group.tasks.length);
  const gridTrack: CSSProperties = { position: "relative", flex: `0 0 ${model.width}px`, width: model.width, minHeight: 37,
    backgroundImage: `repeating-linear-gradient(to right,transparent 0,transparent ${Math.max(1, model.width/model.dayCount)-1}px,#e2e8f0 ${model.width/model.dayCount}px)`,
    backgroundColor: "#fafcff" };
  const labelCell: CSSProperties = { position: "sticky", left: 0, zIndex: 2, flex: "0 0 220px", width: 220,
    background: "#fff", padding: "8px 12px", borderRight: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: 12 };
  return <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, overflow: "hidden" }}>
    <div style={{ padding: "17px 18px 12px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Gantt timeline</h2>
        <div style={{ color: "#64748b", fontSize: 12 }}>Bars show scheduled periods. Allocated hours are shown separately from the span.</div>
      </div>
      <div role="group" aria-label="Timeline zoom" style={{ display: "flex", gap: 4, padding: 4, border: "1px solid #dbe4ef", borderRadius: 11 }}>
        {(["day", "week", "month"] as const).map(mode => <button key={mode} type="button" aria-pressed={zoom === mode}
          onClick={() => setZoom(mode)} style={{ cursor: "pointer", padding: "7px 12px", borderRadius: 8, border: 0, fontWeight: 800,
            background: zoom === mode ? "#1d4ed8" : "transparent", color: zoom === mode ? "#fff" : "#475569" }}>
          {mode[0].toUpperCase()+mode.slice(1)}
        </button>)}
      </div>
    </div>
    <div style={{ overflowX: "auto", borderTop: "1px solid #e2e8f0" }} tabIndex={0} aria-label="Scrollable project Gantt chart">
      {tasks.length === 0 ? <p style={{ padding: 20, margin: 0, color: "#64748b" }}>Add your first task or schedule an existing Production Step to populate the timeline.</p> : <div style={{ width: 220 + model.width, minWidth: "100%" }}>
        <div style={{ display: "flex", background: "#edf4ff", borderBottom: "1px solid #cbd5e1" }}>
          <div style={{ ...labelCell, background: "#edf4ff", fontWeight: 900, paddingTop: 13 }}>Task / allocated hours</div>
          <div style={{ position: "relative", width: model.width, height: 46 }}>
            {model.ticks.map(tick => <div key={`${tick.left}-${tick.label}`} style={{ position: "absolute", left: `${tick.left}%`, top: 8,
              borderLeft: "1px solid #bfdbfe", height: 35, paddingLeft: 5, fontSize: 10, color: "#334155", whiteSpace: "nowrap" }}>{tick.label}</div>)}
          </div>
        </div>
        {groups.map(group => <div key={group.id ?? "general"}>
          <div style={{ display: "flex", background: "#e8eef7", borderBottom: "1px solid #cbd5e1", color: "#1e3a5f", fontWeight: 900 }}>
            <div style={{ ...labelCell, background: "#e8eef7" }}>{group.title}</div>
            <div style={{ flex: 1 }} />
          </div>
          {group.tasks.map(task => {
            const bar = timelinePosition(task, model.first, model.last);
            return <div key={task.id} style={{ display: "flex", borderBottom: "1px solid #edf2f7", minHeight: 43 }}>
              <div style={labelCell}>
                <a href={`#task-${task.id}`} style={{ color: "#1e3a8a", fontWeight: 800, textDecoration: "none" }}>{task.title}</a>
                <div style={{ marginTop: 3, fontSize: 11, color: "#64748b" }}>{plannedHoursLabel(task.allocatedMinutes)} {task.assigneeName ? `· ${task.assigneeName}` : ""}</div>
              </div>
              <div style={gridTrack}>
                {model.todayLeft !== null ? <div aria-hidden="true" style={{ position: "absolute", left: `${model.todayLeft}%`, top: 0, bottom: 0, borderLeft: "2px solid #dc2626", zIndex: 1, opacity: 0.7 }} /> : null}
                {bar.width > 0 ? <a href={`#task-${task.id}`} title={`${task.title} | ${task.plannedStart.replace("T", " ")} – ${task.plannedEnd.replace("T", " ")} | ${plannedHoursLabel(task.allocatedMinutes)} allocated`}
                  style={{ display: "block", position: "absolute", top: 10, left: `${bar.left}%`, width: `${bar.width}%`,
                    minWidth: 5, maxWidth: model.width, height: 20, borderRadius: 5, background: statusColor(task), zIndex: 2 }} /> : null}
              </div>
            </div>;
          })}
        </div>)}
      </div>}
    </div>
    {model.last < Math.max(...tasks.map(task => timelineDayIndex(task.plannedEnd))) ?
      <p style={{ margin: "0 17px 8px", fontSize: 12, color: "#9a3412" }}>For performance, this view displays the first year only. Later tasks remain available to edit below.</p> : null}
    <div style={{ display: "flex", gap: 15, flexWrap: "wrap", padding: "11px 17px", fontSize: 11, color: "#475569" }}>
      <span>⚪ Planned</span><span>🔵 In progress</span><span>🟠 Blocked</span><span>🟢 Completed</span><span style={{ color: "#b91c1c" }}>│ Today</span>
    </div>
  </section>;
}
