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

export function timelinePosition(item: { plannedStart: string; plannedEnd: string }, first: number, last: number): GanttSpan {
  const start = timelineDayIndex(item.plannedStart);
  const end = timelineDayIndex(item.plannedEnd);
  if (start > last || end < first) return { left: 0, width: 0 };
  const clippedStart = Math.max(first, Math.min(start, last));
  const clippedEnd = Math.max(clippedStart, Math.min(end, last));
  const total = Math.max(1, last - first + 1);
  return {
    left: ((clippedStart - first) / total) * 100,
    width: Math.max(0.5, ((clippedEnd - clippedStart + 1) / total) * 100)
  };
}

export function plannedHoursLabel(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : Number(hours.toFixed(2))}h`;
}
