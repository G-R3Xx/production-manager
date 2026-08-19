import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { updateJobProcessAssignmentForTenant } from "@/server/jobs";
import { syncProductionStepAssignmentsFromJobProcessForTenant } from "@/server/production";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; processKey: string }> }) {
  const user = await getAuthenticatedAppUser();
  if (!user) return NextResponse.json({ error: "Sign in again before assigning staff." }, { status: 401 });
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return NextResponse.json({ error: "Active workspace not found." }, { status: 401 });
  const { id, processKey } = await context.params;
  let body: { assigneeProfileIds?: unknown; dueDate?: unknown; notes?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid assignment request." }, { status: 400 });
  }

  const assigneeProfileIds = Array.isArray(body.assigneeProfileIds)
    ? body.assigneeProfileIds.filter((value): value is string => typeof value === "string")
    : [];
  const dueDate = typeof body.dueDate === "string" ? body.dueDate : null;
  const notes = typeof body.notes === "string" ? body.notes : null;

  try {
    const assignment = await updateJobProcessAssignmentForTenant(tenant.tenantId, {
      jobId: id,
      processKey,
      assigneeProfileIds,
      dueDate,
      notes,
    });
    if (processKey === "production" || processKey === "dispatch") {
      await syncProductionStepAssignmentsFromJobProcessForTenant(tenant.tenantId, id);
    }
    return NextResponse.json({ ok: true, assignment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Process assignment could not be saved.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
