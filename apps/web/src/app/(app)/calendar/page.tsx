import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listUsersForTenant } from "@/server/users";
import { listJobTasksForTenant, synchroniseJobsFromCurrentWorkflow, type JobTaskRecord, type JobRecord } from "@/server/jobs";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const card = { background: "#fff", border: "1px solid #dfe7f2", borderRadius: 22, boxShadow: "0 12px 34px rgba(15,23,42,.05)" } as const;

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}


function australiaTodayKey(): string {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function taskTone(task: JobTaskRecord) {
  if (task.status === "completed") return { bg: "#ecfdf3", fg: "#067647", border: "#abefc6" };
  if (task.priority === "urgent") return { bg: "#fff1f2", fg: "#b42318", border: "#fecdd3" };
  if (task.stage.includes("artwork") || task.stage.includes("survey")) return { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe" };
  if (task.stage.includes("quote")) return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  return { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" };
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const params = (await searchParams) ?? {};
  const requestedMonth = readParam(params, "month");
  const staffFilter = readParam(params, "staff");
  const auToday = australiaTodayKey();
  const focusMonth = parseMonth(requestedMonth || auToday.slice(0, 7));
  const focusKey = monthKey(focusMonth);

  const jobs = await synchroniseJobsFromCurrentWorkflow(activeTenant.tenantId);
  const [tasks, staff] = await Promise.all([
    listJobTasksForTenant(activeTenant.tenantId, { month: focusKey }),
    listUsersForTenant(activeTenant.tenantId),
  ]);
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const activeStaff = staff.filter((row) => row.membershipStatus === "active");
  const staffById = new Map(activeStaff.map((row) => [row.userProfileId, row]));
  const visibleTasks = staffFilter ? tasks.filter((task) => task.assigneeProfileIds.includes(staffFilter)) : tasks;
  const byDate = new Map<string, JobTaskRecord[]>();
  for (const task of visibleTasks) {
    if (!task.dueDate) continue;
    const rows = byDate.get(task.dueDate) ?? [];
    rows.push(task);
    byDate.set(task.dueDate, rows);
  }

  const firstWeekday = new Date(focusMonth.getFullYear(), focusMonth.getMonth(), 1).getDay();
  const mondayOffset = (firstWeekday + 6) % 7;
  const gridStart = new Date(focusMonth.getFullYear(), focusMonth.getMonth(), 1 - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const monthLabel = focusMonth.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  const unscheduled = (await listJobTasksForTenant(activeTenant.tenantId)).filter((task) => !task.dueDate && task.status !== "completed" && (!staffFilter || task.assigneeProfileIds.includes(staffFilter))).slice(0, 20);

  return (
    <div style={{ maxWidth: 1540, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ ...card, padding: 22, background: "linear-gradient(135deg,#fff,#f7fbff)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div><p style={{ margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".08em" }}>Job calendar</p><h1 style={{ margin: "5px 0 3px", fontSize: 34 }}>{monthLabel}</h1><p style={{ margin: 0, color: "#667085" }}>Every dated job task and milestone in one place. Assign stages to one or multiple staff from the Job workspace.</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/calendar?month=${monthKey(addMonths(focusMonth, -1))}${staffFilter ? `&staff=${encodeURIComponent(staffFilter)}` : ""}`} style={navButton}>← Previous</Link>
            <Link href={`/calendar?month=${auToday.slice(0, 7)}${staffFilter ? `&staff=${encodeURIComponent(staffFilter)}` : ""}`} style={navButton}>Today</Link>
            <Link href={`/calendar?month=${monthKey(addMonths(focusMonth, 1))}${staffFilter ? `&staff=${encodeURIComponent(staffFilter)}` : ""}`} style={navButton}>Next →</Link>
          </div>
        </div>
        <form method="get" style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <input type="hidden" name="month" value={focusKey} />
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 900 }}>Staff<select name="staff" defaultValue={staffFilter} style={{ minHeight: 40, borderRadius: 12, border: "1px solid #cbd5e1", padding: "0 10px" }}><option value="">All staff</option>{activeStaff.map((person) => <option key={person.userProfileId} value={person.userProfileId}>{person.fullName}</option>)}</select></label>
          <button style={{ minHeight: 40, borderRadius: 12, border: 0, background: "#0f172a", color: "#fff", fontWeight: 900, padding: "0 14px" }}>Apply</button>
        </form>
      </section>

      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", borderBottom: "1px solid #e4e7ec", background: "#f8fafc" }}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day) => <div key={day} style={{ padding: 10, fontSize: 12, fontWeight: 950, color: "#475467", textAlign: "center" }}>{day}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))" }}>
          {days.map((day) => {
            const key = dateKey(day);
            const currentMonth = day.getMonth() === focusMonth.getMonth();
            const dayTasks = byDate.get(key) ?? [];
            const today = key === auToday;
            return <div key={key} style={{ minHeight: 145, padding: 8, borderRight: "1px solid #eef2f6", borderBottom: "1px solid #eef2f6", background: currentMonth ? "#fff" : "#fafafa", opacity: currentMonth ? 1 : .62 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ width: 28, height: 28, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: today ? "#155eef" : "transparent", color: today ? "#fff" : "#475467", fontSize: 12, fontWeight: 950 }}>{day.getDate()}</span><span style={{ color: "#98a2b3", fontSize: 10 }}>{dayTasks.length || ""}</span></div>
              <div style={{ display: "grid", gap: 5, marginTop: 6 }}>
                {dayTasks.slice(0, 4).map((task) => {
                  const job = jobById.get(task.jobId);
                  const colors = taskTone(task);
                  return <Link key={task.id} href={`/jobs/${task.jobId}`} style={{ borderRadius: 9, padding: "6px 7px", background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}`, textDecoration: "none", minWidth: 0 }}><strong style={{ display: "block", fontSize: 11, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{task.title}</strong><span style={{ display: "block", marginTop: 2, fontSize: 10, opacity: .85, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{job?.title || job?.clientName || "Job"}{task.assigneeProfileIds.length ? ` · ${task.assigneeProfileIds.map((id) => staffById.get(id)?.shortName || "Staff").join(", ")}` : ""}</span></Link>;
                })}
                {dayTasks.length > 4 ? <span style={{ color: "#667085", fontSize: 10, fontWeight: 800 }}>+{dayTasks.length - 4} more</span> : null}
              </div>
            </div>;
          })}
        </div>
      </section>

      <section style={{ ...card, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><div><p style={{ margin: 0, fontSize: 12, fontWeight: 950, color: "#4f46e5", textTransform: "uppercase" }}>Needs scheduling</p><h2 style={{ margin: "4px 0 0" }}>Unscheduled tasks</h2></div><span style={{ borderRadius: 999, background: "#f2f4f7", padding: "6px 10px", fontSize: 12, fontWeight: 900 }}>{unscheduled.length}</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10, marginTop: 12 }}>
          {unscheduled.map((task) => { const job = jobById.get(task.jobId); return <Link key={task.id} href={`/jobs/${task.jobId}`} style={{ border: "1px solid #e4e7ec", borderRadius: 14, padding: 12, color: "inherit", textDecoration: "none" }}><strong>{task.title}</strong><span style={{ display: "block", color: "#667085", marginTop: 3, fontSize: 12 }}>{job?.title || job?.clientName || "Job"} · {task.stage.replaceAll("_", " ")}</span></Link>; })}
          {!unscheduled.length ? <p style={{ margin: 0, color: "#667085" }}>All open tasks have dates.</p> : null}
        </div>
      </section>
    </div>
  );
}

const navButton = { minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 12px", borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#344054", fontWeight: 900, textDecoration: "none" } as const;
