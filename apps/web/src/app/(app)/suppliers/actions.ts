"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createSupplierForTenant, updateSupplierById } from "@/server/suppliers";

const supplierSchema = z.object({
  displayName: z.string().min(1).max(255),
  contactName: z.string().max(255).optional().or(z.literal("")),
  email: z.string().email("Please enter a valid email.").optional().or(z.literal("")),
  phone: z.string().max(80).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal(""))
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
  return activeTenant;
}

export async function createSupplierAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const parsed = supplierSchema.safeParse({
    displayName: String(formData.get("displayName") || ""),
    contactName: String(formData.get("contactName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    notes: String(formData.get("notes") || "")
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the supplier fields.";
    redirect(`/suppliers?error=${encodeURIComponent(message)}`);
  }

  await createSupplierForTenant(activeTenant.tenantId, {
    displayName: parsed.data.displayName.trim(),
    contactName: nullable(parsed.data.contactName),
    email: nullable(parsed.data.email),
    phone: nullable(parsed.data.phone),
    notes: nullable(parsed.data.notes)
  });

  redirect("/suppliers?message=Supplier%20created");
}

export async function updateSupplierAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const supplierId = String(formData.get("supplierId") || "");
  const parsed = supplierSchema.safeParse({
    displayName: String(formData.get("displayName") || ""),
    contactName: String(formData.get("contactName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    notes: String(formData.get("notes") || "")
  });

  if (!parsed.success || !supplierId) {
    const message = parsed.success ? "Missing supplier id." : (parsed.error.issues[0]?.message ?? "Please check the supplier fields.");
    redirect(`/suppliers?error=${encodeURIComponent(message)}`);
  }

  await updateSupplierById(activeTenant.tenantId, supplierId, {
    displayName: parsed.data.displayName.trim(),
    contactName: nullable(parsed.data.contactName),
    email: nullable(parsed.data.email),
    phone: nullable(parsed.data.phone),
    notes: nullable(parsed.data.notes)
  });

  redirect("/suppliers?message=Supplier%20updated");
}
