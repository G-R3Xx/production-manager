"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type CalendarView = "week" | "month" | "agenda";
export type CalendarEvent = {
  id: string;
  kind: "process" | "task" | "production_step";
  taskId: string | null;
  productionStepId: string | null;
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  clientName: string;
  jobType: string;
  processKey: string | null;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeProfileIds: string[];
  notes: string | null;
  currentStage: string;
  assignmentSource: string | null;
  assignmentProcessKey: string | null;
};

export type CalendarStaff = { id: string; name: string; shortName: string };

type Props = {
  initialEvents: CalendarEvent[];
  staff: CalendarStaff[];
  todayKey: string;
  initialDate: string;
  initialView: CalendarView;
  initialStaff: string;
  initialProcess: string;
  initialJobType: string;
  initialQuery: string;
};

const processOptions = [
  ["", "All processes"],
  ["enquiry", "Enquiry"],
  ["survey", "Survey"],
  ["quote", "Quote"],
  ["artwork", "Artwork"],
  ["production", "Production / procedures"],
  ["dispatch", "Pickup / delivery / install"],
  ["invoicing", "Invoicing"],
  ["task", "Extra tasks"],
] as const;

const jobTypeOptions = [
  ["", "All job types"],
  ["signage", "Signage"],
  ["small_format", "Small format"],
  ["plans_posters", "Plans / posters"],
  ["installation", "Install only"],
  ["mixed", "Mixed"],
  ["other", "Other"],
] as const;

const processLabels: Record<string, string> = {
  enquiry: "Enquiry",
  survey: "Survey",
  quote: "Quote",
  artwork: "Artwork",
  production: "Production",
  dispatch: "Pickup / delivery / install",
  invoicing: "Invoicing",
};

