"use server";

import { Buffer } from "node:buffer";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { customerMyobPriceLevel, customerMyobPriceLevelName, customerMyobPriceLevelNames, getCustomerById, normaliseMyobPriceLevel, type CustomerPayload, updateCustomerForTenant, updateCustomerPayloadForTenant, upsertImportedCustomer } from "@/server/customers";
import { getMyobConnectionByTenantId } from "@/server/integrations";
import { syncLocalCustomerToMyobForTenant } from "@/server/myob-sync";

const clientSchema = z.object({
  displayName: z.string().min(1).max(255),
  companyName: z.string().max(255).optional().or(z.literal("")),
  firstName: z.string().max(120).optional().or(z.literal("")),
  lastName: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email("Please enter a valid email.").optional().or(z.literal("")),
  phone: z.string().max(80).optional().or(z.literal("")),
  abn: z.string().max(80).optional().or(z.literal("")),
  billingAddress: z.string().max(2000).optional().or(z.literal("")),
  defaultSiteAddress: z.string().max(2000).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
  logoUrl: z.string().url("Logo URL must be a valid URL.").optional().or(z.literal("")),
  myobPriceLevel: z.string().optional().or(z.literal(""))
});

function nullable(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    redirect("/bootstrap?error=Create%20or%20select%20a%20tenant%20first");
  }
  return activeTenant!;
}

async function isMyobConnected(tenantId: string): Promise<boolean> {
  const connection = await getMyobConnectionByTenantId(tenantId);
  return connection?.status === "connected" && Boolean(connection.companyFileId);
}

