"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  createWordPressApiKey,
  getWordPressConnectionForTenant,
  saveWordPressConnectionForTenant
} from "@/server/wordpress";

async function tenantId() {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  return tenant.tenantId;
}

export async function saveWordPressConnectionAction(formData: FormData) {
  const id = await tenantId();
  const existing = await getWordPressConnectionForTenant(id);
  const siteUrl = String(formData.get("siteUrl") ?? "").trim() || null;
  const apiKey = String(formData.get("apiKey") ?? "").trim() || existing?.apiKey || createWordPressApiKey();
  const cashSaleCustomerId = String(formData.get("cashSaleCustomerId") ?? "").trim() || null;
  await saveWordPressConnectionForTenant(id, { siteUrl, apiKey, cashSaleCustomerId, status: "connected" });
  revalidatePath("/integrations/wordpress");
  redirect("/integrations/wordpress?message=WordPress%20connection%20saved");
}

export async function rotateWordPressApiKeyAction() {
  const id = await tenantId();
  const existing = await getWordPressConnectionForTenant(id);
  await saveWordPressConnectionForTenant(id, {
    siteUrl: existing?.siteUrl ?? null,
    apiKey: createWordPressApiKey(),
    cashSaleCustomerId: existing?.cashSaleCustomerId ?? null,
    status: "connected"
  });
  revalidatePath("/integrations/wordpress");
  redirect("/integrations/wordpress?message=New%20API%20key%20created");
}
