"use server";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  createProjectPlanForProductionJob, createManualProjectPlan, updateManualProjectPlan,
  addManualProjectSection, renameManualProjectSection, removeManualProjectSection,
  addProjectTask, updateProjectTask, getProjectTaskForTenant, getProjectRevision, deleteProjectTask, scheduleExistingProductionStep, rescheduleProjectTask, assignProjectTaskForTenant, reorderProjectTasksForTenant
} from "@/server/project-timelines";
import type { ProjectTaskStatus } from "@/lib/project-timeline";
import type { ProjectTimelineTaskRecord } from "@/server/project-timelines";

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
function projectRedirect(projectId: string, message: string, error = false, manageSubJobs = false): never {
  const query = new URLSearchParams({ [error ? "error" : "message"]: message });
  if (manageSubJobs) query.set("manageSubJobs", "1");
  redirect(`/projects/${encodeURIComponent(projectId)}?${query.toString()}`);
}
function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : "Unable to save task";
  if (/invalid input syntax for type uuid/i.test(message)) return "Invalid project, section or staff selection.";
  if (/relation .* does not exist|column .* does not exist/i.test(message)) return "Check that SQL migrations 065 and 066 have been applied.";
  if (/^(Project name|Client\/reference|Sub Job name|Invalid target completion date)/.test(message)) return message;
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

/** Fast edit/create for the Gantt task forms. Unlike the legacy redirecting actions,
 * this returns the saved row without revalidating or rebuilding the entire Projects page.
 * The client updates the Gantt immediately and refreshes the other server-rendered lists
 * in the background. All permission and tenant validations remain server-side. */
export async function saveProjectTaskInlineAction(form: FormData): Promise<
  { ok: true; task: ProjectTimelineTaskRecord; revision: string; timings: { authMs: number; writeMs: number; readMs: number; totalMs: number } }
  | { ok: false; error: string }
