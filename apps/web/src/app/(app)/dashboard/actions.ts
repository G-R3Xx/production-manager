"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { synchroniseJobsFromCurrentWorkflow } from "@/server/jobs";

export async function refreshDashboardJobsAction(): Promise<void> {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  await synchroniseJobsFromCurrentWorkflow(activeTenant.tenantId, { force: true });
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  redirect("/dashboard?message=Job%20stages%20refreshed");
}
