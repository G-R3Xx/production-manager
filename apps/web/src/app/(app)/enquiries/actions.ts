
"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createEnquiryForTenant } from "@/server/enquiries";


async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    redirect("/bootstrap?error=Create%20or%20select%20a%20tenant%20first");
  }
  return activeTenant;
}

function nullable(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}


export async function createEnquiryAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();

  const clientName = String(formData.get("clientName") ?? "").trim();
  const requestSummary = String(formData.get("requestSummary") ?? "").trim();

  if (!clientName || !requestSummary) {
    redirect("/enquiries?error=Client%20name%20and%20request%20summary%20are%20required");
  }

  await createEnquiryForTenant(activeTenant.tenantId, {
    clientName,
    contactName: nullable(formData.get("contactName")),
    email: nullable(formData.get("email")),
    phone: nullable(formData.get("phone")),
    source: nullable(formData.get("source")),
    urgency: nullable(formData.get("urgency")),
    siteAddress: nullable(formData.get("siteAddress")),
    requestSummary,
    notes: nullable(formData.get("notes"))
  });

  redirect("/enquiries?message=Enquiry%20created");
}