async function syncClientIfConnected(tenantId: string, customerId: string): Promise<string | null> {
  if (!(await isMyobConnected(tenantId))) return null;
  try {
    await syncLocalCustomerToMyobForTenant(tenantId, customerId);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function uploadLogoIfPresent(tenantId: string, customerId: string, formData: FormData): Promise<{ logoUrl?: string; logoStoragePath?: string }> {
  const rawFile = formData.get("logoFile");
  if (!rawFile || typeof rawFile !== "object" || !("size" in rawFile) || !("arrayBuffer" in rawFile)) return {};

  const file = rawFile as unknown as { name?: string; type?: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
  if (!file.size || file.size <= 0) return {};

  const safeName = String(file.name || "client-logo").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120);
  const extension = safeName.includes(".") ? "" : ".png";
  const storagePath = `${tenantId}/clients/${customerId}/logo-${Date.now()}-${safeName}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const supabase = getSupabaseServiceRoleClient();
  const bucket = "client-assets";

  await supabase.storage.createBucket(bucket, { public: true }).catch(() => undefined);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Client logo upload failed: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { logoUrl: data.publicUrl, logoStoragePath: storagePath };
}

function payloadFromParsed(parsed: z.infer<typeof clientSchema>, extra?: { logoUrl?: string; logoStoragePath?: string }): CustomerPayload {
  return {
    abn: nullable(parsed.abn) ?? undefined,
    billingAddress: nullable(parsed.billingAddress) ?? undefined,
    defaultSiteAddress: nullable(parsed.defaultSiteAddress) ?? undefined,
    notes: nullable(parsed.notes) ?? undefined,
    logoUrl: extra?.logoUrl ?? nullable(parsed.logoUrl) ?? undefined,
    logoStoragePath: extra?.logoStoragePath ?? undefined,
    myobItemPriceLevel: normaliseMyobPriceLevel(parsed.myobPriceLevel) ?? "Level A"
  };
}

async function requestedMyobMapping(tenantId: string, formData: FormData): Promise<CustomerPayload> {
  const selectedId = String(formData.get("myobCustomerId") || "").trim();
  if (!selectedId) return {};
  const selected = await getCustomerById(tenantId, selectedId);
  if (!selected || !selected.myobUid || selected.myobUid.startsWith("manual-")) {
    throw new Error("Please select a valid customer imported from MYOB.");
  }
  const level = customerMyobPriceLevel(selected) ?? "Level A";
  return {
    myobUid: selected.myobUid,
    myobDisplayName: selected.displayName,
    myobMatch: "manual_selection",
    myobItemPriceLevel: level,
    myobPriceLevelName: customerMyobPriceLevelName(selected) || level,
    myobPriceLevelNames: customerMyobPriceLevelNames(selected)
  };
}

export async function createClientAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const parsed = clientSchema.safeParse({
    displayName: String(formData.get("displayName") || ""),
    companyName: String(formData.get("companyName") || ""),
    firstName: String(formData.get("firstName") || ""),
    lastName: String(formData.get("lastName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    abn: String(formData.get("abn") || ""),
    billingAddress: String(formData.get("billingAddress") || ""),
    defaultSiteAddress: String(formData.get("defaultSiteAddress") || ""),
    notes: String(formData.get("notes") || ""),
    logoUrl: String(formData.get("logoUrl") || ""),
    myobPriceLevel: String(formData.get("myobPriceLevel") || "Level A")
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the client fields.";
    redirect(`/clients?error=${encodeURIComponent(message)}`);
  }

  let myobMapping: CustomerPayload = {};
  try {
    myobMapping = await requestedMyobMapping(activeTenant.tenantId, formData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`/clients?error=${encodeURIComponent(message)}`);
  }

  const created = await upsertImportedCustomer(activeTenant.tenantId, {
    myobUid: `manual-${crypto.randomUUID()}`,
    displayName: parsed.data.displayName.trim(),
    companyName: nullable(parsed.data.companyName),
    firstName: nullable(parsed.data.firstName),
    lastName: nullable(parsed.data.lastName),
    email: nullable(parsed.data.email),
    phone: nullable(parsed.data.phone),
    isActive: true,
    payloadJson: { source: "manual", ...myobMapping }
  });

  let uploadedLogo: { logoUrl?: string; logoStoragePath?: string } = {};
  try {
    uploadedLogo = await uploadLogoIfPresent(activeTenant.tenantId, created.id, formData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`/clients?error=${encodeURIComponent(message)}`);
  }

  await updateCustomerPayloadForTenant(activeTenant.tenantId, created.id, { ...payloadFromParsed(parsed.data, uploadedLogo), ...myobMapping }, true);

  const syncWarning = await syncClientIfConnected(activeTenant.tenantId, created.id);
  if (syncWarning) {
    redirect(`/clients?selected=${created.id}&error=${encodeURIComponent(`Client created locally, but MYOB sync failed: ${syncWarning}`)}`);
  }
  redirect(`/clients?selected=${created.id}&message=${encodeURIComponent("Client created" + ((await isMyobConnected(activeTenant.tenantId)) ? " and synced to MYOB" : ""))}`);
}

export async function updateClientAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const customerId = String(formData.get("customerId") || "");
  const parsed = clientSchema.safeParse({
    displayName: String(formData.get("displayName") || ""),
    companyName: String(formData.get("companyName") || ""),
    firstName: String(formData.get("firstName") || ""),
    lastName: String(formData.get("lastName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    abn: String(formData.get("abn") || ""),
    billingAddress: String(formData.get("billingAddress") || ""),
    defaultSiteAddress: String(formData.get("defaultSiteAddress") || ""),
    notes: String(formData.get("notes") || ""),
    logoUrl: String(formData.get("logoUrl") || ""),
    myobPriceLevel: String(formData.get("myobPriceLevel") || "Level A")
  });

  if (!parsed.success || !customerId) {
    const message = parsed.success ? "Missing client id." : (parsed.error.issues[0]?.message ?? "Please check the client fields.");
    redirect(`/clients?error=${encodeURIComponent(message)}`);
  }

  const existing = await getCustomerById(activeTenant.tenantId, customerId);
  if (!existing) redirect("/clients?error=Client%20was%20not%20found");

  let myobMapping: CustomerPayload = {};
  try {
    myobMapping = await requestedMyobMapping(activeTenant.tenantId, formData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`/clients?selected=${customerId}&error=${encodeURIComponent(message)}`);
  }

  let uploadedLogo: { logoUrl?: string; logoStoragePath?: string } = {};
  try {
    uploadedLogo = await uploadLogoIfPresent(activeTenant.tenantId, customerId, formData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`/clients?selected=${customerId}&error=${encodeURIComponent(message)}`);
  }

  const existingLinkedMyobUid = !existing.myobUid.startsWith("manual-")
    ? existing.myobUid
    : typeof existing.payloadJson?.myobUid === "string" && !existing.payloadJson.myobUid.startsWith("manual-")
      ? existing.payloadJson.myobUid
      : "";
  const selectedMappingUid = typeof myobMapping.myobUid === "string" ? myobMapping.myobUid : "";
  const isNewMyobMapping = Boolean(selectedMappingUid && selectedMappingUid !== existingLinkedMyobUid);
  const formPriceLevel = normaliseMyobPriceLevel(parsed.data.myobPriceLevel) ?? "Level A";
  const mappedPriceLevel = normaliseMyobPriceLevel(myobMapping.myobItemPriceLevel);
  const desiredPriceLevel = isNewMyobMapping ? (mappedPriceLevel ?? formPriceLevel) : formPriceLevel;

  await updateCustomerForTenant(activeTenant.tenantId, customerId, {
    displayName: parsed.data.displayName.trim(),
    companyName: nullable(parsed.data.companyName),
    firstName: nullable(parsed.data.firstName),
    lastName: nullable(parsed.data.lastName),
    email: nullable(parsed.data.email),
    phone: nullable(parsed.data.phone),
    payloadJson: {
      ...payloadFromParsed(parsed.data, uploadedLogo.logoUrl ? uploadedLogo : { logoUrl: nullable(parsed.data.logoUrl) ?? existing.payloadJson.logoUrl, logoStoragePath: existing.payloadJson.logoStoragePath }),
      ...myobMapping,
      myobItemPriceLevel: desiredPriceLevel,
      myobPriceLevelName: isNewMyobMapping ? myobMapping.myobPriceLevelName : existing.payloadJson.myobPriceLevelName,
      deletedAt: undefined,
      archivedAt: existing.isActive ? undefined : existing.payloadJson.archivedAt
    },
    isActive: existing.isActive
  });

  const syncWarning = await syncClientIfConnected(activeTenant.tenantId, customerId);
  if (syncWarning) {
    redirect(`/clients?selected=${customerId}&error=${encodeURIComponent(`Client saved locally, but MYOB sync failed: ${syncWarning}`)}`);
  }

  redirect(`/clients?selected=${customerId}&message=Client%20updated`);
}

export async function syncClientToMyobAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const customerId = String(formData.get("customerId") || "").trim();
  if (!customerId) redirect("/clients?error=Missing%20client%20id");
  let message = "";
  let errorMessage = "";
  try {
    await syncLocalCustomerToMyobForTenant(activeTenant.tenantId, customerId);
    message = "Client synced to MYOB";
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }
  redirect(`/clients?selected=${customerId}&${errorMessage ? `error=${encodeURIComponent(errorMessage)}` : `message=${encodeURIComponent(message)}`}`);
}

export async function archiveClientAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const customerId = String(formData.get("customerId") || "").trim();
  if (!customerId) redirect("/clients?error=Missing%20client%20id");
  await updateCustomerPayloadForTenant(activeTenant.tenantId, customerId, { archivedAt: new Date().toISOString() }, false);
  redirect(`/clients?selected=${customerId}&filter=archived&message=Client%20archived`);
}

export async function restoreClientAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const customerId = String(formData.get("customerId") || "").trim();
  if (!customerId) redirect("/clients?error=Missing%20client%20id");
  await updateCustomerPayloadForTenant(activeTenant.tenantId, customerId, { archivedAt: "" }, true);
  redirect(`/clients?selected=${customerId}&message=Client%20restored`);
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const customerId = String(formData.get("customerId") || "").trim();
  if (!customerId) redirect("/clients?error=Missing%20client%20id");
  await updateCustomerPayloadForTenant(activeTenant.tenantId, customerId, { deletedAt: new Date().toISOString(), deletedReason: "Deleted from client setup" }, false);
  redirect("/clients?filter=deleted&message=Client%20deleted%20safely");
}
