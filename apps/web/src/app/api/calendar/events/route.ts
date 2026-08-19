import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { JOB_PROCESS_KEYS, updateJobProcessAssignmentForTenant, updateJobTaskScheduleForTenant } from "@/server/jobs";
import { syncProductionStepAssignmentsFromJobProcessForTenant } from "@/server/production";

export const dynamic = "force-dynamic";

function validDate(value: unknown): string | null {
  if (value === null || value === "") return null;
  const date = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid calendar date.");
  return date;
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedAppUser();
  if (!user) return NextResponse.json({ error: "Sign in again before changing the calendar." }, { status: 401 });
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return NextResponse.json({ error: "Active workspace not found." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid calendar update." }, { status: 400 });
  }

  const kind = body.kind === "process" || body.kind === "task" ? body.kind : null;
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const assigneeProfileIds = Array.isArray(body.assigneeProfileIds)
    ? body.assigneeProfileIds.filter((value): value is string => typeof value === "string")
    : [];

  try {
    const dueDate = validDate(body.dueDate);
    if (!kind || !jobId) throw new Error("Calendar item could not be identified.");

    if (kind === "process") {
      const processKey = typeof body.processKey === "string" ? body.processKey : "";
      if (!(JOB_PROCESS_KEYS as readonly string[]).includes(processKey)) throw new Error("Choose a valid job process.");
      const assignment = await updateJobProcessAssignmentForTenant(tenant.tenantId, {
        jobId,
        processKey,
        assigneeProfileIds,
        dueDate,
        notes: typeof body.notes === "string" ? body.notes : null,
      });
      if (processKey === "production" || processKey === "dispatch") {
        await syncProductionStepAssignmentsFromJobProcessForTenant(tenant.tenantId, jobId);
      }
      return NextResponse.json({ ok: true, dueDate: assignment.dueDate, assigneeProfileIds: assignment.assigneeProfileIds }, { headers: { "Cache-Control": "no-store" } });
    }

    const taskId = typeof body.taskId === "string" ? body.taskId : "";
    if (!taskId) throw new Error("Calendar task could not be identified.");
    const task = await updateJobTaskScheduleForTenant(tenant.tenantId, { taskId, dueDate, assigneeProfileIds });
    return NextResponse.json({ ok: true, dueDate: task.dueDate, assigneeProfileIds: task.assigneeProfileIds }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calendar item could not be saved.";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}
