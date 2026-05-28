"use server";

import { redirect } from "next/navigation";
import { requireAuthenticatedUser, getSupabaseServerClient } from "@/lib/supabase/server";
import { listMembershipsForAuthUser } from "@/server/bootstrap/memberships";
import { clearStoredActiveTenantId, setStoredActiveTenantId } from "@/server/bootstrap/activeTenant";

export async function signOutAction(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  await clearStoredActiveTenantId();
  redirect("/sign-in");
}

export async function switchTenantAction(formData: FormData): Promise<void> {
  const user = await requireAuthenticatedUser("/dashboard");
  const tenantId = String(formData.get("tenantId") || "").trim();

  if (!tenantId) {
    redirect("/dashboard?error=Missing%20tenant%20selection");
  }

  const memberships = await listMembershipsForAuthUser(user.id);
  const matchingMembership = memberships.find(
    (row) => row.tenantId === tenantId && row.membershipStatus === "active"
  );

  if (!matchingMembership) {
    redirect("/dashboard?error=You%20do%20not%20have%20access%20to%20that%20tenant");
  }

  await setStoredActiveTenantId(tenantId);
  redirect("/dashboard?message=Active%20tenant%20updated");
}
