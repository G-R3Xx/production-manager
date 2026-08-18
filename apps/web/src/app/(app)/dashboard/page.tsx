import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { synchroniseJobsFromCurrentWorkflow, listJobTasksForTenant, type JobRecord } from "@/server/jobs";
import { listUsersForTenant } from "@/server/users";
import { customerLogoUrl, listCustomerLogoSummariesForTenant } from "@/server/customers";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";

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

  const jobs = await synchroniseJobsFromCurrentWorkflow(activeTenant.tenantId);
  const [tasks, staff, customers] = await Promise.all([
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

  const filtered = jobs.filter((job) => stageMatches(job, stage)).filter((job) => !owner || job.ownerProfileId === owner || (taskByJob.get(job.id) ?? []).some((task) => task.assigneeProfileIds.includes(owner))).filter((job) => !q || `${job.jobNumber} ${job.title} ${job.clientName} ${job.currentStageLabel} ${job.myobOrderNumber || ""}`.toLowerCase().includes(q));
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
          <div style={{ display: "flex", gap: 8 }}><Link href="/calendar" style={primary}>Calendar</Link><Link href="/enquiries" style={secondary}>New enquiry</Link></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(130px,1fr))", gap: 10, marginTop: 18 }}>
          {[[counts.active,"Active jobs"],[counts.changes,"Changes requested"],[counts.overdue,"Overdue"],[counts.dueWeek,"Due next 7 days"],[counts.invoice,"Invoice required"]].map(([value,text]) => <div key={String(text)} style={{ border: "1px solid #e4e7ec", borderRadius: 14, padding: 12, background: "#fff" }}><strong style={{ display: "block", fontSize: 26, color: text === "Invoice required" && Number(value) ? "#b42318" : "#101828" }}>{value}</strong><span style={{ color: "#667085", fontSize: 12, fontWeight: 800 }}>{text}</span></div>)}
        </div>
      </section>

      <section style={{ ...card, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{stageFilters.map(([value,label]) => <Link key={value || "all"} href={`/dashboard?${new URLSearchParams(Object.fromEntries([["stage",value],["owner",owner],["q",q]].filter(([,v])=>Boolean(v)))).toString()}`} style={{ borderRadius: 999, padding: "7px 10px", border: stage === value ? "1px solid #155eef" : "1px solid #d0d5dd", background: stage === value ? "#eff6ff" : "#fff", color: stage === value ? "#155eef" : "#475467", fontSize: 12, fontWeight: 900, textDecoration: "none" }}>{label}</Link>)}</div>
        <form method="get" style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 220px auto", gap: 8 }}>
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          <input name="q" defaultValue={q} placeholder="Search job, client, quote or MYOB order…" style={control} />
          <select name="owner" defaultValue={owner} style={control}><option value="">All staff</option>{activeStaff.map((person) => <option key={person.userProfileId} value={person.userProfileId}>{person.fullName}</option>)}</select>
          <button style={{ ...primary, border: 0, cursor: "pointer" }}>Filter</button>
        </form>
      </section>

      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
            <thead><tr style={{ background: "#f8fafc", color: "#475467", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{["Job / client","Current stage","Next action","Due","Assigned","Dispatch","MYOB",""].map((head) => <th key={head} style={{ padding: "11px 12px", textAlign: "left", borderBottom: "1px solid #e4e7ec" }}>{head}</th>)}</tr></thead>
            <tbody>
              {filtered.map((job) => {
                const colors = stageTone(job.currentStage);
                const openTasks = taskByJob.get(job.id) ?? [];
                const assigneeIds = Array.from(new Set([...(job.ownerProfileId ? [job.ownerProfileId] : []), ...openTasks.flatMap((task) => task.assigneeProfileIds)]));
                const overdue = isOverdue(job);
                return <tr key={job.id} style={{ borderBottom: "1px solid #eef2f6" }}>
                  <td style={{ padding: 12, minWidth: 280 }}><Link href={`/jobs/${job.id}`} style={{ display: "grid", gridTemplateColumns: "42px 1fr", gap: 10, alignItems: "center", color: "inherit", textDecoration: "none" }}><ClientLogoBadge logoUrl={customerLogoUrl(job.linkedCustomerId ? customerById.get(job.linkedCustomerId) : null)} name={job.clientName} size={42} radius={13} padding={3} /><span style={{ minWidth: 0 }}><strong style={{ display: "block", color: "#101828", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</strong><span style={{ display: "block", marginTop: 2, color: "#667085", fontSize: 12 }}>{job.jobNumber} · {job.clientName}</span></span></Link></td>
                  <td style={{ padding: 12 }}><span style={{ borderRadius: 999, background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}`, padding: "6px 9px", fontSize: 11, fontWeight: 950, whiteSpace: "nowrap" }}>{job.currentStageLabel}</span></td>
                  <td style={{ padding: 12, color: "#344054", fontWeight: 800, maxWidth: 240 }}>{job.nextAction}</td>
                  <td style={{ padding: 12 }}><span style={{ color: overdue ? "#b42318" : "#344054", fontWeight: overdue ? 950 : 800 }}>{fmtDate(job.dueDate)}</span>{overdue ? <span style={{ display: "block", color: "#b42318", fontSize: 10, fontWeight: 950 }}>OVERDUE</span> : null}</td>
                  <td style={{ padding: 12, color: "#475467", fontSize: 12 }}>{assigneeIds.length ? assigneeIds.map((id) => staffById.get(id)?.shortName || staffById.get(id)?.fullName || "Staff").join(", ") : "Unassigned"}</td>
                  <td style={{ padding: 12, color: "#475467", textTransform: "capitalize" }}>{job.dispatchType?.replaceAll("_"," ") || "—"}</td>
                  <td style={{ padding: 12, color: job.myobOrderNumber ? "#067647" : "#667085", fontWeight: 800 }}>{job.myobOrderNumber || "—"}</td>
                  <td style={{ padding: 12 }}><Link href={`/jobs/${job.id}`} style={{ color: "#155eef", fontWeight: 950, textDecoration: "none" }}>Open →</Link></td>
                </tr>;
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
