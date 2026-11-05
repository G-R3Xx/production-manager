"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  createProjectPlanForProductionJob,
  addProjectTask, updateProjectTask, deleteProjectTask, scheduleExistingProductionStep, rescheduleProjectTask, assignProjectTaskForTenant
} from "@/server/project-timelines";
import type { ProjectTaskStatus } from "@/lib/project-timeline";

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}
function optional(form: FormData, key: string): string | null {
  return value(form, key) || null;
}
async function requireProjectManager(): Promise<string> {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  if (!(["owner", "manager"].includes(tenant.tenantRole) && tenant.membershipStatus === "active")) {
    throw new Error("Only workspace owners and managers can edit project timelines.");
  }
  return tenant.tenantId;
}
function taskInput(form: FormData) {
  return {
    title: value(form, "title"),
    subJobId: optional(form, "subJobId"),
    plannedStart: value(form, "plannedStart"),
    plannedEnd: value(form, "plannedEnd"),
    allocatedHours: value(form, "allocatedHours"),
    assigneeProfileId: optional(form, "assigneeProfileId"),
    status: (value(form, "status") || "planned") as ProjectTaskStatus,
    notes: optional(form, "notes")
  };
}
function projectRedirect(projectId: string, message: string, error = false): never {
  redirect(`/projects/${encodeURIComponent(projectId)}?${error ? "error" : "message"}=${encodeURIComponent(message)}`);
}
function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : "Unable to save task";
  if (/invalid input syntax for type uuid/i.test(message)) return "Invalid project, section or staff selection.";
  if (/relation .* does not exist/i.test(message)) return "Run SQL migration 065_project_timelines.sql before using Projects.";
  if (/^(Choose a valid|Finish must be|Allocated work hours|Task title must be|Invalid task status|Notes cannot exceed)/.test(message)) return message;
  return "Project task could not be saved. Check the details or ask a manager to review the setup.";
}

export async function createProjectPlanAction(form: FormData): Promise<void> {
  const tenantId = await requireProjectManager();
  const productionJobId = value(form, "productionJobId");
  if (!productionJobId) redirect("/projects?error=Choose%20a%20Production%20Job");
  let projectId: string | null = null;
  try {
    projectId = await createProjectPlanForProductionJob(tenantId, productionJobId);
  } catch (error) {
    console.error("Project creation failed", error);
    redirect(`/projects?error=${encodeURIComponent(errorText(error))}`);
  }
  if (!projectId) redirect("/projects?error=Production%20Job%20not%20found%20in%20this%20workspace");
  revalidatePath("/projects");
  projectRedirect(projectId, "Project timeline created");
}

export async function addProjectTaskAction(form: FormData): Promise<void> {
  const tenantId = await requireProjectManager();
  const projectId = value(form, "projectId");
  if (!projectId) redirect("/projects?error=Project%20is%20required");
  let saved = false;
  try { saved = await addProjectTask(tenantId, projectId, taskInput(form)); }
  catch (error) { projectRedirect(projectId, errorText(error), true); }
  if (!saved) projectRedirect(projectId, "Project, Sub Job or assigned staff not found in this workspace", true);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  projectRedirect(projectId, "Task added");
}

export async function updateProjectTaskAction(form: FormData): Promise<void> {
  const tenantId = await requireProjectManager();
  const projectId = value(form, "projectId");
  const taskId = value(form, "taskId");
  if (!projectId || !taskId) redirect("/projects?error=Project%20or%20task%20is%20required");
  let saved = false;
  try { saved = await updateProjectTask(tenantId, projectId, taskId, taskInput(form)); }
  catch (error) { projectRedirect(projectId, errorText(error), true); }
  if (!saved) projectRedirect(projectId, "Task or Sub Job not found in this workspace", true);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  projectRedirect(projectId, "Task updated");
}

export async function removeProjectTaskAction(form: FormData): Promise<void> {
  const tenantId = await requireProjectManager();
  const projectId = value(form, "projectId");
  const taskId = value(form, "taskId");
  if (!projectId || !taskId) redirect("/projects?error=Project%20or%20task%20is%20required");
  let removed = false;
  try { removed = await deleteProjectTask(tenantId, projectId, taskId); }
  catch (error) { projectRedirect(projectId, errorText(error), true); }
  if (!removed) projectRedirect(projectId, "Task not found in this workspace", true);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  projectRedirect(projectId, "Timeline task removed (production checklist remains intact)");
}

export async function scheduleProductionStepAction(form: FormData): Promise<void> {
  const tenantId = await requireProjectManager();
  const projectId = value(form, "projectId");
  const stepId = value(form, "productionStepId");
  if (!projectId || !stepId) redirect("/projects?error=Project%20or%20step%20is%20required");
  let added = false;
  try {
    added = await scheduleExistingProductionStep(tenantId, projectId, stepId, {
      plannedStart: value(form, "plannedStart"), plannedEnd: value(form, "plannedEnd"), allocatedHours: value(form, "allocatedHours")
    });
  } catch (error) { projectRedirect(projectId, errorText(error), true); }
  if (!added) projectRedirect(projectId, "Production step already scheduled or not found in this workspace", true);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  projectRedirect(projectId, "Production step added to timeline");
}

/** Called directly from the Gantt chart; no redirect or full task-form submission. */
export async function rescheduleProjectTaskAction(input: {
  projectId: string;
  taskId: string;
  plannedStart: string;
  plannedEnd: string;
  expectedStart: string;
  expectedEnd: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenantId = await requireProjectManager();
  if (!input.projectId || !input.taskId) return { ok: false, error: "Project or task is missing." };
  try {
    const updated = await rescheduleProjectTask(tenantId, input.projectId, input.taskId, input);
    if (!updated) return {
      ok: false,
      error: "This task was changed elsewhere or is no longer available. Refresh and try again."
    };
    // These pages are force-dynamic. The chart refreshes once after success;
    // invalidating the route here as well would trigger redundant re-render work.
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}

/** Quick assignment from a Gantt row. Server-enforced manager access. */
export async function assignProjectTaskAction(input: {
  projectId: string; taskId: string; assigneeProfileId: string | null; expectedAssigneeProfileId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenantId = await requireProjectManager();
  if (!input.projectId || !input.taskId) return { ok: false, error: "Project or task is missing." };
  try {
    const updated = await assignProjectTaskForTenant(tenantId, input.projectId, input.taskId,
      input.assigneeProfileId, input.expectedAssigneeProfileId);
    if (!updated) return { ok: false, error: "Assignment changed elsewhere, or the selected staff member is not active in this workspace. Refresh and try again." };
    return { ok: true };
  } catch (error) { return { ok: false, error: errorText(error) }; }
}
