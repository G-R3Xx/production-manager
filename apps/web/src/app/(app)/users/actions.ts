"use server";

import { revalidatePath } from "next/cache";
import { staffProfileNamesSchema } from "@/lib/staff-profile";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { updateTenantUserMembershipByAdmin } from "@/server/users";

const updateStaffSchema = staffProfileNamesSchema.extend({
  membershipId: z.string().uuid("Missing staff member."),
  tenantRole: z.enum(["owner", "manager", "staff", "sales", "installer", "accounts"]),
  membershipStatus: z.enum(["active", "invited", "disabled"]),
  quoteLabourRate: z.string().optional().or(z.literal("")),
  quoteEntryLayout: z.enum(["list", "catalogue"])
});

export async function updateStaffMemberAction(formData: FormData): Promise<void> {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const parsed = updateStaffSchema.safeParse({
    membershipId: String(formData.get("membershipId") || ""),
    fullName: String(formData.get("fullName") || ""),
    shortName: String(formData.get("shortName") || ""),
    tenantRole: String(formData.get("tenantRole") || "staff"),
    membershipStatus: String(formData.get("membershipStatus") || "active"),
    quoteLabourRate: String(formData.get("quoteLabourRate") || ""),
    quoteEntryLayout: String(formData.get("quoteEntryLayout") || "list")
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the staff role fields.";
    redirect(`/users?error=${encodeURIComponent(message)}`);
  }

  try {
    await updateTenantUserMembershipByAdmin({
      tenantId: activeTenant.tenantId,
      membershipId: parsed.data.membershipId,
      fullName: parsed.data.fullName,
      shortName: parsed.data.shortName,
      requesterUserProfileId: activeTenant.userProfileId,
      requesterTenantRole: activeTenant.tenantRole,
      tenantRole: parsed.data.tenantRole,
      membershipStatus: parsed.data.membershipStatus,
      quoteLabourRate: parsed.data.quoteLabourRate,
      quoteEntryLayout: parsed.data.quoteEntryLayout
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update staff member.";
    redirect(`/users?error=${encodeURIComponent(message)}`);
  }

  // Staff names appear throughout assignments, calendars and job screens.
  revalidatePath("/", "layout");
  redirect("/users?message=Staff%20member%20updated");
}
