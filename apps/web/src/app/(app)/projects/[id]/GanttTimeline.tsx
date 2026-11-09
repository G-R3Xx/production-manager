"use client";
import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { rescheduleProjectTaskAction, assignProjectTaskAction, reorderProjectTasksAction } from "../actions";
import type { ProjectTimelineTaskRecord, ProjectSubJobRecord } from "@/server/project-timelines";
import {
  timelineDayIndex, timelinePositionInWindow, timelineTaskRangeLabel, timelineWindow,
  shiftTimelineFocus, plannedHoursLabel, projectSectionDateRangeLabel, sydneyTodayDayIndex, sydneyNowMinuteIndex,
  timelineDragSchedule, timelineDragSnapMinutes, timelineMinuteIndex, compareProjectTaskOrder, reorderProjectTaskIds, type TimelineDragMode, type TimelineZoom
} from "@/lib/project-timeline";

type Props = {
  projectId: string;
  canEdit: boolean;
  tasks: ProjectTimelineTaskRecord[];
  sections: ProjectSubJobRecord[];
  staff: { id: string; name: string }[];
  revision: string;
};
type TaskDates = Pick<ProjectTimelineTaskRecord, "plannedStart" | "plannedEnd">;
type DragSession = {
  task: ProjectTimelineTaskRecord;
  pointerId: number;
  startX: number;
  mode: TimelineDragMode;
  preview: TaskDates | null;
  startScrollLeft: number;
  lastX: number;
  moved: boolean;
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

export function GanttTimeline({ projectId, canEdit, tasks, sections, staff, revision }: Props) {
  const router = useRouter();
  // Confirmed inline form saves become visible immediately without awaiting a
  // complete server-component refresh (which loads unrelated project data).
  const [inlineTaskChanges, setInlineTaskChanges] = useState<Record<string, ProjectTimelineTaskRecord>>({});
  const [lastSavedTaskId, setLastSavedTaskId] = useState<string | null>(null);
  const [savedDates, setSavedDates] = useState<Record<string, TaskDates>>({});
  const [savedAssignees, setSavedAssignees] = useState<Record<string, string | null>>({});
  const [savedGroupOrder, setSavedGroupOrder] = useState<Record<string, string[]>>({});
  // Collapsing a group is a local display preference, never a database update.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [rowDragId, setRowDragId] = useState<string | null>(null);
  const [rowDrop, setRowDrop] = useState<{ id: string; after: boolean } | null>(null);
  const rowDragIdRef = useRef<string | null>(null);
  const revisionRef = useRef(revision);
  useEffect(() => { revisionRef.current = revision; }, [revision]);
  // Only poll while this particular project timeline is visible. Revision is a tiny indexed query.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (!alive || document.visibilityState !== "visible" || savingRef.current || dragRef.current) return;
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/revision`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { revision?: string };
        if (data.revision && data.revision !== revisionRef.current) {
          revisionRef.current = data.revision;
          startTransition(() => router.refresh());
        }
      } catch { /* Normal network interruptions must not affect editing. */ }
    };
    const timer = window.setInterval(() => void check(), 40000);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("pm-project-schedule") : null;
    if (channel) channel.onmessage = (event: MessageEvent<{ projectId?: string }>) => {
      if (event.data?.projectId === projectId) void check();
    };
    return () => { alive = false; window.clearInterval(timer); channel?.close(); };
  }, [projectId, router]);
  const [dragPreview, setDragPreview] = useState<{ taskId: string; dates: TaskDates } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const savingRef = useRef<string | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; task: ProjectTimelineTaskRecord; revision?: string }>).detail;
      if (detail?.projectId !== projectId || !detail.task?.id) return;
      if (detail.revision) revisionRef.current = detail.revision;
      setInlineTaskChanges(previous => ({ ...previous, [detail.task.id]: detail.task }));
      setLastSavedTaskId(detail.task.id);
      setSavedDates(previous => { const next = { ...previous }; delete next[detail.task.id]; return next; });
      setSavedAssignees(previous => { const next = { ...previous }; delete next[detail.task.id]; return next; });
    };
    window.addEventListener("pm-project-task-saved", receive);
    return () => window.removeEventListener("pm-project-task-saved", receive);
  }, [projectId]);
  useEffect(() => {
    setInlineTaskChanges(previous => {
      let changed = false;
      const next = { ...previous };
      for (const task of tasks) {
        const inline = next[task.id];
        if (inline && task.title === inline.title && task.subJobId === inline.subJobId &&
          task.plannedStart === inline.plannedStart && task.plannedEnd === inline.plannedEnd &&
          task.allocatedMinutes === inline.allocatedMinutes && task.assigneeProfileId === inline.assigneeProfileId &&
          task.status === inline.status && task.notes === inline.notes) {
          delete next[task.id]; changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [tasks]);
  const displayedTasks = useMemo(() => {
    const merged = tasks.map(task => inlineTaskChanges[task.id] ?? task);
    const known = new Set(tasks.map(task => task.id));
    merged.push(...Object.values(inlineTaskChanges).filter(task => !known.has(task.id)));
    return merged.map(task => ({
    ...task,
    ...(savedDates[task.id] ?? {}),
    ...(Object.prototype.hasOwnProperty.call(savedAssignees, task.id) ? { assigneeProfileId: savedAssignees[task.id],
      assigneeName: staff.find(person => person.id === savedAssignees[task.id])?.name ?? null } : {}),
    ...(dragPreview?.taskId === task.id ? dragPreview.dates : {})
  }));
  }, [tasks, inlineTaskChanges, savedDates, savedAssignees, staff, dragPreview]);
  // Keep the user-chosen display order while refreshing server data.
  const orderedTasks = useMemo(() => [...displayedTasks].sort((a, b) => {
    if (a.subJobId === b.subJobId) {
      const order = savedGroupOrder[a.subJobId ?? "general"];
      if (order) {
        const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
      }
    }
    return compareProjectTaskOrder(a, b);
  }), [displayedTasks, savedGroupOrder]);

  // Release optimistic row ordering only when the server snapshot has caught up.
  useEffect(() => {
    setSavedGroupOrder(previous => {
      const next = { ...previous };
      let changed = false;
      for (const [key, ids] of Object.entries(previous)) {
        const groupId = key === "general" ? null : key;
        const fresh = tasks.filter(task => task.subJobId === groupId)
          .sort(compareProjectTaskOrder).map(task => task.id);
        if (fresh.length === ids.length && fresh.every((id, i) => id === ids[i])) {
          delete next[key]; changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [tasks]);

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
  useEffect(() => {
    setSavedAssignees(previous => {
      const next = { ...previous };
      let changed = false;
      for (const task of tasks) {
        if (Object.prototype.hasOwnProperty.call(next, task.id) && next[task.id] === task.assigneeProfileId) {
          delete next[task.id]; changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [tasks]);

  async function saveRowOrder(movedId: string, targetId: string, after: boolean) {
    const moved = orderedTasks.find(task => task.id === movedId);
    const target = orderedTasks.find(task => task.id === targetId);
    if (!canEdit || savingRef.current || !moved || !target || moved.subJobId !== target.subJobId) return;
    const groupId = moved.subJobId;
    const expectedIds = orderedTasks.filter(task => task.subJobId === groupId).map(task => task.id);
    const newIds = reorderProjectTaskIds(expectedIds, movedId, targetId, after);
    if (newIds.every((id, i) => id === expectedIds[i])) return;
    const key = groupId ?? "general";
    savingRef.current = movedId;
    setSavingId(movedId);
    setFeedback(null);
    setSavedGroupOrder(previous => ({ ...previous, [key]: newIds }));
    try {
      const result = await reorderProjectTasksAction({ projectId, subJobId: groupId,
        orderedTaskIds: newIds, expectedTaskIds: expectedIds });
      if (!result.ok) throw new Error(result.error);
      setFeedback({ error: false, text: `Task order saved for ${sections.find(section => section.id === groupId)?.title ?? "General / Unassigned"}.` });
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("pm-project-schedule");
        channel.postMessage({ projectId }); channel.close();
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setSavedGroupOrder(previous => { const next = { ...previous }; delete next[key]; return next; });
      setFeedback({ error: true, text: error instanceof Error ? error.message : "Couldn't save task order." });
    } finally { savingRef.current = null; setSavingId(null); }
  }

  async function saveAssignee(task: ProjectTimelineTaskRecord, nextAssignee: string | null) {
    if (!canEdit || savingRef.current || task.assigneeProfileId === nextAssignee) return;
    savingRef.current = task.id;
    setSavingId(task.id);
    setFeedback(null);
    setSavedAssignees(previous => ({...previous, [task.id]: nextAssignee}));
    try {
      const result = await assignProjectTaskAction({ projectId, taskId: task.id,
        assigneeProfileId: nextAssignee, expectedAssigneeProfileId: task.assigneeProfileId });
      if (!result.ok) throw new Error(result.error);
      const name = staff.find(person => person.id === nextAssignee)?.name ?? "Unassigned";
      setFeedback({ error:false, text: `${task.title} assigned to ${name}. ` });
      if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("pm-project-schedule");
        channel.postMessage({projectId}); channel.close(); }
      startTransition(() => router.refresh());
    } catch (error) {
      setSavedAssignees(previous => { const copy = {...previous}; delete copy[task.id]; return copy; });
      setFeedback({ error:true, text: error instanceof Error ? error.message : "Couldn't save assignment." });
    } finally { savingRef.current = null; setSavingId(null); }
  }

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
      // Notify other tabs immediately; other staff refresh via a cheap revision probe.
      if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("pm-project-schedule");
        channel.postMessage({projectId}); channel.close(); }
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

  function stopDragAutoScroll() {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }

  // Keep delta tied to the original pointer location AND the timeline's horizontal
  // scroll offset. Without the scroll term, moving across a long project becomes
  // unreliable as soon as the viewport moves under the pointer.
  function updateDragPreview(session: DragSession, clientX: number) {
    const scrolled = (scrollRef.current?.scrollLeft ?? session.startScrollLeft) - session.startScrollLeft;
    const distance = clientX - session.startX + scrolled;
    if (Math.abs(distance) >= 4) session.moved = true;
    const deltaMinutes = distance * (model.endMinute - model.startMinute) / model.width;
    const candidate = timelineDragSchedule(session.task, session.mode, deltaMinutes, zoom);
    // Keep the bar mounted while dragging, including at the edge of a day/week.
    if (timelinePositionInWindow(candidate, model.startMinute, model.endMinute).width <= 0) return;
    if (session.preview?.plannedStart === candidate.plannedStart && session.preview?.plannedEnd === candidate.plannedEnd) return;
    session.preview = candidate;
    setDragPreview({ taskId: session.task.id, dates: candidate });
  }

  function startDragAutoScroll() {
    stopDragAutoScroll();
    const tick = () => {
      const session = dragRef.current;
      if (!session) { autoScrollFrameRef.current = null; return; }
      const viewport = scrollRef.current;
      if (viewport) {
        const bounds = viewport.getBoundingClientRect();
        // Allow room for the sticky task-name column on the left.
        const leftEdge = Math.min(bounds.right - 65, bounds.left + 255 + 35);
        const rightEdge = bounds.right - 55;
        // Do not scroll on a normal click merely because a task happens to sit
        // near the viewport edge. Edge-scrolling starts only after a real drag.
        const direction = !session.moved ? 0 : session.lastX < leftEdge ? -1 : session.lastX > rightEdge ? 1 : 0;
        if (direction) {
          const previousScroll = viewport.scrollLeft;
          viewport.scrollLeft += direction * 14;
          if (viewport.scrollLeft !== previousScroll) updateDragPreview(session, session.lastX);
        }
      }
      autoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };
    autoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  function beginDrag(event: ReactPointerEvent<HTMLAnchorElement>, task: ProjectTimelineTaskRecord) {
    if (!canEdit || savingRef.current || dragRef.current || event.button !== 0 || !event.isPrimary) return;
    suppressClickRef.current = null;
    // Only the explicit narrow end grips resize. The rest of the hit area ALWAYS
    // moves the task, including for one-hour bars that used to have 22px of
    // ambiguous resize zones inside a 60px bar.
    const grip = event.target instanceof Element ? event.target.closest("[data-gantt-resize]")?.getAttribute("data-gantt-resize") : null;
    const mode: TimelineDragMode = grip === "start" ? "resize-start" : grip === "end" ? "resize-end" : "move";
    dragRef.current = { task, pointerId: event.pointerId, startX: event.clientX,
      startScrollLeft: scrollRef.current?.scrollLeft ?? 0, lastX: event.clientX,
      moved: false, mode, preview: null };
    event.currentTarget.setPointerCapture(event.pointerId);
    setFeedback(null);
    startDragAutoScroll();
  }

  function moveDrag(event: ReactPointerEvent<HTMLAnchorElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.lastX = event.clientX;
    updateDragPreview(session, event.clientX);
  }

  function finishDrag(event: ReactPointerEvent<HTMLAnchorElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    // Pointer-up may arrive without an intermediate move event; use its location.
    session.lastX = event.clientX;
    updateDragPreview(session, event.clientX);
    dragRef.current = null;
    stopDragAutoScroll();
    setDragPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // A small drag below the snap threshold must not accidentally follow the
    // task link; only a deliberate click should open the task editor.
    if (session.moved || session.mode !== "move") suppressClickRef.current = session.task.id;
    if (session.preview && (session.preview.plannedStart !== session.task.plannedStart ||
        session.preview.plannedEnd !== session.task.plannedEnd)) {
      void saveDates(session.task, session.preview);
    }
  }

  function cancelDrag(event: ReactPointerEvent<HTMLAnchorElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      if (dragRef.current.moved) suppressClickRef.current = dragRef.current.task.id;
      dragRef.current = null;
      stopDragAutoScroll();
      setDragPreview(null);
    }
  }

  useEffect(() => () => {
    if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current);
  }, []);

  const firstTaskDay = orderedTasks.length ? Math.min(...orderedTasks.map(task => timelineDayIndex(task.plannedStart))) : sydneyTodayDayIndex();
  // A short project should open on an hourly scale rather than tiny day-level bars.
  const [zoom, setZoom] = useState<TimelineZoom>(() => tasks.length && tasks.every(task =>
    timelineDayIndex(task.plannedStart) === firstTaskDay && timelineDayIndex(task.plannedEnd) === firstTaskDay
  ) ? "day" : "week");
  const [focusDay, setFocusDay] = useState(firstTaskDay);
  // A newly saved task may be on a different day/week from the current view.
  // Reveal it without waiting for the server component tree to reload.
  useEffect(() => {
    if (!lastSavedTaskId) return;
    const saved = inlineTaskChanges[lastSavedTaskId];
    if (saved) setFocusDay(timelineDayIndex(saved.plannedStart));
    setLastSavedTaskId(null);
  }, [lastSavedTaskId, inlineTaskChanges]);
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
    const visibleTasks = orderedTasks.filter(task => timelinePositionInWindow(task, window.startMinute, window.endMinute).width > 0);
    return { ...window, width, markers, nowLeft, visibleTasks,
      gridStep: zoom === "day" ? width / 24 : zoom === "week" ? width / 28 : width / window.dayCount };
  }, [orderedTasks, focusDay, zoom]);

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
  }, [inlineTaskChanges, tasks, focusDay, zoom, model.startMinute, model.endMinute, model.width]);

  const groups = [{ id: null, title: "General / Unassigned" }, ...sections.map(s => ({ id: s.id, title: s.title }))]
    .map(group => ({ ...group,
      tasks: model.visibleTasks.filter(task => task.subJobId === group.id),
      allTasks: orderedTasks.filter(task => task.subJobId === group.id)
    }))
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
          {canEdit ? "Drag a bar from its middle to move it; use the small grips at either end to resize (zoom to Day for short tasks). Drag the grip beside the task name to reorder its row." : "Select a bar to view its task. Only owners/managers can change schedules."}
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
      <span style={{ color: "#64748b", fontSize: 11 }}>{model.visibleTasks.length} of {orderedTasks.length} tasks in this period</span>
    </div>
    {feedback ? <div role={feedback.error ? "alert" : "status"} style={{ margin: "0 18px 10px", padding: "9px 12px", borderRadius: 8,
      background: feedback.error ? "#fef2f2" : "#ecfdf5", color: feedback.error ? "#991b1b" : "#065f46", fontSize: 12 }}>{feedback.text}</div> : null}
    {savingId ? <div role="status" style={{ padding: "0 18px 10px", color: "#475569", fontSize: 12 }}>Saving task change…</div> : null}
    {dragPreview ? <div role="status" style={{ padding: "0 18px 10px", color: "#1d4ed8", fontSize: 12, fontWeight: 750 }}>
      {dragRef.current?.mode === "move" ? "Moving" : dragRef.current?.mode === "resize-start" ? "Adjusting start" : "Adjusting finish"}: {timelineTaskRangeLabel(dragPreview.dates)}
    </div> : null}
    <div ref={scrollRef} style={{ overflowX: "auto", borderTop: "1px solid #e2e8f0" }} tabIndex={0} aria-label="Scrollable project Gantt chart">
      {orderedTasks.length === 0 ? <p style={{ padding: 20, margin: 0, color: "#64748b" }}>Add your first task or schedule an existing Production Step to populate the timeline.</p> :
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
        </div> : groups.map(group => {
          const groupKey = group.id ?? "general";
          const collapsed = Boolean(collapsedGroups[groupKey]);
          const groupLabel = projectSectionDateRangeLabel(group.allTasks);
          return <div key={groupKey}>
          <div style={{ display: "flex", background: "#e8eef7", borderBottom: "1px solid #cbd5e1", color: "#1e3a5f", alignItems: "center" }}>
            <div style={{ ...labelCell, background: "#e8eef7", paddingTop: 7, paddingBottom: 7 }}>
              <button type="button" aria-expanded={!collapsed} aria-controls={`gantt-group-${groupKey}`}
                aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.title} tasks`}
                onClick={() => setCollapsedGroups(previous => ({ ...previous, [groupKey]: !previous[groupKey] }))}
                style={{ border: 0, background: "transparent", fontWeight: 900, color: "#1e3a5f", cursor: "pointer",
                  padding: "4px 0", textAlign: "left", display: "flex", alignItems: "center", gap: 7, maxWidth: "100%" }}>
                <span aria-hidden="true" style={{ width: 13, flexShrink: 0 }}>{collapsed ? "▸" : "▾"}</span>
                <span style={{ overflowWrap: "anywhere" }}>{group.title}</span>
              </button>
            </div>
            <div style={{ padding: "6px 12px", fontWeight: 650, fontSize: 11, color: "#475569", minWidth: 0 }}
              title={groupLabel}>
              <span style={{ marginRight: 12 }}>{group.allTasks.length} {group.allTasks.length === 1 ? "task" : "tasks"}</span>
              <span>{groupLabel}</span>
            </div>
          </div>
          <div id={`gantt-group-${groupKey}`}>
          {!collapsed ? group.tasks.map((task, taskIndex) => {
            const bar = timelinePositionInWindow(task, model.startMinute, model.endMinute);
            const timeLabel = timelineTaskRangeLabel(task);
            const description = `${task.title} | ${timeLabel} (Sydney time) | ${plannedHoursLabel(task.allocatedMinutes)} allocated`;
            const barPixels = bar.width * model.width / 100;
            // A one-hour task is only 10px wide in Week view. Increase its
            // invisible grab target without falsifying its visible time span.
            const hitPixels = Math.max(barPixels, canEdit ? 38 : 12);
            const hitPadding = (hitPixels - barPixels) / 2;
            const showResizeGrips = canEdit && barPixels >= 52;
            return <div key={task.id} style={{ display: "flex", borderBottom: "1px solid #edf2f7", minHeight: 59 }}>
              <div style={{ ...labelCell, background: rowDrop?.id === task.id ? "#dbeafe" : "#fff",
                boxShadow: rowDrop?.id === task.id ? `inset 0 ${rowDrop.after ? -3 : 3}px #2563eb` : undefined }}
                onDragOver={event => {
                  const moving = orderedTasks.find(item => item.id === rowDragIdRef.current);
                  if (!canEdit || !moving || moving.subJobId !== task.subJobId || moving.id === task.id || savingRef.current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const after = event.clientY > bounds.top + bounds.height / 2;
                  setRowDrop(previous => previous?.id === task.id && previous.after === after ? previous : { id: task.id, after });
                }}
                onDrop={event => {
                  event.preventDefault();
                  const sourceId = rowDragIdRef.current;
                  const after = event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.clientHeight / 2;
                  rowDragIdRef.current = null; setRowDragId(null); setRowDrop(null);
                  if (sourceId) void saveRowOrder(sourceId, task.id, after);
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                  {canEdit ? <span draggable={savingId === null} role="img"
                    aria-label={`Drag to reorder ${task.title}`} title="Drag up or down to reorder this task"
                    onDragStart={event => {
                      if (savingRef.current) { event.preventDefault(); return; }
                      rowDragIdRef.current = task.id; setRowDragId(task.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", task.id);
                    }}
                    onDragEnd={() => { rowDragIdRef.current = null; setRowDragId(null); setRowDrop(null); }}
                    style={{ flex: "0 0 auto", cursor: rowDragId === task.id ? "grabbing" : "grab",
                      fontSize: 17, color: "#64748b", userSelect: "none", padding: "1px 3px" }}>⠿</span> : null}
                  <a href={`#task-${task.id}`} style={{ color: "#1e3a8a", fontWeight: 800, textDecoration: "none", overflowWrap: "anywhere", flex: 1 }}>{task.title}</a>
                  {canEdit ? <span style={{ display: "flex", gap: 2 }}>
                    {([-1, 1] as const).map(direction => {
                      const neighbour = group.tasks[taskIndex + direction]?.id;
                      return <button key={direction} type="button" disabled={!neighbour || savingId !== null}
                        aria-label={`Move ${task.title} ${direction < 0 ? "up" : "down"}`}
                        title={direction < 0 ? "Move task up" : "Move task down"}
                        onClick={() => { if (neighbour) void saveRowOrder(task.id, neighbour, direction > 0); }}
                        style={{ padding: "1px 4px", cursor: neighbour ? "pointer" : "default", border: 0, borderRadius: 4,
                          background: "#f1f5f9", color: neighbour ? "#1d4ed8" : "#94a3b8", fontSize: 12 }}>
                        {direction < 0 ? "↑" : "↓"}</button>;
                    })}
                  </span> : null}
                </div>
                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: "#334155" }}>{timeLabel}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: "#64748b" }}>{plannedHoursLabel(task.allocatedMinutes)} allocated</div>
                {canEdit ? <select aria-label={`Assign staff to ${task.title}`} title="Assign staff — saves immediately"
                  value={task.assigneeProfileId ?? ""} disabled={savingId !== null} onChange={event => void saveAssignee(task, event.target.value || null)}
                  style={{ marginTop: 3, width: "100%", maxWidth: 220, height: 27, background: "white", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 11 }}>
                  <option value="">Unassigned</option>
                  {staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select> : <div style={{ fontSize: 11, color: "#64748b" }}>{task.assigneeName ?? "Unassigned"}</div>}
              </div>
              <div style={gridTrack}>
                {model.nowLeft !== null ? <div aria-hidden="true" style={{ position: "absolute", left: `${model.nowLeft}%`, top: 0, bottom: 0, borderLeft: "2px solid #dc2626", zIndex: 1, opacity: 0.7 }} /> : null}
                {bar.width > 0 ? <a href={`#task-${task.id}`}
                  draggable={false} onDragStart={event => event.preventDefault()}
                  title={canEdit ? `${description} · Drag to move; drag the end grips to resize. Arrow keys move, Shift+arrows resize finish.` : description}
                  aria-label={description}
                  onPointerDown={event => beginDrag(event, task)} onPointerMove={moveDrag} onPointerUp={finishDrag}
                  onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
                  onClick={event => { if (suppressClickRef.current === task.id) { event.preventDefault(); suppressClickRef.current = null; } }}
                  onKeyDown={event => {
                    if (!canEdit || savingRef.current || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
                    event.preventDefault();
                    const direction = event.key === "ArrowRight" ? 1 : -1;
                    const mode: TimelineDragMode = event.shiftKey ? "resize-end" : "move";
                    const next = timelineDragSchedule(task, mode, direction * timelineDragSnapMinutes(zoom), zoom);
                    void saveDates(task, next);
                  }}
                  style={{ display: "block", position: "absolute", top: 13,
                    left: `calc(${bar.left}% - ${hitPadding}px)`, width: hitPixels,
                    height: 33, zIndex: 2, borderRadius: 6,
                    cursor: canEdit ? (dragPreview?.taskId === task.id ? "grabbing" : "grab") : "pointer",
                    touchAction: canEdit ? "none" : "auto", userSelect: "none", WebkitUserSelect: "none",
                    opacity: savingId === task.id ? 0.75 : 1 }}>
                    {/* Visible duration stays exact even when the touch/pointer target is larger. */}
                    <span aria-hidden="true" style={{ display: "block", position: "absolute", top: 3, height: 27,
                      left: hitPadding, width: Math.max(2, barPixels), borderRadius: 5,
                      background: statusColor(task), pointerEvents: "none",
                      boxShadow: dragPreview?.taskId === task.id ? "0 0 0 3px #93c5fd" : undefined }}/>
                    {showResizeGrips ? <>
                      <span data-gantt-resize="start" aria-hidden="true" title="Drag to change start"
                        style={{ position: "absolute", left: hitPadding, top: 3, height: 27, width: 10,
                          borderRadius: "5px 0 0 5px", cursor: "ew-resize", touchAction: "none",
                          background: "rgba(255,255,255,.12)", borderRight: "1px solid rgba(255,255,255,.65)" }}>
                        <span style={{ display: "block", margin: "9px 0 0 4px", height: 9,
                          borderLeft: "2px solid white", pointerEvents: "none" }}/>
                      </span>
                      <span data-gantt-resize="end" aria-hidden="true" title="Drag to change finish"
                        style={{ position: "absolute", left: hitPadding + barPixels - 10, top: 3, height: 27, width: 10,
                          borderRadius: "0 5px 5px 0", cursor: "ew-resize", touchAction: "none",
                          background: "rgba(255,255,255,.12)", borderLeft: "1px solid rgba(255,255,255,.65)" }}>
                        <span style={{ display: "block", margin: "9px 0 0 4px", height: 9,
                          borderLeft: "2px solid white", pointerEvents: "none" }}/>
                      </span>
                    </> : null}
                  </a> : null}
              </div>
            </div>;
          }) : null}
          </div>
        </div>; })}
      </div>}
    </div>
    <div style={{ display: "flex", gap: 15, flexWrap: "wrap", padding: "11px 17px", fontSize: 11, color: "#475569" }}>
      <span>⚪ Planned</span><span>🔵 In progress</span><span>🟠 Blocked</span><span>🟢 Completed</span><span style={{ color: "#b91c1c" }}>│ Now</span>
      <span>Scroll for more dates. {canEdit ? "Bar centre = move; white end grips = resize. Use Left/Right arrows to move a focused bar, Shift+arrows to resize its finish. Task-name grips reorder rows." : "Select a bar to view the task."}</span>
    </div>
  </section>;
}
