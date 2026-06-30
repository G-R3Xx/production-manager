"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/supabase/server";
import { createInitialTenantBootstrap } from "@/server/bootstrap/bootstrap";
import { setStoredActiveTenantId } from "@/server/bootstrap/activeTenant";
import { ensureDomainAutoJoinForAuthUser } from "@/server/auth/domainJoin";

const bootstrapSchema = z.object({
  fullName: z.string().min(2, "Full name is required."),
  shortName: z.string().min(2, "Short name is required.").max(50),
  tenantName: z.string().min(2, "Tenant name is required."),
  tenantSlug: z.string().max(80).optional().or(z.literal(""))
});

export async function bootstrapTenantAction(formData: FormData): Promise<void> {
  const user = await requireAuthenticatedUser("/bootstrap");

  const fullNameFromAuth =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null;

  const autoJoinResult = await ensureDomainAutoJoinForAuthUser({
    authUserId: user.id,
    email: user.email,
    fullName: fullNameFromAuth
  });

  if (autoJoinResult.status === "joined" || autoJoinResult.status === "already_member") {
    await setStoredActiveTenantId(autoJoinResult.tenantId);
    redirect(`/dashboard?message=${encodeURIComponent(`Joined ${autoJoinResult.tenantName}.`)}`);
  }

  const parsed = bootstrapSchema.safeParse({
    fullName: String(formData.get("fullName") || "").trim(),
    shortName: String(formData.get("shortName") || "").trim(),
    tenantName: String(formData.get("tenantName") || "").trim(),
    tenantSlug: String(formData.get("tenantSlug") || "").trim()
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check your bootstrap details.";
    redirect(`/bootstrap?error=${encodeURIComponent(message)}`);
  }

  const result = await createInitialTenantBootstrap({
    authUserId: user.id,
    email: user.email ?? "",
    fullName: parsed.data.fullName,
    shortName: parsed.data.shortName,
    tenantName: parsed.data.tenantName,
    tenantSlug: parsed.data.tenantSlug || undefined
  });

  if (!result.ok) {
    redirect(`/bootstrap?error=${encodeURIComponent(result.message)}`);
  }

  await setStoredActiveTenantId(result.tenantId);
  redirect(`/dashboard?message=${encodeURIComponent(`Tenant ${result.slug} is ready.`)}`);
}