> {
  const started = performance.now();
  const projectId = value(form, "projectId");
  const editTaskId = value(form, "taskId");
  if (!projectId) return { ok: false, error: "Project is required." };
  try {
    const tenantId = await requireProjectManager();
    const authenticated = performance.now();
    const taskId = editTaskId || randomUUID();
    const input = taskInput(form);
    const saved = editTaskId
      ? await updateProjectTask(tenantId, projectId, taskId, input)
      : await addProjectTask(tenantId, projectId, input, taskId);
    const written = performance.now();
    if (!saved) return { ok: false, error: "Task, Sub Job or assigned staff not found in this workspace." };
    const [task, revision] = await Promise.all([
      getProjectTaskForTenant(tenantId, projectId, taskId),
      getProjectRevision(tenantId, projectId)
    ]);
    const read = performance.now();
    if (!task || !revision) return { ok: false, error: "Task was saved, but its details could not be loaded. Refresh the project." };
    const timings = {
      authMs: Math.round(authenticated - started),
      writeMs: Math.round(written - authenticated),
      readMs: Math.round(read - written),
      totalMs: Math.round(read - started)
    };
    console.info("[pm:project-task-save]", { mode: editTaskId ? "edit" : "create", ...timings });
    return { ok: true, task, revision, timings };
  } catch (error) {
    console.warn("[pm:project-task-save] failed", { mode: editTaskId ? "edit" : "create", elapsedMs: Math.round(performance.now() - started), error });
    return { ok: false, error: errorText(error) };
  }
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

/** Quick assignment from a Gantt row. Return the confirmed DB task, just like
 * inline task saves: an older in-page task snapshot must never overwrite the new
 * assignee after a full router refresh. Manager / tenant / active-staff checks are
 * still enforced by assignProjectTaskForTenant. */
export async function assignProjectTaskAction(input: {
  projectId: string; taskId: string; assigneeProfileId: string | null; expectedAssigneeProfileId: string | null;
}): Promise<{ ok: true; task: ProjectTimelineTaskRecord; revision: string } | { ok: false; error: string }> {
  const tenantId = await requireProjectManager();
  if (!input.projectId || !input.taskId) return { ok: false, error: "Project or task is missing." };
  try {
    const updated = await assignProjectTaskForTenant(tenantId, input.projectId, input.taskId,
      input.assigneeProfileId, input.expectedAssigneeProfileId);
    if (!updated) return { ok: false, error: "Assignment changed elsewhere, or the selected staff member is not active in this workspace. Refresh and try again." };
    const [task, revision] = await Promise.all([
      getProjectTaskForTenant(tenantId, input.projectId, input.taskId),
      getProjectRevision(tenantId, input.projectId)
    ]);
    if (!task || !revision) return { ok: false, error: "Assignment saved, but its details could not be loaded. Refresh the project." };
    return { ok: true, task, revision };
  } catch (error) { return { ok: false, error: errorText(error) }; }
}


/** Reorder task rows only; does not shift Gantt dates or change task ownership. */
export async function reorderProjectTasksAction(input: {
  projectId: string; subJobId: string | null;
  orderedTaskIds: string[]; expectedTaskIds: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenantId = await requireProjectManager();
  if (!input.projectId || !Array.isArray(input.orderedTaskIds) || !Array.isArray(input.expectedTaskIds)) {
    return { ok: false, error: "Invalid project task order." };
  }
  try {
    const saved = await reorderProjectTasksForTenant(tenantId, input.projectId, input.subJobId,
      input.orderedTaskIds, input.expectedTaskIds);
    if (!saved) return { ok: false, error: "Tasks were changed elsewhere, or this section is no longer available. Refresh and try again." };
    return { ok: true };
  } catch (error) { return { ok: false, error: errorText(error) }; }
}

/** Standalone timelines use their own metadata and sections; no quote/job link. */
export async function createManualProjectPlanAction(form: FormData): Promise<void> {
  const tenantId = await requireProjectManager();
  let id: string;
  try {
    id = await createManualProjectPlan(tenantId, value(form, "title"), value(form, "clientName"));
  } catch (error) {
    redirect(`/projects?error=${encodeURIComponent(errorText(error))}`);
  }
  revalidatePath("/projects");
  projectRedirect(id, "Manual project created — add Sub Jobs and tasks below");
}

export async function updateManualProjectPlanAction(form: FormData): Promise<void> {
  const tenantId = await requireProjectManager();
  const projectId = value(form, "projectId");
  let saved = false;
  try {
    saved = await updateManualProjectPlan(tenantId, projectId, value(form, "title"),
      value(form, "clientName"), optional(form, "dueDate"));
  } catch (error) { projectRedirect(projectId, errorText(error), true); }
  if (!saved) projectRedirect(projectId, "Manual project not found in this workspace", true);
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  projectRedirect(projectId, "Project details updated");
}

export async function addManualProjectSectionAction(form: FormData): Promise<void> {
  const tenantId = await requireProjectManager();
  const projectId = value(form, "projectId");
  let saved = false;
  try { saved = await addManualProjectSection(tenantId, projectId, value(form, "title")); }
  catch (error) { projectRedirect(projectId, errorText(error), true, true); }
  if (!saved) projectRedirect(projectId, "Manual project not found in this workspace", true, true);
  revalidatePath(`/projects/${projectId}`);
  projectRedirect(projectId, "Sub Job added", false, true);
}

export async function renameManualProjectSectionAction(form: FormData): Promise<void> {
  const tenantId = await requireProjectManager();
  const projectId = value(form, "projectId");
  let saved = false;
  try { saved = await renameManualProjectSection(tenantId, projectId, value(form, "sectionId"), value(form, "title")); }
  catch (error) { projectRedirect(projectId, errorText(error), true, true); }
  if (!saved) projectRedirect(projectId, "Sub Job not found in this workspace", true, true);
  revalidatePath(`/projects/${projectId}`);
  projectRedirect(projectId, "Sub Job renamed", false, true);
}

export async function removeManualProjectSectionAction(form: FormData): Promise<void> {
  const tenantId = await requireProjectManager();
  const projectId = value(form, "projectId");
  let saved = false;
  try { saved = await removeManualProjectSection(tenantId, projectId, value(form, "sectionId")); }
  catch (error) { projectRedirect(projectId, errorText(error), true, true); }
  if (!saved) projectRedirect(projectId, "Sub Job not found in this workspace", true, true);
  revalidatePath(`/projects/${projectId}`);
  projectRedirect(projectId, "Sub Job removed; its tasks are now in General / Unassigned", false, true);
}
