/** Pure, timezone-independent operations on the local workspace planning clock. */
export type ProjectTaskStatus = "planned" | "in_progress" | "blocked" | "completed";
export const PROJECT_TASK_STATUSES: readonly { value: ProjectTaskStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" }
];

export type ProjectSchedule = {
  plannedStart: string;
  plannedEnd: string;
  allocatedMinutes: number;
};

/** HTML datetime-local, interpreted as a wall-clock time in the configured workspace. */
export function parseProjectSchedule(input: {
  plannedStart: string;
  plannedEnd: string;
  allocatedHours: string;
}): ProjectSchedule {
  const validLocalTime = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/;
  const start = input.plannedStart.trim();
  const end = input.plannedEnd.trim();
  if (!validLocalTime.test(start) || !validLocalTime.test(end)) throw new Error("Choose a valid start and finish date/time.");
  const toMillis = (value: string) => {
    const date = new Date(`${value}:00Z`);
    return date.getUTCFullYear() === Number(value.slice(0, 4)) &&
      date.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
      date.getUTCDate() === Number(value.slice(8, 10)) ? date.getTime() : NaN;
  };
  const startMs = toMillis(start);
  const endMs = toMillis(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error("Finish must be later than the start.");
  }
  const hours = Number(input.allocatedHours);
  if (!input.allocatedHours.trim() || !Number.isFinite(hours) || hours < 0 || hours > 8760) {
    throw new Error("Allocated work hours must be between 0 and 8,760.");
  }
  const minutes = Math.round(hours * 60);
  return { plannedStart: start, plannedEnd: end, allocatedMinutes: minutes };
}

export type GanttSpan = { left: number; width: number };
export type TimelineZoom = "day" | "week" | "month";
export type TimelineWindow = {
  startMinute: number;
  endMinute: number; // exclusive; chart positions use the actual minute, not just the date
  firstDay: number;
  dayCount: number;
  title: string;
};
const DAY_MS = 86_400_000;
export function timelineDayIndex(dateTime: string): number {
  const date = dateTime.slice(0, 10);
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Math.floor(ms / DAY_MS);
}

export function sydneyTodayDayIndex(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? "01";
  return timelineDayIndex(`${part("year")}-${part("month")}-${part("day")}`);
}

export function timelineDayRange(items: { plannedStart: string; plannedEnd: string }[]): { first: number; last: number } {
  const today = sydneyTodayDayIndex();
  if (!items.length) return { first: today - 1, last: today + 13 };
  const first = Math.min(...items.map((item) => timelineDayIndex(item.plannedStart)));
  const last = Math.max(...items.map((item) => timelineDayIndex(item.plannedEnd)));
  // Keep a very long project bounded in the initial view. Task dates remain editable in full.
  return { first: first - 1, last: Math.min(last + 2, first + 365) };
}

/** Minute index of a workspace-local datetime-local value. Date.UTC deliberately avoids
 * interpreting the browser's timezone: the database stores these values as local wall time. */
export function timelineMinuteIndex(dateTime: string): number {
  const year = Number(dateTime.slice(0, 4));
  const month = Number(dateTime.slice(5, 7));
  const day = Number(dateTime.slice(8, 10));
  const hour = Number(dateTime.slice(11, 13));
  const minute = Number(dateTime.slice(14, 16));
  return Date.UTC(year, month - 1, day, hour, minute) / 60_000;
}

function utcDate(day: number): Date { return new Date(day * DAY_MS); }
function formatDay(day: number, options: Intl.DateTimeFormatOptions): string {
  return utcDate(day).toLocaleDateString("en-AU", { ...options, timeZone: "UTC" });
}

/** A real calendar day, Monday-to-Sunday week, or full calendar month. */
export function timelineWindow(focusDay: number, zoom: TimelineZoom): TimelineWindow {
  const date = utcDate(focusDay);
  let firstDay = focusDay;
  let dayCount = 1;
  let title = formatDay(focusDay, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (zoom === "week") {
    firstDay = focusDay - ((date.getUTCDay() + 6) % 7);
    dayCount = 7;
    title = `${formatDay(firstDay, { weekday: "short", day: "numeric", month: "short" })} – ${formatDay(firstDay + 6, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`;
  } else if (zoom === "month") {
    firstDay = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / DAY_MS);
    const nextMonth = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / DAY_MS);
    dayCount = nextMonth - firstDay;
    title = formatDay(firstDay, { month: "long", year: "numeric" });
  }
  return { firstDay, dayCount, startMinute: firstDay * 1440, endMinute: (firstDay + dayCount) * 1440, title };
}

export function shiftTimelineFocus(focusDay: number, zoom: TimelineZoom, step: number): number {
  if (zoom !== "month") return focusDay + step * (zoom === "week" ? 7 : 1);
  const date = utcDate(focusDay);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + step, 1) / DAY_MS);
}

/** Keeps sub-day offsets at every zoom. A 09:30 start follows an 08:30 start,
 * even on the week/month overview. Bars are clipped at the visible window. */
