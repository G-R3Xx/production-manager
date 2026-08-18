import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listJobsForTenant, listJobTasksForTenant, type JobRecord } from "@/server/jobs";
import { listUsersForTenant } from "@/server/users";
import { customerLogoUrl, listCustomerLogoSummariesForTenant } from "@/server/customers";
import { refreshDashboardJobsAction } from "./actions";
import { DashboardJobsTable, type DashboardRow } from "./DashboardJobsTable";

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
  const q = readParam(params, "q").trim();
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
  const dashboardRows: DashboardRow[] = jobs.map((job) => ({
    id: job.id,
    jobNumber: job.jobNumber,
    title: job.title,
    clientName: job.clientName,
    currentStage: job.currentStage,
    currentStageLabel: job.currentStageLabel,
    nextAction: job.nextAction,
    receivedAt: job.receivedAt,
    dueDate: job.dueDate,
    ownerProfileId: job.ownerProfileId,
    assigneeProfileIds: Array.from(new Set((taskByJob.get(job.id) ?? []).flatMap((task) => task.assigneeProfileIds))),
    assigneeLabel: assignedLabel(job),
    dispatchType: job.dispatchType,
    myobOrderNumber: job.myobOrderNumber,
    logoUrl: customerLogoUrl(job.linkedCustomerId ? customerById.get(job.linkedCustomerId) : null),
  }));
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

      <DashboardJobsTable
        rows={dashboardRows}
        staff={activeStaff.map((person) => ({ id: person.userProfileId, name: person.fullName }))}
        todayKey={australiaTodayKey()}
        initialStage={stage}
        initialOwner={owner}
        initialQuery={q}
      />
    </div>
  );
}

const primary = { minHeight: 42, borderRadius: 12, background: "#0f172a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", fontWeight: 950, textDecoration: "none" } as const;
const secondary = { ...primary, background: "#fff", color: "#344054", border: "1px solid #d0d5dd" } as const;
const control = { width: "100%", minHeight: 42, borderRadius: 12, border: "1px solid #cbd5e1", padding: "0 11px", background: "#fff", boxSizing: "border-box" as const };
