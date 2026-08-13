"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { formatStructuredAddress, normaliseStructuredAddress } from "@/lib/contact-address";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createSupplierForTenant, updateSupplierById } from "@/server/suppliers";
import { getMyobConnectionByTenantId } from "@/server/integrations";
import { syncLocalSupplierToMyobForTenant } from "@/server/myob-sync";

const supplierSchema = z.object({
  displayName: z.string().min(1).max(255),
  contactName: z.string().max(255).optional().or(z.literal("")),
  email: z.string().email("Please enter a valid email.").optional().or(z.literal("")),
  purchaseOrderEmail: z.string().email("Please enter a valid purchase order email.").optional().or(z.literal("")),
  phone: z.string().max(80).optional().or(z.literal("")),
  street: z.string().max(1000).optional().or(z.literal("")),
  city: z.string().max(255).optional().or(z.literal("")),
  state: z.string().max(255).optional().or(z.literal("")),
  postcode: z.string().max(20).optional().or(z.literal("")),
  country: z.string().max(255).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal(""))
});

function nullable(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function supplierAddressPayload(parsed: z.infer<typeof supplierSchema>): Record<string, unknown> {
  const addressStructured = normaliseStructuredAddress({
    street: parsed.street,
    city: parsed.city,
    state: parsed.state,
    postcode: parsed.postcode,
    country: parsed.country || "Australia"
  });
  return {
    addressStructured,
    address: formatStructuredAddress(addressStructured)
  };
}

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap?error=Create%20or%20select%20a%20tenant%20first");
  return activeTenant!;
}

async function syncIfConnected(tenantId: string, supplierId: string): Promise<{ attempted: boolean; error: string | null }> {
  const connection = await getMyobConnectionByTenantId(tenantId);
  if (connection?.status !== "connected" || !connection.companyFileId) return { attempted: false, error: null };
  try {
    await syncLocalSupplierToMyobForTenant(tenantId, supplierId);
    return { attempted: true, error: null };
  } catch (error) {
    return { attempted: true, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createSupplierAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const parsed = supplierSchema.safeParse({
    displayName: String(formData.get("displayName") || ""),
    contactName: String(formData.get("contactName") || ""),
    email: String(formData.get("email") || ""),
    purchaseOrderEmail: String(formData.get("purchaseOrderEmail") || ""),
    phone: String(formData.get("phone") || ""),
    street: String(formData.get("street") || ""),
    city: String(formData.get("city") || ""),
    state: String(formData.get("state") || ""),
    postcode: String(formData.get("postcode") || ""),
    country: String(formData.get("country") || "Australia"),
    notes: String(formData.get("notes") || "")
  });
  if (!parsed.success) redirect(`/suppliers?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Please check the supplier fields.")}`);

  const created = await createSupplierForTenant(activeTenant.tenantId, {
    displayName: parsed.data.displayName.trim(), contactName: nullable(parsed.data.contactName), email: nullable(parsed.data.email),
    purchaseOrderEmail: nullable(parsed.data.purchaseOrderEmail), phone: nullable(parsed.data.phone), notes: nullable(parsed.data.notes), payloadJson: supplierAddressPayload(parsed.data)
  });
  const sync = await syncIfConnected(activeTenant.tenantId, created.id);
  if (sync.error) redirect(`/suppliers?error=${encodeURIComponent(`Supplier created locally, but MYOB sync failed: ${sync.error}`)}`);
  redirect(`/suppliers?message=${encodeURIComponent(sync.attempted ? "Supplier created and synced to MYOB" : "Supplier created")}`);
}

export async function updateSupplierAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const supplierId = String(formData.get("supplierId") || "");
  const parsed = supplierSchema.safeParse({
    displayName: String(formData.get("displayName") || ""), contactName: String(formData.get("contactName") || ""),
    email: String(formData.get("email") || ""), purchaseOrderEmail: String(formData.get("purchaseOrderEmail") || ""), phone: String(formData.get("phone") || ""),
    street: String(formData.get("street") || ""), city: String(formData.get("city") || ""), state: String(formData.get("state") || ""),
    postcode: String(formData.get("postcode") || ""), country: String(formData.get("country") || "Australia"), notes: String(formData.get("notes") || "")
  });
  if (!parsed.success || !supplierId) redirect(`/suppliers?error=${encodeURIComponent(parsed.success ? "Missing supplier id." : (parsed.error.issues[0]?.message ?? "Please check the supplier fields."))}`);

  await updateSupplierById(activeTenant.tenantId, supplierId, {
    displayName: parsed.data.displayName.trim(), contactName: nullable(parsed.data.contactName), email: nullable(parsed.data.email),
    purchaseOrderEmail: nullable(parsed.data.purchaseOrderEmail), phone: nullable(parsed.data.phone), notes: nullable(parsed.data.notes), payloadJson: supplierAddressPayload(parsed.data)
  });
  const sync = await syncIfConnected(activeTenant.tenantId, supplierId);
  if (sync.error) redirect(`/suppliers?error=${encodeURIComponent(`Supplier saved locally, but MYOB sync failed: ${sync.error}`)}`);
  redirect(`/suppliers?message=${encodeURIComponent(sync.attempted ? "Supplier updated and synced to MYOB" : "Supplier updated")}`);
}

export async function syncSupplierToMyobAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const supplierId = String(formData.get("supplierId") || "").trim();
  if (!supplierId) redirect("/suppliers?error=Missing%20supplier%20id");
  let result: { uid: string } | null = null;
  let errorMessage = "";
  try { result = await syncLocalSupplierToMyobForTenant(activeTenant.tenantId, supplierId); }
  catch (error) { errorMessage = error instanceof Error ? error.message : String(error); }
  redirect(`/suppliers?${errorMessage ? `error=${encodeURIComponent(errorMessage)}` : `message=${encodeURIComponent(`Supplier synced to MYOB (${result?.uid ?? "linked"})`)}`}`);
}
