import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listJobsForTenant, listJobTasksForTenant, type JobRecord } from "@/server/jobs";
import { listUsersForTenant } from "@/server/users";
import { customerLogoUrl, listCustomerLogoSummariesForTenant } from "@/server/customers";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";
import { refreshDashboardJobsAction } from "./actions";
import { DashboardJobRow } from "./DashboardJobRow";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const card = { background: "#fff", border: "1px solid #dfe7f2", borderRadius: 22, boxShadow: "0 12px 34px rgba(15,23,42,.05)" } as const;

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
}

function stageTone(stage: string) {
  if (stage === "invoice_required" || stage.includes("changes_requested")) return { bg: "#fff1f2", fg: "#b42318", border: "#fecdd3" };
  if (stage.includes("artwork") || stage.includes("survey")) return { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe" };
  if (stage.startsWith("quote")) return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  if (stage.includes("ready") || stage === "invoiced") return { bg: "#ecfdf3", fg: "#067647", border: "#abefc6" };
  return { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" };
}


function australiaTodayKey(): string {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isOverdue(job: JobRecord): boolean {
  if (!job.dueDate || job.currentStage === "invoiced" || job.currentStage === "closed") return false;
  return job.dueDate < australiaTodayKey();
}

const stageFilters = [
  ["", "All active"], ["new_enquiry", "New enquiries"], ["survey", "Surveys"], ["quote_required", "Quote required"],
  ["quote_awaiting_approval", "Quote pending"], ["changes", "Changes requested"], ["artwork", "Artwork"], ["production", "Production"],
  ["dispatch", "Pickup / delivery / install"], ["invoice_required", "Invoice required"], ["overdue", "Overdue"],
] as const;

function stageMatches(job: JobRecord, filter: string): boolean {
  if (!filter) return true;
  if (filter === "survey") return job.currentStage.startsWith("survey_");
  if (filter === "changes") return job.currentStage.includes("changes_requested");
  if (filter === "artwork") return job.currentStage.startsWith("artwork_");
  if (filter === "production") return job.currentStage === "production";
  if (filter === "dispatch") return job.currentStage.startsWith("ready_for_");
  if (filter === "overdue") return isOverdue(job);
  return job.currentStage === filter;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const params = (await searchParams) ?? {};
  const stage = readParam(params, "stage");
  const owner = readParam(params, "owner");
  const q = readParam(params, "q").trim().toLowerCase();
  const sort = readParam(params, "sort");
  const direction = readParam(params, "dir") === "desc" ? "desc" : "asc";
  const message = readParam(params, "message");

  const [jobs, tasks, staff, customers] = await Promise.all([
    listJobsForTenant(activeTenant.tenantId, { skipSync: true }),
    listJobTasksForTenant(activeTenant.tenantId),
    listUsersForTenant(activeTenant.tenantId),
    listCustomerLogoSummariesForTenant(activeTenant.tenantId),
  ]);
  const activeStaff = staff.filter((row) => row.membershipStatus === "active");
  const staffById = new Map(activeStaff.map((row) => [row.userProfileId, row]));
  const customerById = new Map(customers.map((row) => [row.id, row]));
  const taskByJob = new Map<string, typeof tasks>();
  for (const task of tasks.filter((row) => row.status !== "completed" && row.status !== "cancelled")) {
    const rows = taskByJob.get(task.jobId) ?? [];
    rows.push(task); taskByJob.set(task.jobId, rows);
  }

  const assignedLabel = (job: JobRecord): string => {
    const openTasks = taskByJob.get(job.id) ?? [];
    const ids = Array.from(new Set([...(job.ownerProfileId ? [job.ownerProfileId] : []), ...openTasks.flatMap((task) => task.assigneeProfileIds)]));
    return ids.length ? ids.map((id) => staffById.get(id)?.shortName || staffById.get(id)?.fullName || "Staff").join(", ") : "Unassigned";
  };
  const sortValue = (job: JobRecord, key: string): string => {
    if (key === "job") return `${job.title} ${job.clientName} ${job.jobNumber}`.toLowerCase();
    if (key === "stage") return job.currentStageLabel.toLowerCase();
    if (key === "next") return (job.nextAction || "").toLowerCase();
    if (key === "due") return job.dueDate || "9999-12-31";
    if (key === "assigned") return assignedLabel(job).toLowerCase();
    if (key === "dispatch") return (job.dispatchType || "").toLowerCase();
    if (key === "myob") return (job.myobOrderNumber || "").toLowerCase();
    return "";
  };
  const filtered = jobs.filter((job) => stageMatches(job, stage)).filter((job) => !owner || job.ownerProfileId === owner || (taskByJob.get(job.id) ?? []).some((task) => task.assigneeProfileIds.includes(owner))).filter((job) => !q || `${job.jobNumber} ${job.title} ${job.clientName} ${job.currentStageLabel} ${job.myobOrderNumber || ""}`.toLowerCase().includes(q));
  if (sort) filtered.sort((a, b) => sortValue(a, sort).localeCompare(sortValue(b, sort), "en-AU", { numeric: true }) * (direction === "desc" ? -1 : 1));
  const sortHref = (key: string): string => {
    const query = new URLSearchParams(Object.fromEntries([["stage", stage], ["owner", owner], ["q", q], ["sort", key], ["dir", sort === key && direction === "asc" ? "desc" : "asc"]].filter(([, value]) => Boolean(value))));
    return `/dashboard?${query.toString()}`;
  };
  const counts = {
    active: jobs.length,
    changes: jobs.filter((job) => job.currentStage.includes("changes_requested")).length,
    overdue: jobs.filter(isOverdue).length,
    invoice: jobs.filter((job) => job.currentStage === "invoice_required").length,
    dueWeek: jobs.filter((job) => {
      if (!job.dueDate) return false;
      const todayKey = australiaTodayKey();
      const start = new Date(`${todayKey}T12:00:00Z`); const end = new Date(start); end.setUTCDate(end.getUTCDate()+7);
      const due = new Date(`${job.dueDate}T12:00:00Z`); return due >= start && due <= end;
    }).length,
  };

  return (
    <div style={{ maxWidth: 1580, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ ...card, padding: 22, background: "linear-gradient(135deg,#fff,#f7fbff)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div><p style={{ margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".08em" }}>Operations dashboard</p><h1 style={{ margin: "5px 0 4px", fontSize: 38, letterSpacing: "-.04em" }}>Every active job</h1><p style={{ margin: 0, color: "#667085", maxWidth: 860 }}>One row follows the job from enquiry through survey, quote, artwork, production, dispatch and invoicing. Click the job — Production Manager takes you to its complete workspace.</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><form action={refreshDashboardJobsAction}><button type="submit" style={{ ...secondary, cursor: "pointer" }}>Refresh stages</button></form><Link href="/calendar" style={primary}>Calendar</Link><Link href="/enquiries" style={secondary}>New enquiry</Link></div>
        </div>
        {message ? <div style={{ marginTop: 12, borderRadius: 12, border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", padding: "9px 12px", fontSize: 12, fontWeight: 850 }}>{message}</div> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(130px,1fr))", gap: 10, marginTop: 18 }}>
          {[[counts.active,"Active jobs"],[counts.changes,"Changes requested"],[counts.overdue,"Overdue"],[counts.dueWeek,"Due next 7 days"],[counts.invoice,"Invoice required"]].map(([value,text]) => <div key={String(text)} style={{ border: "1px solid #e4e7ec", borderRadius: 14, padding: 12, background: "#fff" }}><strong style={{ display: "block", fontSize: 26, color: text === "Invoice required" && Number(value) ? "#b42318" : "#101828" }}>{value}</strong><span style={{ color: "#667085", fontSize: 12, fontWeight: 800 }}>{text}</span></div>)}
        </div>
      </section>

      <section style={{ ...card, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{stageFilters.map(([value,label]) => <Link key={value || "all"} href={`/dashboard?${new URLSearchParams(Object.fromEntries([["stage",value],["owner",owner],["q",q]].filter(([,v])=>Boolean(v)))).toString()}`} style={{ borderRadius: 999, padding: "7px 10px", border: stage === value ? "1px solid #155eef" : "1px solid #d0d5dd", background: stage === value ? "#eff6ff" : "#fff", color: stage === value ? "#155eef" : "#475467", fontSize: 12, fontWeight: 900, textDecoration: "none" }}>{label}</Link>)}</div>
        <form method="get" style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 220px auto", gap: 8 }}>
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          {sort ? <><input type="hidden" name="sort" value={sort} /><input type="hidden" name="dir" value={direction} /></> : null}
          <input name="q" defaultValue={q} placeholder="Search job, client, quote or MYOB order…" style={control} />
          <select name="owner" defaultValue={owner} style={control}><option value="">All staff</option>{activeStaff.map((person) => <option key={person.userProfileId} value={person.userProfileId}>{person.fullName}</option>)}</select>
          <button style={{ ...primary, border: 0, cursor: "pointer" }}>Filter</button>
        </form>
      </section>

      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 1180 }}>
            <colgroup><col style={{ width: "25%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /><col style={{ width: "9%" }} /><col style={{ width: "10%" }} /><col style={{ width: "9%" }} /><col style={{ width: "9%" }} /><col style={{ width: "8%" }} /></colgroup>
            <thead><tr style={{ background: "#f3f6fa", color: "#475467", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{[["Job / client","job"],["Current stage","stage"],["Next action","next"],["Due","due"],["Assigned","assigned"],["Dispatch","dispatch"],["MYOB","myob"],["",""]].map(([head,key], index) => <th key={`${head}-${index}`} style={{ padding: 0, textAlign: "left", borderBottom: "1px solid #d9e1eb", borderRight: index < 7 ? "1px solid #e4e9f0" : undefined }}>{key ? <Link href={sortHref(key)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "10px", color: "inherit", textDecoration: "none", cursor: "pointer" }} title={`Sort by ${head}`}>{head}<span aria-hidden="true" style={{ color: sort === key ? "#155eef" : "#98a2b3", fontSize: 10 }}>{sort === key ? direction === "asc" ? "▲" : "▼" : "↕"}</span></Link> : null}</th>)}</tr></thead>
            <tbody>
              {filtered.map((job) => {
                const colors = stageTone(job.currentStage);
                const overdue = isOverdue(job);
                return <DashboardJobRow key={job.id} href={`/jobs/${job.id}`}>
                  <td style={{ padding: "9px 10px", borderRight: "1px solid #edf1f6" }}><Link href={`/jobs/${job.id}`} style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr)", gap: 9, alignItems: "center", color: "inherit", textDecoration: "none" }}><ClientLogoBadge logoUrl={customerLogoUrl(job.linkedCustomerId ? customerById.get(job.linkedCustomerId) : null)} name={job.clientName} size={36} radius={10} padding={3} /><span style={{ minWidth: 0 }}><strong style={{ display: "block", color: "#101828", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>{job.title}</strong><span style={{ display: "block", marginTop: 2, color: "#667085", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.jobNumber} · {job.clientName}</span></span></Link></td>
                  <td style={{ padding: 10, borderRight: "1px solid #edf1f6" }}><span style={{ borderRadius: 999, background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}`, padding: "5px 8px", fontSize: 10, fontWeight: 950, whiteSpace: "nowrap" }}>{job.currentStageLabel}</span></td>
                  <td style={{ padding: 10, borderRight: "1px solid #edf1f6", color: "#344054", fontWeight: 800, fontSize: 13 }}>{job.nextAction}</td>
                  <td style={{ padding: 10, borderRight: "1px solid #edf1f6", fontSize: 12 }}><span style={{ color: overdue ? "#b42318" : "#344054", fontWeight: overdue ? 950 : 800 }}>{fmtDate(job.dueDate)}</span>{overdue ? <span style={{ display: "block", color: "#b42318", fontSize: 9, fontWeight: 950 }}>OVERDUE</span> : null}</td>
                  <td style={{ padding: 10, borderRight: "1px solid #edf1f6", color: "#475467", fontSize: 11 }}>{assignedLabel(job)}</td>
                  <td style={{ padding: 10, borderRight: "1px solid #edf1f6", color: "#475467", fontSize: 12, textTransform: "capitalize" }}>{job.dispatchType?.replaceAll("_"," ") || "—"}</td>
                  <td style={{ padding: 10, borderRight: "1px solid #edf1f6", color: job.myobOrderNumber ? "#067647" : "#667085", fontSize: 12, fontWeight: 800 }}>{job.myobOrderNumber || "—"}</td>
                  <td style={{ padding: 10, textAlign: "center" }}><Link href={`/jobs/${job.id}`} style={{ color: "#155eef", fontSize: 12, fontWeight: 950, textDecoration: "none" }}>Open →</Link></td>
                </DashboardJobRow>;
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <div style={{ padding: 28, textAlign: "center", color: "#667085" }}>No jobs match these filters.</div> : null}
      </section>
    </div>
  );
}

const primary = { minHeight: 42, borderRadius: 12, background: "#0f172a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", fontWeight: 950, textDecoration: "none" } as const;
const secondary = { ...primary, background: "#fff", color: "#344054", border: "1px solid #d0d5dd" } as const;
const control = { width: "100%", minHeight: 42, borderRadius: 12, border: "1px solid #cbd5e1", padding: "0 11px", background: "#fff", boxSizing: "border-box" as const };
