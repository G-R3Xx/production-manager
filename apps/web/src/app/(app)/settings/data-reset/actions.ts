"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { resetWorkflowDataForTenant, WORKFLOW_RESET_CONFIRMATION } from "@/server/workflow-reset";

export async function resetWorkflowDataAction(formData: FormData): Promise<void> {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  if (!new Set(["owner", "manager"]).has(String(tenant.tenantRole).toLowerCase())) {
    redirect("/settings/data-reset?error=Only%20an%20owner%20or%20manager%20can%20reset%20workflow%20data");
  }

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== WORKFLOW_RESET_CONFIRMATION) {
    redirect(`/settings/data-reset?error=${encodeURIComponent(`Type ${WORKFLOW_RESET_CONFIRMATION} exactly to confirm`)}`);
  }

  const result = await resetWorkflowDataForTenant(tenant.tenantId).catch((error) => {
    const message = error instanceof Error ? error.message : "Workflow reset failed";
    redirect(`/settings/data-reset?error=${encodeURIComponent(message)}`);
  });

  const removedTotal = Object.values(result.removed).reduce((sum, value) => sum + value, 0);
  const warningText = result.storageWarnings.length
    ? ` Database reset completed, but ${result.storageWarnings.length} storage cleanup warning${result.storageWarnings.length === 1 ? "" : "s"} remain.`
    : "";
  redirect(`/settings/data-reset?message=${encodeURIComponent(`Workflow reset complete. ${removedTotal} tracked workflow records and ${result.storageFilesRemoved} workflow files removed.${warningText}`)}`);
}
