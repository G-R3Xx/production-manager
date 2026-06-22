"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { upsertImportedCustomer } from "@/server/customers";
import { pool } from "@production-manager/db";

const clientSchema = z.object({
  displayName: z.string().min(1).max(255),
  companyName: z.string().max(255).optional().or(z.literal("")),
  firstName: z.string().max(120).optional().or(z.literal("")),
  lastName: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email("Please enter a valid email.").optional().or(z.literal("")),
  phone: z.string().max(80).optional().or(z.literal(""))
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

export async function createClientAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const parsed = clientSchema.safeParse({
    displayName: String(formData.get("displayName") || ""),
    companyName: String(formData.get("companyName") || ""),
    firstName: String(formData.get("firstName") || ""),
    lastName: String(formData.get("lastName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || "")
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the client fields.";
    redirect(`/clients?error=${encodeURIComponent(message)}`);
  }

  await upsertImportedCustomer(activeTenant.tenantId, {
    myobUid: `manual-${crypto.randomUUID()}`,
    displayName: parsed.data.displayName.trim(),
    companyName: nullable(parsed.data.companyName),
    firstName: nullable(parsed.data.firstName),
    lastName: nullable(parsed.data.lastName),
    email: nullable(parsed.data.email),
    phone: nullable(parsed.data.phone),
    isActive: true,
    payloadJson: { source: "manual" }
  });

  redirect("/clients?message=Client%20created");
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
    phone: String(formData.get("phone") || "")
  });

  if (!parsed.success || !customerId) {
    const message = parsed.success ? "Missing client id." : (parsed.error.issues[0]?.message ?? "Please check the client fields.");
    redirect(`/clients?error=${encodeURIComponent(message)}`);
  }

  await pool.query(
    `
      UPDATE app.customers
      SET
        display_name = $3::varchar,
        company_name = $4::varchar,
        first_name = $5::varchar,
        last_name = $6::varchar,
        email = $7::varchar,
        phone = $8::varchar,
        updated_at = now()
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
    `,
    [
      activeTenant.tenantId,
      customerId,
      parsed.data.displayName.trim(),
      nullable(parsed.data.companyName),
      nullable(parsed.data.firstName),
      nullable(parsed.data.lastName),
      nullable(parsed.data.email),
      nullable(parsed.data.phone)
    ]
  );

  redirect("/clients?message=Client%20updated");
}