const processColors: Record<string, { bg: string; fg: string; border: string; solid: string }> = {
  enquiry: { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe", solid: "#2563eb" },
  survey: { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe", solid: "#7c3aed" },
  quote: { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa", solid: "#ea580c" },
  artwork: { bg: "#fdf4ff", fg: "#a21caf", border: "#f5d0fe", solid: "#c026d3" },
  production: { bg: "#ecfeff", fg: "#0e7490", border: "#a5f3fc", solid: "#0891b2" },
  dispatch: { bg: "#ecfdf3", fg: "#067647", border: "#abefc6", solid: "#079455" },
  invoicing: { bg: "#fffbeb", fg: "#a16207", border: "#fde68a", solid: "#ca8a04" },
  task: { bg: "#f8fafc", fg: "#475467", border: "#cbd5e1", solid: "#64748b" },
};

function parseDateKey(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value: string, amount: number): string {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function addMonths(value: string, amount: number): string {
  const date = parseDateKey(value);
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  return dateKey(date);
}

function startOfWeek(value: string): string {
  const date = parseDateKey(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return dateKey(date);
}

function startOfMonthGrid(value: string): string {
  const date = parseDateKey(value);
  date.setDate(1);
  return startOfWeek(dateKey(date));
}

function formatDay(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-AU", options).format(parseDateKey(value));
}

function processForEvent(event: CalendarEvent): string {
  return event.kind === "task" ? "task" : event.processKey || "task";
}

function eventKindLabel(event: CalendarEvent): string {
  if (event.kind === "production_step") return "Production procedure";
  if (event.kind === "process") return `${processLabels[event.processKey ?? ""] || "Job"} process`;
  return "Extra task";
}

function toneForEvent(event: CalendarEvent) {
  if (event.priority === "urgent") return { bg: "#fff1f2", fg: "#b42318", border: "#fecdd3", solid: "#e11d48" };
  return processColors[processForEvent(event)] ?? processColors.task;
}

function completed(event: CalendarEvent): boolean {
  return event.status === "completed" || event.status === "cancelled";
}

function EventCard({ event, compact, onSelect, onDragStart, onDragEnd }: { event: CalendarEvent; compact?: boolean; onSelect: () => void; onDragStart: (event: React.DragEvent) => void; onDragEnd?: () => void }) {
  const tone = toneForEvent(event);
  return (
    <button
      type="button"
      draggable={!completed(event)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      title={`${event.jobNumber} · ${event.jobTitle}`}
      style={{ width: "100%", border: `1px solid ${tone.border}`, borderLeft: `4px solid ${tone.solid}`, borderRadius: 10, background: tone.bg, color: tone.fg, padding: compact ? "6px 7px" : "8px 9px", textAlign: "left", cursor: completed(event) ? "pointer" : "grab", opacity: completed(event) ? .62 : 1, minWidth: 0 }}
    >
      <strong style={{ display: "block", fontSize: compact ? 10 : 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.title}</strong>
      <span style={{ display: "block", marginTop: 2, fontSize: compact ? 9 : 10, color: "#475467", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.jobTitle}</span>
    </button>
  );
}

export function OperationsCalendar({ initialEvents, staff, todayKey, initialDate, initialView, initialStaff, initialProcess, initialJobType, initialQuery }: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [view, setView] = useState<CalendarView>(initialView);
  const [focusDate, setFocusDate] = useState(initialDate);
  const [staffFilter, setStaffFilter] = useState(initialStaff);
  const [processFilter, setProcessFilter] = useState(initialProcess);
  const [jobTypeFilter, setJobTypeFilter] = useState(initialJobType);
  const [query, setQuery] = useState(initialQuery);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [draftStaff, setDraftStaff] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => setEvents(initialEvents), [initialEvents]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", focusDate);
    url.searchParams.set("view", view);
    const optional = [["staff", staffFilter], ["process", processFilter], ["type", jobTypeFilter], ["q", query.trim()]] as const;
    for (const [key, value] of optional) value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [focusDate, view, staffFilter, processFilter, jobTypeFilter, query]);

  const activeStaffIds = useMemo(() => new Set(staff.map((person) => person.id)), [staff]);
  const effectiveStaffIds = (event: CalendarEvent) => event.assigneeProfileIds.filter((id) => activeStaffIds.has(id));

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      const assigned = event.assigneeProfileIds.filter((id) => activeStaffIds.has(id));
      if (!showCompleted && completed(event)) return false;
      if (staffFilter === "unassigned" && assigned.length) return false;
      if (staffFilter && staffFilter !== "unassigned" && !assigned.includes(staffFilter)) return false;
      if (processFilter && (processFilter === "task" ? event.kind !== "task" : event.processKey !== processFilter)) return false;
      if (jobTypeFilter && event.jobType !== jobTypeFilter) return false;
      if (overdueOnly && (!event.dueDate || event.dueDate >= todayKey || completed(event))) return false;
      if (needle && !`${event.jobNumber} ${event.jobTitle} ${event.clientName} ${event.title} ${event.notes ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [events, activeStaffIds, showCompleted, staffFilter, processFilter, jobTypeFilter, overdueOnly, query, todayKey]);

  const selected = events.find((event) => event.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) return;
    setDraftDate(selected.dueDate ?? "");
    setDraftStaff(effectiveStaffIds(selected));
    setError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function saveSchedule(event: CalendarEvent, dueDate: string | null, assigneeProfileIds: string[], inherit = false) {
    const previous = events;
    const nextDate = dueDate || null;
    setSavingId(event.id);
    setError("");
    setNotice("");
    if (!inherit) setEvents((current) => current.map((item) => item.id === event.id ? { ...item, dueDate: nextDate, assigneeProfileIds } : item));
    try {
      const response = await fetch("/api/calendar/events", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: event.kind,
          jobId: event.jobId,
          taskId: event.taskId,
          productionStepId: event.productionStepId,
          processKey: event.processKey,
          dueDate: nextDate,
          assigneeProfileIds,
          notes: event.notes,
          inherit,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Calendar item could not be saved.");
      setEvents((current) => current.map((item) => item.id === event.id ? {
        ...item,
        dueDate: result.dueDate ?? null,
        assigneeProfileIds: result.assigneeProfileIds ?? [],
        assignmentSource: result.assignmentSource ?? item.assignmentSource,
        assignmentProcessKey: result.assignmentProcessKey ?? item.assignmentProcessKey,
        processKey: result.assignmentProcessKey ?? item.processKey,
      } : item));
      setDraftDate(result.dueDate ?? "");
      setDraftStaff(result.assigneeProfileIds ?? []);
      setNotice(inherit ? `${event.title} now uses process defaults` : `${event.title} updated`);
    } catch (cause) {
      setEvents(previous);
      setError(cause instanceof Error ? cause.message : "Calendar item could not be saved.");
    } finally {
      setSavingId(null);
      setDraggingId(null);
      setDropTarget(null);
    }
  }

  function dropOnDate(date: string) {
    const event = events.find((item) => item.id === draggingId);
    if (!event || completed(event)) return;
    if (event.dueDate === date) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }
    void saveSchedule(event, date, effectiveStaffIds(event));
  }

  function beginDrag(event: CalendarEvent, dragEvent: React.DragEvent) {
    setDraggingId(event.id);
    dragEvent.dataTransfer.effectAllowed = "move";
    dragEvent.dataTransfer.setData("text/calendar-event", event.id);
  }

  function navigate(amount: number) {
    setFocusDate((current) => view === "month" ? addMonths(current, amount) : addDays(current, view === "agenda" ? amount * 30 : amount * 7));
  }

  const weekStart = startOfWeek(focusDate);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const monthGridStart = startOfMonthGrid(focusDate);
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index));
  const focusMonth = focusDate.slice(0, 7);
  const agendaEnd = addDays(weekStart, 29);
  const scheduled = filteredEvents.filter((event) => event.dueDate);
  const unscheduled = filteredEvents.filter((event) => !event.dueDate && !completed(event));
  const dueToday = filteredEvents.filter((event) => event.dueDate === todayKey && !completed(event)).length;
  const overdue = filteredEvents.filter((event) => event.dueDate && event.dueDate < todayKey && !completed(event)).length;
  const dueThisWeek = filteredEvents.filter((event) => event.dueDate && event.dueDate >= startOfWeek(todayKey) && event.dueDate <= addDays(startOfWeek(todayKey), 6) && !completed(event)).length;
  const staffRows = staffFilter === "unassigned"
    ? [{ id: "unassigned", name: "Unassigned", shortName: "—" }]
    : staffFilter
      ? staff.filter((person) => person.id === staffFilter)
      : [...staff, { id: "unassigned", name: "Unassigned", shortName: "—" }];

  const rangeLabel = view === "month"
    ? formatDay(focusDate, { month: "long", year: "numeric" })
    : view === "agenda"
      ? `${formatDay(weekStart, { day: "numeric", month: "short" })} – ${formatDay(agendaEnd, { day: "numeric", month: "short", year: "numeric" })}`
      : `${formatDay(weekStart, { day: "numeric", month: "short" })} – ${formatDay(addDays(weekStart, 6), { day: "numeric", month: "short", year: "numeric" })}`;

  const eventsOn = (date: string) => scheduled.filter((event) => event.dueDate === date).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="operations-calendar" style={{ display: "grid", gap: 14 }}>
      <style>{`
        .calendar-week-grid{min-width:1250px}
        .calendar-week-row{display:grid;grid-template-columns:180px repeat(7,minmax(150px,1fr))}
        .calendar-month-grid{display:grid;grid-template-columns:repeat(7,minmax(130px,1fr));min-width:980px}
        .calendar-filters{display:grid;grid-template-columns:minmax(230px,1.5fr) repeat(3,minmax(150px,.7fr));gap:8px}
        .calendar-drawer{position:fixed;right:0;top:0;bottom:0;width:min(430px,94vw);z-index:61;background:#fff;box-shadow:-18px 0 45px rgba(15,23,42,.18);overflow:auto;padding:22px}
        .calendar-backdrop{position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.28);border:0}
        @media(max-width:1050px){.calendar-filters{grid-template-columns:1fr 1fr}.calendar-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
        @media(max-width:650px){.calendar-filters{grid-template-columns:1fr}.calendar-stats{grid-template-columns:1fr 1fr!important}}
      `}</style>

      <section style={{ background: "linear-gradient(135deg,#fff,#f5f9ff)", border: "1px solid #dfe7f2", borderRadius: 22, padding: 20, boxShadow: "0 12px 34px rgba(15,23,42,.05)", display: "grid", gap: 15 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".08em" }}>Operations calendar</p>
            <h1 style={{ margin: "5px 0 3px", fontSize: 34, letterSpacing: "-.035em" }}>{rangeLabel}</h1>
            <p style={{ margin: 0, color: "#667085" }}>Schedule job processes, individual production procedures and extra tasks across the team. Changes save here without reloading the page.</p>
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {(["week", "month", "agenda"] as CalendarView[]).map((option) => <button key={option} type="button" onClick={() => setView(option)} style={{ minHeight: 40, borderRadius: 11, border: view === option ? "1px solid #155eef" : "1px solid #d0d5dd", background: view === option ? "#eff6ff" : "#fff", color: view === option ? "#155eef" : "#344054", padding: "0 13px", fontWeight: 900, cursor: "pointer", textTransform: "capitalize" }}>{option}</button>)}
          </div>
        </div>

        <div className="calendar-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(130px,1fr))", gap: 8 }}>
          {[[dueToday, "Due today"], [overdue, "Overdue"], [dueThisWeek, "Due this week"], [unscheduled.length, "Needs scheduling"]].map(([value, label]) => <div key={String(label)} style={{ border: "1px solid #e4e7ec", borderRadius: 13, background: "#fff", padding: "10px 12px" }}><strong style={{ fontSize: 23, color: label === "Overdue" && Number(value) ? "#b42318" : "#101828" }}>{value}</strong><span style={{ display: "block", color: "#667085", fontSize: 11, fontWeight: 800 }}>{label}</span></div>)}
        </div>

        <div className="calendar-filters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search job, client, number or task…" style={controlStyle} />
          <select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)} style={controlStyle}><option value="">All staff</option><option value="unassigned">Unassigned</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
          <select value={processFilter} onChange={(event) => setProcessFilter(event.target.value)} style={controlStyle}>{processOptions.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}</select>
          <select value={jobTypeFilter} onChange={(event) => setJobTypeFilter(event.target.value)} style={controlStyle}>{jobTypeOptions.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}</select>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => setOverdueOnly((value) => !value)} style={filterChip(overdueOnly, "#b42318", "#fff1f2", "#fecdd3")}>{overdueOnly ? "✓ " : ""}Overdue only</button>
          <button type="button" onClick={() => setShowCompleted((value) => !value)} style={filterChip(showCompleted, "#067647", "#ecfdf3", "#abefc6")}>{showCompleted ? "✓ " : ""}Show completed</button>
          {(query || staffFilter || processFilter || jobTypeFilter || overdueOnly || showCompleted) ? <button type="button" onClick={() => { setQuery(""); setStaffFilter(""); setProcessFilter(""); setJobTypeFilter(""); setOverdueOnly(false); setShowCompleted(false); }} style={filterChip(false, "#475467", "#fff", "#d0d5dd")}>Clear filters</button> : null}
          {notice ? <span style={{ color: "#067647", fontSize: 12, fontWeight: 850 }}>✓ {notice}</span> : null}
          {error && !selected ? <span style={{ color: "#b42318", fontSize: 12, fontWeight: 850 }}>{error}</span> : null}
        </div>
      </section>

      <section style={{ background: "#fff", border: "1px solid #dfe7f2", borderRadius: 20, padding: 14, boxShadow: "0 10px 28px rgba(15,23,42,.04)", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 7 }}><button type="button" onClick={() => navigate(-1)} style={navStyle}>←</button><button type="button" onClick={() => setFocusDate(todayKey)} style={navStyle}>Today</button><button type="button" onClick={() => navigate(1)} style={navStyle}>→</button></div>
          <span style={{ color: "#667085", fontSize: 12, fontWeight: 800 }}>Drag any open item onto another date to reschedule it.</span>
        </div>

        {view === "week" ? (
          <div style={{ overflowX: "auto", border: "1px solid #e4e7ec", borderRadius: 15 }}>
            <div className="calendar-week-grid">
              <div className="calendar-week-row" style={{ position: "sticky", top: 0, zIndex: 3, background: "#f8fafc", borderBottom: "1px solid #e4e7ec" }}>
                <div style={{ padding: 11, fontSize: 11, fontWeight: 950, color: "#475467" }}>TEAM</div>
                {weekDays.map((day) => <div key={day} style={{ padding: 9, textAlign: "center", borderLeft: "1px solid #e4e7ec", background: day === todayKey ? "#eff6ff" : "#f8fafc" }}><strong style={{ display: "block", fontSize: 11, color: day === todayKey ? "#155eef" : "#475467", textTransform: "uppercase" }}>{formatDay(day, { weekday: "short" })}</strong><span style={{ display: "block", marginTop: 2, fontSize: 15, fontWeight: 950 }}>{formatDay(day, { day: "numeric", month: "short" })}</span></div>)}
              </div>
              {staffRows.map((person) => (
                <div key={person.id} className="calendar-week-row" style={{ borderBottom: "1px solid #e4e7ec", minHeight: 118 }}>
                  <div style={{ padding: 11, background: person.id === "unassigned" ? "#fffbeb" : "#fbfcfe", display: "flex", gap: 9, alignItems: "flex-start" }}><span style={{ width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", background: person.id === "unassigned" ? "#fef3c7" : "#e0e7ff", color: person.id === "unassigned" ? "#a16207" : "#4338ca", fontWeight: 950 }}>{person.shortName.slice(0, 2).toUpperCase()}</span><div><strong style={{ display: "block", fontSize: 12 }}>{person.name}</strong><span style={{ color: "#98a2b3", fontSize: 10 }}>{person.id === "unassigned" ? "Needs an owner" : "Assigned work"}</span></div></div>
                  {weekDays.map((day) => {
                    const cellEvents = eventsOn(day).filter((event) => person.id === "unassigned" ? effectiveStaffIds(event).length === 0 : effectiveStaffIds(event).includes(person.id));
                    const targetKey = `${person.id}:${day}`;
                    return <div key={day} onDragOver={(event) => { event.preventDefault(); setDropTarget(targetKey); }} onDragLeave={() => setDropTarget((current) => current === targetKey ? null : current)} onDrop={(event) => { event.preventDefault(); dropOnDate(day); }} style={{ padding: 7, borderLeft: "1px solid #eef2f6", background: dropTarget === targetKey ? "#dbeafe" : day === todayKey ? "#f8fbff" : "#fff", display: "grid", alignContent: "start", gap: 5, transition: "background .12s" }}>
                      {cellEvents.map((item) => <EventCard key={item.id} event={item} onSelect={() => setSelectedId(item.id)} onDragStart={(event) => beginDrag(item, event)} onDragEnd={() => { setDraggingId(null); setDropTarget(null); }} />)}
                    </div>;
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {view === "month" ? (
          <div style={{ overflowX: "auto", border: "1px solid #e4e7ec", borderRadius: 15 }}>
            <div className="calendar-month-grid" style={{ background: "#f8fafc", borderBottom: "1px solid #e4e7ec" }}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} style={{ padding: 9, textAlign: "center", fontSize: 11, fontWeight: 950, color: "#475467" }}>{day}</div>)}</div>
            <div className="calendar-month-grid">
              {monthDays.map((day) => {
                const dayEvents = eventsOn(day);
                const inMonth = day.startsWith(focusMonth);
                return <div key={day} onDragOver={(event) => { event.preventDefault(); setDropTarget(day); }} onDragLeave={() => setDropTarget((current) => current === day ? null : current)} onDrop={(event) => { event.preventDefault(); dropOnDate(day); }} style={{ minHeight: 150, padding: 7, borderRight: "1px solid #eef2f6", borderBottom: "1px solid #eef2f6", background: dropTarget === day ? "#dbeafe" : inMonth ? day === todayKey ? "#f8fbff" : "#fff" : "#f8fafc", opacity: inMonth ? 1 : .55, display: "grid", alignContent: "start", gap: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ width: 27, height: 27, borderRadius: 999, display: "grid", placeItems: "center", background: day === todayKey ? "#155eef" : "transparent", color: day === todayKey ? "#fff" : "#475467", fontSize: 11, fontWeight: 950 }}>{parseDateKey(day).getDate()}</span><span style={{ color: "#98a2b3", fontSize: 9 }}>{dayEvents.length || ""}</span></div>
                  {dayEvents.slice(0, 4).map((item) => <EventCard key={item.id} compact event={item} onSelect={() => setSelectedId(item.id)} onDragStart={(event) => beginDrag(item, event)} onDragEnd={() => { setDraggingId(null); setDropTarget(null); }} />)}
                  {dayEvents.length > 4 ? <button type="button" onClick={() => { setFocusDate(day); setView("agenda"); }} style={{ border: 0, background: "transparent", textAlign: "left", color: "#155eef", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>+{dayEvents.length - 4} more</button> : null}
                </div>;
              })}
            </div>
          </div>
        ) : null}

        {view === "agenda" ? (
          <div style={{ display: "grid", gap: 8 }}>
            {scheduled.filter((event) => event.dueDate! >= weekStart && event.dueDate! <= agendaEnd).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.title.localeCompare(b.title)).map((event) => {
              const tone = toneForEvent(event);
              return <button key={event.id} type="button" onClick={() => setSelectedId(event.id)} style={{ display: "grid", gridTemplateColumns: "110px minmax(190px,1fr) minmax(180px,.8fr) auto", gap: 12, alignItems: "center", border: "1px solid #e4e7ec", borderLeft: `5px solid ${tone.solid}`, borderRadius: 13, background: "#fff", padding: 11, textAlign: "left", cursor: "pointer" }}><span><strong style={{ display: "block", color: event.dueDate! < todayKey && !completed(event) ? "#b42318" : "#101828" }}>{formatDay(event.dueDate!, { weekday: "short", day: "numeric", month: "short" })}</strong>{event.dueDate! < todayKey && !completed(event) ? <small style={{ color: "#b42318", fontWeight: 900 }}>OVERDUE</small> : null}</span><span><strong style={{ display: "block" }}>{event.title}</strong><small style={{ color: "#667085" }}>{eventKindLabel(event)}</small></span><span><strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.jobTitle}</strong><small style={{ color: "#667085" }}>{event.jobNumber} · {event.clientName}</small></span><span style={{ color: "#155eef", fontWeight: 900 }}>Edit →</span></button>;
            })}
            {!scheduled.some((event) => event.dueDate! >= weekStart && event.dueDate! <= agendaEnd) ? <div style={{ padding: 28, textAlign: "center", color: "#667085" }}>No scheduled work matches this 30-day agenda.</div> : null}
          </div>
        ) : null}
      </section>

      <section style={{ background: "#fff", border: "1px solid #dfe7f2", borderRadius: 20, padding: 18, boxShadow: "0 10px 28px rgba(15,23,42,.04)", display: "grid", gap: 11 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><div><p style={{ margin: 0, color: "#4f46e5", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".06em" }}>Unscheduled work</p><h2 style={{ margin: "3px 0 0" }}>Give every active process and procedure a date</h2></div><span style={{ borderRadius: 999, background: unscheduled.length ? "#fffbeb" : "#ecfdf3", color: unscheduled.length ? "#a16207" : "#067647", padding: "6px 10px", fontSize: 12, fontWeight: 950 }}>{unscheduled.length}</span></div>
        <p style={{ margin: 0, color: "#667085", fontSize: 12 }}>Drag a card directly onto the week or month calendar, or click it to set its date and team.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(245px,1fr))", gap: 8 }}>
          {unscheduled.map((event) => <EventCard key={event.id} event={event} onSelect={() => setSelectedId(event.id)} onDragStart={(dragEvent) => beginDrag(event, dragEvent)} onDragEnd={() => { setDraggingId(null); setDropTarget(null); }} />)}
          {!unscheduled.length ? <div style={{ border: "1px solid #abefc6", borderRadius: 13, background: "#ecfdf3", color: "#067647", padding: 14, fontWeight: 850 }}>✓ All visible work has a date.</div> : null}
        </div>
      </section>

      {selected ? <>
        <button className="calendar-backdrop" type="button" aria-label="Close calendar details" onClick={() => setSelectedId(null)} />
        <aside className="calendar-drawer" aria-label="Calendar item details">
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}><div><p style={{ margin: 0, color: toneForEvent(selected).solid, fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>{eventKindLabel(selected)}</p><h2 style={{ margin: "4px 0 0", fontSize: 25 }}>{selected.title}</h2></div><button type="button" onClick={() => setSelectedId(null)} style={{ width: 38, height: 38, borderRadius: 11, border: "1px solid #d0d5dd", background: "#fff", fontSize: 20, cursor: "pointer" }}>×</button></div>
            <section style={{ border: "1px solid #e4e7ec", borderRadius: 15, background: "#f8fafc", padding: 13 }}><strong style={{ display: "block", fontSize: 16 }}>{selected.jobTitle}</strong><span style={{ display: "block", marginTop: 4, color: "#667085", fontSize: 12 }}>{selected.jobNumber} · {selected.clientName}</span><span style={{ display: "inline-block", marginTop: 8, borderRadius: 999, background: "#fff", border: "1px solid #d0d5dd", padding: "4px 8px", color: "#475467", fontSize: 10, fontWeight: 900 }}>{selected.jobType.replaceAll("_", " ")}</span></section>
            {selected.kind === "production_step" ? <section style={{ border: `1px solid ${selected.assignmentSource === "manual" ? "#bfdbfe" : "#a5f3fc"}`, borderRadius: 13, background: selected.assignmentSource === "manual" ? "#eff6ff" : "#ecfeff", color: selected.assignmentSource === "manual" ? "#1d4ed8" : "#0e7490", padding: 12, fontSize: 12 }}><strong style={{ display: "block" }}>{selected.assignmentSource === "manual" ? "This procedure has its own schedule" : `Inherited from ${selected.assignmentProcessKey === "dispatch" ? "Pickup / delivery / install" : "Production"}`}</strong><span style={{ display: "block", marginTop: 3 }}>{selected.assignmentSource === "manual" ? "Change it here, or restore the main process defaults below." : "Changing the date or staff here creates an override for this procedure only."}</span></section> : null}
            <label style={labelStyle}>Due date<input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} style={controlStyle} /></label>
            <fieldset style={{ border: "1px solid #dbe4f0", borderRadius: 15, padding: 12 }}><legend style={{ color: "#344054", fontSize: 11, fontWeight: 950, textTransform: "uppercase" }}>Assigned staff</legend><div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{staff.map((person) => { const active = draftStaff.includes(person.id); return <button key={person.id} type="button" onClick={() => setDraftStaff((current) => active ? current.filter((id) => id !== person.id) : [...current, person.id])} style={filterChip(active, "#155eef", "#eff6ff", "#bfdbfe")}>{active ? "✓ " : "+ "}{person.name}</button>; })}{!staff.length ? <span style={{ color: "#b42318", fontSize: 12 }}>No active staff are available.</span> : null}</div></fieldset>
            {selected.notes ? <section style={{ border: "1px solid #e4e7ec", borderRadius: 13, padding: 12 }}><strong style={{ display: "block", fontSize: 11, color: "#667085", textTransform: "uppercase" }}>Notes</strong><p style={{ margin: "5px 0 0", whiteSpace: "pre-wrap", color: "#344054", fontSize: 13 }}>{selected.notes}</p></section> : null}
            {error ? <div style={{ border: "1px solid #fda29b", borderRadius: 12, background: "#fff5f4", color: "#b42318", padding: 10, fontSize: 12, fontWeight: 800 }}>{error}</div> : null}
            <div style={{ display: "grid", gap: 8 }}><button type="button" disabled={savingId === selected.id} onClick={() => void saveSchedule(selected, draftDate || null, draftStaff)} style={{ minHeight: 46, border: 0, borderRadius: 12, background: "#0f172a", color: "#fff", fontWeight: 950, cursor: "pointer" }}>{savingId === selected.id ? "Saving…" : selected.kind === "production_step" ? "Save procedure schedule" : "Save schedule"}</button>{draftDate ? <button type="button" disabled={savingId === selected.id} onClick={() => void saveSchedule(selected, null, draftStaff)} style={{ minHeight: 42, border: "1px solid #fed7aa", borderRadius: 12, background: "#fff", color: "#c2410c", fontWeight: 900, cursor: "pointer" }}>Move back to unscheduled</button> : null}{selected.kind === "production_step" && selected.assignmentSource === "manual" ? <button type="button" disabled={savingId === selected.id} onClick={() => void saveSchedule(selected, selected.dueDate, selected.assigneeProfileIds, true)} style={{ minHeight: 42, border: "1px solid #a5f3fc", borderRadius: 12, background: "#fff", color: "#0e7490", fontWeight: 900, cursor: "pointer" }}>Use {selected.assignmentProcessKey === "dispatch" ? "dispatch" : "Production"} defaults</button> : null}<Link href={`/jobs/${selected.jobId}`} style={{ minHeight: 44, border: "1px solid #cfd9e8", borderRadius: 12, background: "#fff", color: "#155eef", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", fontWeight: 950 }}>Open complete job →</Link></div>
          </div>
        </aside>
      </> : null}
    </div>
  );
}

const controlStyle = { minHeight: 42, width: "100%", border: "1px solid #cbd5e1", borderRadius: 11, background: "#fff", padding: "0 11px", color: "#101828", boxSizing: "border-box" as const, font: "inherit" } as const;
const labelStyle = { display: "grid", gap: 6, color: "#344054", fontSize: 11, fontWeight: 950, textTransform: "uppercase" as const };
const navStyle = { minWidth: 42, minHeight: 40, border: "1px solid #d0d5dd", borderRadius: 11, background: "#fff", color: "#344054", padding: "0 12px", fontWeight: 900, cursor: "pointer" } as const;
function filterChip(active: boolean, fg: string, bg: string, border: string) { return { minHeight: 34, borderRadius: 999, border: `1px solid ${active ? border : "#d0d5dd"}`, background: active ? bg : "#fff", color: active ? fg : "#475467", padding: "0 11px", fontWeight: 900, fontSize: 11, cursor: "pointer" } as const; }
