
"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createSurveyRequestForTenant } from "@/server/surveys";


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


export async function createSurveyRequestAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const clientName = String(formData.get("clientName") ?? "").trim();

  if (!clientName) {
    redirect("/surveys?error=Client%20name%20is%20required");
  }

  await createSurveyRequestForTenant(activeTenant.tenantId, {
    enquiryId: nullable(formData.get("enquiryId")),
    linkedCustomerId: nullable(formData.get("linkedCustomerId")),
    clientName,
    contactName: nullable(formData.get("contactName")),
    phone: nullable(formData.get("phone")),
    siteAddress: nullable(formData.get("siteAddress")),
    dueDate: nullable(formData.get("dueDate")),
    assignedTo: nullable(formData.get("assignedTo")),
    notes: nullable(formData.get("notes"))
  });

  redirect("/surveys?message=Survey%20request%20created");
}
