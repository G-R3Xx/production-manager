import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listUsersForTenant } from "@/server/users";
import {
  JOB_PROCESS_KEYS,
  JOB_PROCESS_META,
  jobProcessKeyForStage,
  listDashboardJobMetadataForTenant,
  listJobProcessAssignmentsForTenant,
  listJobsForTenant,
  listJobTasksForTenant,
  type JobProcessKey,
} from "@/server/jobs";
import { OperationsCalendar, type CalendarEvent, type CalendarView } from "./OperationsCalendar";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function australiaTodayKey(): string {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function validDate(value: string, fallback: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return fallback;
}

function validView(value: string): CalendarView {
  return value === "month" || value === "agenda" ? value : "week";
}

function processPosition(processKey: string | null): number {
  return processKey ? (JOB_PROCESS_KEYS as readonly string[]).indexOf(processKey) : -1;
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const params = (await searchParams) ?? {};
  const todayKey = australiaTodayKey();
  const initialDate = validDate(readParam(params, "date") || readParam(params, "month"), todayKey);

  const [jobs, tasks, processAssignments, users, metadata] = await Promise.all([
    listJobsForTenant(activeTenant.tenantId, { skipSync: true }),
    listJobTasksForTenant(activeTenant.tenantId),
    listJobProcessAssignmentsForTenant(activeTenant.tenantId),
    listUsersForTenant(activeTenant.tenantId),
    listDashboardJobMetadataForTenant(activeTenant.tenantId),
  ]);

  const activeStaff = users.filter((person) => person.membershipStatus === "active");
  const metadataByJob = new Map(metadata.map((item) => [item.jobId, item]));
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const assignmentByJobProcess = new Map(processAssignments.map((assignment) => [`${assignment.jobId}:${assignment.processKey}`, assignment]));
  const events: CalendarEvent[] = [];

  for (const job of jobs) {
    const currentProcess = jobProcessKeyForStage(job.currentStage);
    const assignedProcessKeys = processAssignments.filter((assignment) => assignment.jobId === job.id).map((assignment) => assignment.processKey);
    const processKeys = new Set<JobProcessKey>(assignedProcessKeys);
    if (currentProcess) processKeys.add(currentProcess);
    const currentPosition = processPosition(currentProcess);

    for (const processKey of processKeys) {
      const assignment = assignmentByJobProcess.get(`${job.id}:${processKey}`);
      const passed = (currentPosition >= 0 && processPosition(processKey) < currentPosition)
        || (job.currentStage === "invoiced" && processKey === "invoicing");
      events.push({
        id: `process:${job.id}:${processKey}`,
        kind: "process",
        taskId: null,
        jobId: job.id,
        jobNumber: job.jobNumber,
        jobTitle: job.title,
        clientName: job.clientName,
        jobType: metadataByJob.get(job.id)?.jobType ?? "other",
        processKey,
        title: `${JOB_PROCESS_META[processKey].label} process`,
        status: passed ? "completed" : "pending",
        priority: job.priority,
        dueDate: assignment?.dueDate ?? (processKey === currentProcess ? job.dueDate : null),
        assigneeProfileIds: assignment?.assigneeProfileIds ?? (processKey === currentProcess && job.ownerProfileId ? [job.ownerProfileId] : []),
        notes: assignment?.notes ?? null,
        currentStage: job.currentStage,
      });
    }
  }

  for (const task of tasks.filter((item) => !item.isSystem)) {
    const job = jobById.get(task.jobId);
    if (!job) continue;
    events.push({
      id: `task:${task.id}`,
      kind: "task",
      taskId: task.id,
      jobId: job.id,
      jobNumber: job.jobNumber,
      jobTitle: job.title,
      clientName: job.clientName,
      jobType: metadataByJob.get(job.id)?.jobType ?? "other",
      processKey: task.processKey,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      assigneeProfileIds: task.assigneeProfileIds,
      notes: task.notes,
      currentStage: job.currentStage,
    });
  }

  return (
    <div style={{ maxWidth: 1700, margin: "0 auto" }}>
      <OperationsCalendar
        initialEvents={events}
        staff={activeStaff.map((person) => ({ id: person.userProfileId, name: person.fullName, shortName: person.shortName || person.fullName }))}
        todayKey={todayKey}
        initialDate={initialDate}
        initialView={validView(readParam(params, "view"))}
        initialStaff={readParam(params, "staff")}
        initialProcess={readParam(params, "process")}
        initialJobType={readParam(params, "type")}
        initialQuery={readParam(params, "q")}
      />
    </div>
  );
}
