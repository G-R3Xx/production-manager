"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId, type ActiveTenantContext } from "@/server/bootstrap/activeTenant";
import {
  addProductionStepForTenant,
  createProductionJobFromArtworkApprovalForTenant,
  removeProductionJobForTenant,
  restoreProductionJobForTenant,
  setProductionJobStatusForTenant,
  setProductionStepStatusForTenant,
  syncProductionJobForTenant,
  updateProductionItemPrintReadyFileForTenant,
  updateProductionJobDetailsForTenant
} from "@/server/production";

type ActiveTenant = NonNullable<ActiveTenantContext>;
type SessionUser = Awaited<ReturnType<typeof getRequiredSessionUser>>;

function redirectToProduction(path: string): never {
  redirect(path);
  throw new Error(`Redirect failed: ${path}`);
}

async function requireTenant(): Promise<{ user: SessionUser; activeTenant: ActiveTenant }> {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    redirectToProduction("/bootstrap?error=Create%20or%20select%20a%20tenant%20first");
  }
  return { user, activeTenant };
}

function text(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

function productionRedirect(jobId: string | null | undefined, message: string): never {
  const suffix = jobId ? `?selected=${encodeURIComponent(jobId)}&message=${encodeURIComponent(message)}` : `?message=${encodeURIComponent(message)}`;
  redirectToProduction(`/production${suffix}`);
}

export async function createProductionJobFromArtworkAction(formData: FormData): Promise<void> {
  const { user, activeTenant } = await requireTenant();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  if (!approvalId) redirectToProduction("/production?error=Select%20an%20approved%20artwork%20approval%20first");
  const job = await createProductionJobFromArtworkApprovalForTenant(activeTenant.tenantId, approvalId, user.email ?? "Production Manager");
  productionRedirect(job?.id, job ? "Production job created" : "Artwork approval must be approved before production can start");
}

export async function syncProductionJobAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) redirectToProduction("/production?error=Missing%20production%20job");
  await syncProductionJobForTenant(activeTenant.tenantId, jobId);
  productionRedirect(jobId, "Production items and procedure synced from artwork pages");
}

export async function updateProductionJobDetailsAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) redirectToProduction("/production?error=Missing%20production%20job");
  await updateProductionJobDetailsForTenant(activeTenant.tenantId, jobId, {
    priority: text(formData.get("priority")),
    dueDate: text(formData.get("dueDate")),
    assignedTo: text(formData.get("assignedTo")),
    internalNotes: text(formData.get("internalNotes"))
  });
  productionRedirect(jobId, "Production details saved");
}

export async function setProductionJobStatusAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const jobId = String(formData.get("jobId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!jobId || !status) redirectToProduction("/production?error=Missing%20production%20status");
  await setProductionJobStatusForTenant(activeTenant.tenantId, jobId, status);
  productionRedirect(jobId, "Production status updated");
}

export async function deleteProductionJobAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) redirectToProduction("/production?error=Missing%20production%20job");
  await removeProductionJobForTenant(activeTenant.tenantId, jobId);
  redirectToProduction("/production?message=Production%20job%20deleted");
}

export async function restoreProductionJobAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) redirectToProduction("/production?filter=deleted&error=Missing%20production%20job");
  await restoreProductionJobForTenant(activeTenant.tenantId, jobId);
  productionRedirect(jobId, "Production job restored");
}

export async function toggleProductionStepAction(formData: FormData): Promise<void> {
  const { user, activeTenant } = await requireTenant();
  const stepId = String(formData.get("stepId") ?? "").trim();
  const currentStatus = String(formData.get("currentStatus") ?? "pending").trim();
  if (!stepId) redirectToProduction("/production?error=Missing%20procedure%20step");
  const nextStatus = currentStatus === "done" ? "pending" : "done";
  const result = await setProductionStepStatusForTenant(activeTenant.tenantId, stepId, nextStatus, user.email ?? null);
  productionRedirect(result.jobId, nextStatus === "done" ? "Step checked off" : "Step reopened");
}

export async function addProductionStepAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const jobId = String(formData.get("jobId") ?? "").trim();
  const itemId = text(formData.get("itemId"));
  const label = text(formData.get("label"));
  if (!jobId || !label) redirectToProduction("/production?error=Enter%20a%20step%20name");
  await addProductionStepForTenant(activeTenant.tenantId, jobId, itemId, label);
  productionRedirect(jobId, "Manual production step added");
}

export async function attachPrintReadyFileAction(formData: FormData): Promise<void> {
  const { user, activeTenant } = await requireTenant();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const fileUrl = text(formData.get("fileUrl"));
  if (!itemId || !fileUrl) redirectToProduction("/production?error=Upload%20or%20paste%20a%20print-ready%20file%20first");
  const result = await updateProductionItemPrintReadyFileForTenant(activeTenant.tenantId, itemId, {
    fileUrl,
    storagePath: text(formData.get("storagePath")),
    fileName: text(formData.get("fileName")),
    fileType: text(formData.get("fileType")),
    notes: text(formData.get("printReadyNotes")),
    uploadedBy: user.email ?? null
  });
  productionRedirect(result.jobId, "Print-ready artwork attached");
}
