import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  getProductionInstallSchedulerPayloadForStep,
  recordProductionInstallSchedulerBridgeResultForStep,
  setProductionStepStatusForTenant,
  updateProductionStepAssignmentForTenant,
} from "@/server/production";
import { createInstallSchedulerInstallJob } from "@/server/installSchedulerBridge";

export const dynamic = "force-dynamic";

async function completeInstallHandoff(tenantId: string, stepId: string): Promise<string | null> {
  const bridge = await getProductionInstallSchedulerPayloadForStep(tenantId, stepId);
  if (!bridge) return null;
  if (bridge.alreadyCreatedJobId) return "Install Scheduler job already exists";
  const response = await createInstallSchedulerInstallJob(bridge.payload);
  if (response.ok) {
    await recordProductionInstallSchedulerBridgeResultForStep(tenantId, stepId, {
      status: "created", jobId: response.jobId ?? null, jobUrl: response.jobUrl ?? null, error: null
    });
    return "Install Scheduler install job created";
  }
  await recordProductionInstallSchedulerBridgeResultForStep(tenantId, stepId, {
    status: response.skipped ? "not_configured" : "error",
    error: response.error ?? "Install Scheduler job could not be created"
  });
  return response.skipped ? "Install Scheduler bridge not configured" : "Install Scheduler job could not be created";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedAppUser();
  if (!user) return NextResponse.json({ error: "Sign in again before updating production" }, { status: 401 });
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return NextResponse.json({ error: "Active workspace not found" }, { status: 401 });
  const { id } = await context.params;
  let body: { status?: unknown } = {};
  try { body = await request.json(); } catch { /* handled below */ }
  const status = body.status === "done" ? "done" : body.status === "pending" ? "pending" : null;
  if (!id || !status) return NextResponse.json({ error: "A valid production step and status are required" }, { status: 400 });
  const result = await setProductionStepStatusForTenant(tenant.tenantId, id, status, user.email ?? null);
  if (!result.jobId) return NextResponse.json({ error: "Production step not found" }, { status: 404 });
  const bridgeMessage = status === "done" && result.isInstallHandoff
    ? await completeInstallHandoff(tenant.tenantId, id)
    : null;
  return NextResponse.json({ ok: true, status, ...result, bridgeMessage });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedAppUser();
  if (!user) return NextResponse.json({ error: "Sign in again before assigning production work." }, { status: 401 });
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return NextResponse.json({ error: "Active workspace not found." }, { status: 401 });
  const { id } = await context.params;
  let body: { assigneeProfileIds?: unknown; dueDate?: unknown; inherit?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid production assignment request." }, { status: 400 });
  }
  const assigneeProfileIds = Array.isArray(body.assigneeProfileIds)
    ? body.assigneeProfileIds.filter((value): value is string => typeof value === "string")
    : [];
  try {
    const step = await updateProductionStepAssignmentForTenant(tenant.tenantId, {
      stepId: id,
      assigneeProfileIds,
      dueDate: typeof body.dueDate === "string" ? body.dueDate : null,
      inherit: body.inherit === true,
    });
    if (!step) return NextResponse.json({ error: "Production step not found." }, { status: 404 });
    return NextResponse.json({ ok: true, step }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Production assignment could not be saved." }, { status: 400 });
  }
}