export function timelinePositionInWindow(
  item: { plannedStart: string; plannedEnd: string }, startMinute: number, endMinute: number
): GanttSpan {
  const start = timelineMinuteIndex(item.plannedStart);
  const end = timelineMinuteIndex(item.plannedEnd);
  if (!(end > startMinute && start < endMinute && end > start)) return { left: 0, width: 0 };
  const clippedStart = Math.max(start, startMinute);
  const clippedEnd = Math.min(end, endMinute);
  const total = endMinute - startMinute;
  if (total <= 0) return { left: 0, width: 0 };
  return { left: ((clippedStart - startMinute) / total) * 100, width: ((clippedEnd - clippedStart) / total) * 100 };
}

/** Backward-compatible whole-date window, now positioned by exact time. */
export function timelinePosition(item: { plannedStart: string; plannedEnd: string }, first: number, last: number): GanttSpan {
  return timelinePositionInWindow(item, first * 1440, (last + 1) * 1440);
}

/** Clear, always-visible start/finish labels in the chart's task column. */
export function timelineTaskRangeLabel(task: { plannedStart: string; plannedEnd: string }): string {
  const startDay = timelineDayIndex(task.plannedStart);
  const endDay = timelineDayIndex(task.plannedEnd);
  const startLabel = `${formatDay(startDay, { day: "numeric", month: "short" })} ${task.plannedStart.slice(11, 16)}`;
  const endLabel = startDay === endDay ? task.plannedEnd.slice(11, 16) :
    `${formatDay(endDay, { day: "numeric", month: "short" })} ${task.plannedEnd.slice(11, 16)}`;
  return `${startLabel} – ${endLabel}`;
}

/** Local wall clock for the marker, not a UTC instant on a fixed-width day. */
export function sydneyNowMinuteIndex(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? "00";
  return timelineMinuteIndex(`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`);
}


/** Direct manipulation uses wall-clock minutes; changes never alter allocated work hours. */
export type TimelineDragMode = "move" | "resize-start" | "resize-end";
export function timelineDragSnapMinutes(zoom: TimelineZoom): number {
  // Fine adjustment on a day, easier grabs on a week, date-level edits on a month.
  return zoom === "day" ? 15 : zoom === "week" ? 30 : 1440;
}
export function timelineLocalDateTime(minuteIndex: number): string {
  return new Date(minuteIndex * 60_000).toISOString().slice(0, 16);
}
export function timelineDragSchedule(
  task: { plannedStart: string; plannedEnd: string },
  mode: TimelineDragMode,
  rawDeltaMinutes: number,
  zoom: TimelineZoom
): { plannedStart: string; plannedEnd: string } {
  const start = timelineMinuteIndex(task.plannedStart);
  const end = timelineMinuteIndex(task.plannedEnd);
  const step = timelineDragSnapMinutes(zoom);
  const delta = Math.round(rawDeltaMinutes / step) * step;
  let nextStart = start;
  let nextEnd = end;
  if (mode === "move") {
    nextStart += delta;
    nextEnd += delta;
  } else if (mode === "resize-start") {
    nextStart = Math.min(start + delta, end - 15);
  } else {
    nextEnd = Math.max(end + delta, start + 15);
  }
  return { plannedStart: timelineLocalDateTime(nextStart), plannedEnd: timelineLocalDateTime(nextEnd) };
}

/** A Sub Job spans the earliest start to latest finish of its scheduled tasks.
 * Read the stored local wall-clock values directly: no timezone conversion and
 * no dependency on the currently selected Gantt week/day/month window. */
export function projectSectionDateRange(tasks: readonly { plannedStart: string; plannedEnd: string }[]):
  { start: string; finish: string } | null {
  if (!tasks.length) return null;
  let start = tasks[0].plannedStart;
  let finish = tasks[0].plannedEnd;
  for (const task of tasks) {
    if (task.plannedStart < start) start = task.plannedStart;
    if (task.plannedEnd > finish) finish = task.plannedEnd;
  }
  return { start, finish };
}

function shortLocalDateTime(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const day = new Intl.DateTimeFormat("en-AU", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC"
  }).format(date);
  return `${day} ${value.slice(11, 16)}`;
}

export function projectSectionDateRangeLabel(tasks: readonly { plannedStart: string; plannedEnd: string }[]): string {
  const span = projectSectionDateRange(tasks);
  return span ? `Start ${shortLocalDateTime(span.start)} · Finish ${shortLocalDateTime(span.finish)}` : "No dates scheduled";
}

export function plannedHoursLabel(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : Number(hours.toFixed(2))}h`;
}


/** Stable visual row ordering, independent of when a task is scheduled. */
export function compareProjectTaskOrder(
  a: { sortOrder: number; plannedStart: string; id: string },
  b: { sortOrder: number; plannedStart: string; id: string }
): number {
  return a.sortOrder - b.sortOrder || a.plannedStart.localeCompare(b.plannedStart) || a.id.localeCompare(b.id);
}

/** Move a task before/after another task within the same Sub Job. Never change its dates. */
export function reorderProjectTaskIds(ids: readonly string[], movedId: string, targetId: string, after = false): string[] {
  if (!ids.includes(movedId) || !ids.includes(targetId) || movedId === targetId) return [...ids];
  const next = ids.filter(id => id !== movedId);
  const index = next.indexOf(targetId);
  next.splice(index + (after ? 1 : 0), 0, movedId);
  return next;
}
