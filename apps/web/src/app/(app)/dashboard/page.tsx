import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { loadDashboardSnapshotForTenant } from "@/server/dashboard";
import { refreshDashboardJobsAction } from "./actions";
import { DashboardJobsTable, type DashboardRow } from "./DashboardJobsTable";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const card = { background: "#fff", border: "1px solid #dfe7f2", borderRadius: 22, boxShadow: "0 12px 34px rgba(15,23,42,.05)" } as const;

export const preferredRegion = "syd1";

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function australiaTodayKey(): string {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isOverdue(job: Pick<DashboardRow, "dueDate" | "currentStage">, todayKey: string): boolean {
  if (!job.dueDate || job.currentStage === "invoiced" || job.currentStage === "closed") return false;
  return job.dueDate < todayKey;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const startedAt = performance.now();
  const user = await getRequiredSessionUser();
  const authMs = performance.now() - startedAt;
  const tenantStartedAt = performance.now();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  const tenantMs = performance.now() - tenantStartedAt;
  if (!activeTenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const stage = readParam(params, "stage");
  const owner = readParam(params, "owner");
  const q = readParam(params, "q").trim();
  const message = readParam(params, "message");

  const snapshotStartedAt = performance.now();
  const snapshot = await loadDashboardSnapshotForTenant(activeTenant.tenantId);
  const snapshotMs = performance.now() - snapshotStartedAt;
  const staffById = new Map(snapshot.staff.map((person) => [person.id, person.name]));
  const dashboardRows: DashboardRow[] = snapshot.rows.map((job) => {
    const assigneeProfileIds = job.assigneeProfileIds.length
      ? job.assigneeProfileIds
      : job.ownerProfileId ? [job.ownerProfileId] : [];
    return {
      id: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      clientName: job.clientName,
      currentStage: job.currentStage,
      currentStageLabel: job.currentStageLabel,
      nextAction: job.nextAction,
      receivedAt: job.receivedAt,
      dueDate: job.assignmentDueDate || job.dueDate,
      ownerProfileId: job.ownerProfileId,
      assigneeProfileIds,
      assigneeLabel: assigneeProfileIds.length
        ? assigneeProfileIds.map((id) => staffById.get(id) || "Staff").join(", ")
        : "Unassigned",
      dispatchType: job.dispatchType,
      myobOrderNumber: job.myobOrderNumber,
      jobType: job.jobType,
      logoUrl: job.logoUrl,
    };
  });

  const todayKey = australiaTodayKey();
  const todayAtMiddayUtc = new Date(`${todayKey}T12:00:00Z`);
  const weekEnd = new Date(todayAtMiddayUtc);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const counts = {
    active: dashboardRows.length,
    changes: dashboardRows.filter((job) => job.currentStage.includes("changes_requested")).length,
    overdue: dashboardRows.filter((job) => isOverdue(job, todayKey)).length,
    invoice: dashboardRows.filter((job) => job.currentStage === "invoice_required").length,
    dueWeek: dashboardRows.filter((job) => {
      if (!job.dueDate) return false;
      const due = new Date(`${job.dueDate}T12:00:00Z`);
      return due >= todayAtMiddayUtc && due <= weekEnd;
    }).length,
  };

  console.info("[dashboard-page]", {
    tenantId: activeTenant.tenantId,
    rowCount: dashboardRows.length,
    authMs: Math.round(authMs),
    tenantMs: Math.round(tenantMs),
    snapshotMs: Math.round(snapshotMs),
    totalMs: Math.round(performance.now() - startedAt),
    vercelRegion: process.env.VERCEL_REGION ?? null,
  });

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
        staff={snapshot.staff}
        todayKey={todayKey}
        initialStage={stage}
        initialOwner={owner}
        initialQuery={q}
      />
    </div>
  );
}

const primary = { minHeight: 42, borderRadius: 12, background: "#0f172a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", fontWeight: 950, textDecoration: "none" } as const;
const secondary = { ...primary, background: "#fff", color: "#344054", border: "1px solid #d0d5dd" } as const;
