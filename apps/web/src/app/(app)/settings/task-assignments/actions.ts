"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { canManageStaff } from "@/server/users";
import {
  saveTaskAssignmentDefaultsForTenant,
  TASK_ASSIGNMENT_DEFAULT_KEYS,
  type TaskAssignmentDefaultKey,
} from "@/server/task-assignment-defaults";

export async function saveTaskAssignmentDefaultsAction(formData: FormData): Promise<void> {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  if (!canManageStaff(tenant.tenantRole) || tenant.membershipStatus !== "active") {
    redirect("/settings/task-assignments?error=Only%20owners%20and%20managers%20can%20change%20default%20task%20assignments");
  }

  const payload: Partial<Record<TaskAssignmentDefaultKey, string[]>> = {};
  for (const key of TASK_ASSIGNMENT_DEFAULT_KEYS) {
    payload[key] = formData.getAll(`assignment_${key}`).map(String).filter(Boolean);
  }

  try {
    await saveTaskAssignmentDefaultsForTenant(tenant.tenantId, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Default assignments could not be saved.";
    redirect(`/settings/task-assignments?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/calendar");
  revalidatePath("/production");
  revalidatePath("/dashboard");
  revalidatePath("/settings/task-assignments");
  redirect("/settings/task-assignments?message=Default%20task%20assignments%20saved");
}
