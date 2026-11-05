"use client";
import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { rescheduleProjectTaskAction } from "../actions";
import type { ProjectTimelineTaskRecord, ProjectSubJobRecord } from "@/server/project-timelines";
import {
  timelineDayIndex, timelinePositionInWindow, timelineTaskRangeLabel, timelineWindow,
  shiftTimelineFocus, plannedHoursLabel, sydneyTodayDayIndex, sydneyNowMinuteIndex,
  timelineDragSchedule, timelineMinuteIndex, type TimelineDragMode, type TimelineZoom
} from "@/lib/project-timeline";

type Props = {
  projectId: string;
  canEdit: boolean;
  tasks: ProjectTimelineTaskRecord[];
  sections: ProjectSubJobRecord[];
};
type TaskDates = Pick<ProjectTimelineTaskRecord, "plannedStart" | "plannedEnd">;
type DragSession = {
  task: ProjectTimelineTaskRecord;
  pointerId: number;
  startX: number;
  mode: TimelineDragMode;
  preview: TaskDates | null;
};
const DAY_MS = 86_400_000;
function dateForDay(day: number) { return new Date(day * DAY_MS); }
function dayText(day: number) {
  return dateForDay(day).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
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

export function GanttTimeline({ projectId, canEdit, tasks, sections }: Props) {
  const router = useRouter();
  const [savedDates, setSavedDates] = useState<Record<string, TaskDates>>({});
  const [dragPreview, setDragPreview] = useState<{ taskId: string; dates: TaskDates } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const savingRef = useRef<string | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const displayedTasks = useMemo(() => tasks.map(task => ({
    ...task,
    ...(savedDates[task.id] ?? {}),
    ...(dragPreview?.taskId === task.id ? dragPreview.dates : {})
  })), [tasks, savedDates, dragPreview]);
  // Once the refreshed server snapshot includes saved dates, release local overrides.
  useEffect(() => {
    setSavedDates(previous => {
      const next = { ...previous };
      let changed = false;
      for (const task of tasks) {
        if (next[task.id]?.plannedStart === task.plannedStart && next[task.id]?.plannedEnd === task.plannedEnd) {
          delete next[task.id];
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [tasks]);

  async function saveDates(task: ProjectTimelineTaskRecord, dates: TaskDates) {
    if (!canEdit || savingRef.current ||
      (dates.plannedStart === task.plannedStart && dates.plannedEnd === task.plannedEnd)) return;
    savingRef.current = task.id;
    setSavingId(task.id);
    setFeedback(null);
    setSavedDates(previous => ({ ...previous, [task.id]: dates }));
    try {
      const result = await rescheduleProjectTaskAction({
        projectId, taskId: task.id, plannedStart: dates.plannedStart, plannedEnd: dates.plannedEnd,
        expectedStart: task.plannedStart, expectedEnd: task.plannedEnd
      });
      if (!result.ok) throw new Error(result.error);
      setFeedback({ error: false, text: `${task.title} schedule updated — ${timelineTaskRangeLabel(dates)}.` });
      // Update the schedule forms without blocking the bar interaction with a redirect.
      startTransition(() => router.refresh());
    } catch (error) {
      setSavedDates(previous => {
        const next = { ...previous };
        delete next[task.id];
        return next;
      });
      setFeedback({ error: true, text: error instanceof Error ? error.message : "Couldn't save the schedule." });
    } finally {
      savingRef.current = null;
      setSavingId(null);
    }
  }

  function beginDrag(event: ReactPointerEvent<HTMLAnchorElement>, task: ProjectTimelineTaskRecord) {
    if (!canEdit || savingRef.current || dragRef.current || event.button !== 0 || !event.isPrimary) return;
    suppressClickRef.current = null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const edge = Math.min(11, bounds.width * 0.28);
    // Tiny bars in a broad overview can be moved. Zoom to Day to resize them precisely.
    let mode: TimelineDragMode = "move";
    if (bounds.width >= 24 && x <= edge && timelineMinuteIndex(task.plannedStart) >= model.startMinute) mode = "resize-start";
    else if (bounds.width >= 24 && x >= bounds.width - edge && timelineMinuteIndex(task.plannedEnd) <= model.endMinute) mode = "resize-end";
    dragRef.current = { task, pointerId: event.pointerId, startX: event.clientX, mode, preview: null };
    event.currentTarget.setPointerCapture(event.pointerId);
    setFeedback(null);
  }

  function moveDrag(event: ReactPointerEvent<HTMLAnchorElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const delta = (event.clientX - session.startX) * (model.endMinute - model.startMinute) / model.width;
    const candidate = timelineDragSchedule(session.task, session.mode, delta, zoom);
    // Keep a sliver of the task in view so pointer capture isn't lost mid-gesture.
    if (timelinePositionInWindow(candidate, model.startMinute, model.endMinute).width <= 0) return;
    if (session.preview?.plannedStart === candidate.plannedStart && session.preview?.plannedEnd === candidate.plannedEnd) return;
    session.preview = candidate;
    setDragPreview({ taskId: session.task.id, dates: candidate });
  }

  function finishDrag(event: ReactPointerEvent<HTMLAnchorElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragPreview(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (session.preview && (session.preview.plannedStart !== session.task.plannedStart ||
        session.preview.plannedEnd !== session.task.plannedEnd)) {
      suppressClickRef.current = session.task.id;
      void saveDates(session.task, session.preview);
    }
  }

  function cancelDrag(event: ReactPointerEvent<HTMLAnchorElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragPreview(null);
    }
  }

  const firstTaskDay = tasks.length ? Math.min(...tasks.map(task => timelineDayIndex(task.plannedStart))) : sydneyTodayDayIndex();
  // A short project should open on an hourly scale rather than tiny day-level bars.
  const [zoom, setZoom] = useState<TimelineZoom>(() => tasks.length && tasks.every(task =>
    timelineDayIndex(task.plannedStart) === firstTaskDay && timelineDayIndex(task.plannedEnd) === firstTaskDay
  ) ? "day" : "week");
  const [focusDay, setFocusDay] = useState(firstTaskDay);
  const scrollRef = useRef<HTMLDivElement>(null);
  const model = useMemo(() => {
    const window = timelineWindow(focusDay, zoom);
    const width = zoom === "day" ? 1440 : zoom === "week" ? 1680 : window.dayCount * 44;
    const markers: { left: number; label: string; secondary?: boolean }[] = [];
    if (zoom === "day") {
      for (let hour = 0; hour < 24; hour += 2) markers.push({ left: hour * width / 24, label: `${String(hour).padStart(2, "0")}:00` });
    } else if (zoom === "week") {
      for (let day = 0; day < 7; day++) {
        markers.push({ left: day * width / 7, label: dayText(window.firstDay + day) });
        for (const hour of [6, 12, 18]) markers.push({ left: ((day + hour / 24) / 7) * width, label: `${String(hour).padStart(2, "0")}:00`, secondary: true });
      }
    } else {
      for (let day = 0; day < window.dayCount; day += 2) markers.push({
        left: day * width / window.dayCount, label: dayText(window.firstDay + day)
      });
    }
    const nowMinute = sydneyNowMinuteIndex();
    const nowLeft = nowMinute >= window.startMinute && nowMinute < window.endMinute ?
      ((nowMinute - window.startMinute) / (window.endMinute - window.startMinute)) * 100 : null;
    const visibleTasks = displayedTasks.filter(task => timelinePositionInWindow(task, window.startMinute, window.endMinute).width > 0);
    return { ...window, width, markers, nowLeft, visibleTasks,
      gridStep: zoom === "day" ? width / 24 : zoom === "week" ? width / 28 : width / window.dayCount };
  }, [displayedTasks, focusDay, zoom]);

  // On narrow screens a task at 09:00 or on Friday must not start off-screen.
  // Horizontal scrolling is for navigating the timeline; no data is fetched here.
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const earliest = model.visibleTasks.reduce<number | null>((result, task) => {
      const position = timelinePositionInWindow(task, model.startMinute, model.endMinute);
      return result === null ? position.left : Math.min(result, position.left);
    }, null);
    viewport.scrollLeft = earliest === null ? 0 : Math.max(0, (earliest / 100) * model.width - 75);
  }, [tasks, focusDay, zoom, model.startMinute, model.endMinute, model.width]);

  const groups = [{ id: null, title: "General / Unassigned" }, ...sections.map(s => ({ id: s.id, title: s.title }))]
    .map(group => ({ ...group, tasks: model.visibleTasks.filter(task => task.subJobId === group.id) }))
    .filter(group => group.tasks.length);
  const gridTrack: CSSProperties = {
    position: "relative", flex: `0 0 ${model.width}px`, width: model.width, minHeight: 53,
    backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${Math.max(1, model.gridStep - 1)}px, #e2e8f0 ${Math.max(1, model.gridStep)}px)`,
    backgroundColor: "#fafcff"
  };
  const labelCell: CSSProperties = {
    position: "sticky", left: 0, zIndex: 3, flex: "0 0 255px", width: 255,
    background: "#fff", padding: "8px 12px", borderRight: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: 12
  };
  const previous = () => setFocusDay(day => shiftTimelineFocus(day, zoom, -1));
  const next = () => setFocusDay(day => shiftTimelineFocus(day, zoom, 1));
  const focusInputDate = dateForDay(focusDay).toISOString().slice(0, 10);

  return <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, overflow: "hidden" }}>
    <div style={{ padding: "17px 18px 12px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Gantt timeline</h2>
        <div style={{ color: "#64748b", fontSize: 12 }}>Bars follow scheduled times (Sydney time). Allocated work hours are separate.</div>
        <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>
          {canEdit ? "Drag a bar to move it; drag either end to extend or shrink it. Zoom to Day for short tasks. Changes save on release." : "Select a bar to view its task. Only owners/managers can change schedules."}
        </div>
      </div>
      <div role="group" aria-label="Timeline zoom" style={{ display: "flex", gap: 4, padding: 4, border: "1px solid #dbe4ef", borderRadius: 11 }}>
        {(["day", "week", "month"] as const).map(mode => <button key={mode} type="button" aria-pressed={zoom === mode}
          onClick={() => setZoom(mode)} style={{ cursor: "pointer", padding: "7px 12px", borderRadius: 8, border: 0, fontWeight: 800,
            background: zoom === mode ? "#1d4ed8" : "transparent", color: zoom === mode ? "#fff" : "#475569" }}>
          {mode[0].toUpperCase() + mode.slice(1)}
        </button>)}
      </div>
    </div>
    <div style={{ padding: "0 18px 12px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 9 }}>
      <button type="button" aria-label={`Previous ${zoom}`} onClick={previous} style={{ cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 8, background: "white", padding: "7px 12px" }}>←</button>
      <strong style={{ minWidth: 205, fontSize: 13, color: "#1e3a5f", textAlign: "center" }}>{model.title}</strong>
      <button type="button" aria-label={`Next ${zoom}`} onClick={next} style={{ cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 8, background: "white", padding: "7px 12px" }}>→</button>
      <input type="date" aria-label="Jump to timeline date" value={focusInputDate} onChange={event => {
        const value = event.currentTarget.value;
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) setFocusDay(timelineDayIndex(value));
      }} style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 8 }} />
      <button type="button" onClick={() => setFocusDay(sydneyTodayDayIndex())} style={{ cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", padding: "7px 12px" }}>Today</button>
      <button type="button" onClick={() => setFocusDay(firstTaskDay)} style={{ cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", padding: "7px 12px" }}>First task</button>
      <span style={{ color: "#64748b", fontSize: 11 }}>{model.visibleTasks.length} of {tasks.length} tasks in this period</span>
    </div>
    {feedback ? <div role={feedback.error ? "alert" : "status"} style={{ margin: "0 18px 10px", padding: "9px 12px", borderRadius: 8,
      background: feedback.error ? "#fef2f2" : "#ecfdf5", color: feedback.error ? "#991b1b" : "#065f46", fontSize: 12 }}>{feedback.text}</div> : null}
    {savingId ? <div role="status" style={{ padding: "0 18px 10px", color: "#475569", fontSize: 12 }}>Saving task schedule…</div> : null}
    {dragPreview ? <div role="status" style={{ padding: "0 18px 10px", color: "#1d4ed8", fontSize: 12, fontWeight: 750 }}>
      {dragRef.current?.mode === "move" ? "Moving" : dragRef.current?.mode === "resize-start" ? "Adjusting start" : "Adjusting finish"}: {timelineTaskRangeLabel(dragPreview.dates)}
    </div> : null}
    <div ref={scrollRef} style={{ overflowX: "auto", borderTop: "1px solid #e2e8f0" }} tabIndex={0} aria-label="Scrollable project Gantt chart">
      {tasks.length === 0 ? <p style={{ padding: 20, margin: 0, color: "#64748b" }}>Add your first task or schedule an existing Production Step to populate the timeline.</p> :
      <div style={{ width: 255 + model.width, minWidth: "100%" }}>
        <div style={{ display: "flex", background: "#edf4ff", borderBottom: "1px solid #cbd5e1" }}>
          <div style={{ ...labelCell, background: "#edf4ff", fontWeight: 900, paddingTop: 15 }}>Task / scheduled time</div>
          <div style={{ position: "relative", width: model.width, height: 60, flexShrink: 0 }}>
            {model.markers.map((tick, index) => <div key={`${tick.left}-${index}`} style={{ position: "absolute", left: tick.left, top: tick.secondary ? 34 : 7,
              borderLeft: "1px solid #bfdbfe", height: tick.secondary ? 23 : 50, paddingLeft: 5,
              fontSize: tick.secondary ? 10 : 11, fontWeight: tick.secondary ? 400 : 700,
              color: tick.secondary ? "#64748b" : "#334155", whiteSpace: "nowrap" }}>{tick.label}</div>)}
          </div>
        </div>
        {groups.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: "#64748b" }}>
          No tasks are scheduled in this {zoom}. Use the arrows or date selector to view another period.
        </div> : groups.map(group => <div key={group.id ?? "general"}>
          <div style={{ display: "flex", background: "#e8eef7", borderBottom: "1px solid #cbd5e1", color: "#1e3a5f", fontWeight: 900 }}>
            <div style={{ ...labelCell, background: "#e8eef7" }}>{group.title}</div><div style={{ flex: 1 }} />
          </div>
          {group.tasks.map(task => {
            const bar = timelinePositionInWindow(task, model.startMinute, model.endMinute);
            const timeLabel = timelineTaskRangeLabel(task);
            const description = `${task.title} | ${timeLabel} (Sydney time) | ${plannedHoursLabel(task.allocatedMinutes)} allocated`;
            return <div key={task.id} style={{ display: "flex", borderBottom: "1px solid #edf2f7", minHeight: 59 }}>
              <div style={labelCell}>
                <a href={`#task-${task.id}`} style={{ color: "#1e3a8a", fontWeight: 800, textDecoration: "none" }}>{task.title}</a>
                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: "#334155" }}>{timeLabel}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: "#64748b" }}>{plannedHoursLabel(task.allocatedMinutes)} allocated {task.assigneeName ? `· ${task.assigneeName}` : ""}</div>
              </div>
              <div style={gridTrack}>
                {model.nowLeft !== null ? <div aria-hidden="true" style={{ position: "absolute", left: `${model.nowLeft}%`, top: 0, bottom: 0, borderLeft: "2px solid #dc2626", zIndex: 1, opacity: 0.7 }} /> : null}
                {bar.width > 0 ? <a href={`#task-${task.id}`}
                  title={canEdit ? `${description} · Drag to move; drag ends to resize. Zoom in for short tasks.` : description}
                  aria-label={description}
                  onPointerDown={event => beginDrag(event, task)} onPointerMove={moveDrag} onPointerUp={finishDrag}
                  onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
                  onClick={event => { if (suppressClickRef.current === task.id) { event.preventDefault(); suppressClickRef.current = null; } }}
                  style={{ display: "block", position: "absolute", top: 16, left: `${bar.left}%`, width: `${bar.width}%`,
                    minWidth: 5, height: 26, borderRadius: 5, background: statusColor(task), zIndex: 2,
                    cursor: canEdit ? (dragPreview?.taskId === task.id ? "grabbing" : "grab") : "pointer",
                    touchAction: canEdit ? "none" : "auto", userSelect: "none", boxShadow: dragPreview?.taskId === task.id ? "0 0 0 3px #93c5fd" : undefined,
                    opacity: savingId === task.id ? 0.75 : 1 }}>
                    {canEdit && bar.width * model.width / 100 >= 24 ? <>
                      <span aria-hidden="true" style={{ position: "absolute", left: 4, top: 6, bottom: 6, width: 3, borderLeft: "1px solid white", borderRight: "1px solid white", pointerEvents: "none" }}/>
                      <span aria-hidden="true" style={{ position: "absolute", right: 4, top: 6, bottom: 6, width: 3, borderLeft: "1px solid white", borderRight: "1px solid white", pointerEvents: "none" }}/>
                    </> : null}
                  </a> : null}
              </div>
            </div>;
          })}
        </div>)}
      </div>}
    </div>
    <div style={{ display: "flex", gap: 15, flexWrap: "wrap", padding: "11px 17px", fontSize: 11, color: "#475569" }}>
      <span>⚪ Planned</span><span>🔵 In progress</span><span>🟠 Blocked</span><span>🟢 Completed</span><span style={{ color: "#b91c1c" }}>│ Now</span>
      <span>Scroll for more dates. {canEdit ? "Drag bars to reschedule, resize their ends, or select a task for detailed editing." : "Select a bar to view the task."}</span>
    </div>
  </section>;
}
