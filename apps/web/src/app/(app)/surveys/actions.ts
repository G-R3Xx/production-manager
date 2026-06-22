
"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createInstallSchedulerSurveyJob } from "@/server/installSchedulerBridge";
import { createSurveyRequestForTenant, getSurveyRequestById, updateSurveyRequestForTenant } from "@/server/surveys";


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

  const created = await createSurveyRequestForTenant(activeTenant.tenantId, {
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

  const survey = await getSurveyRequestById(activeTenant.tenantId, created.id);
  const bridgeResult = survey
    ? await createInstallSchedulerSurveyJob({ tenantId: activeTenant.tenantId, survey })
    : { ok: false, error: "Survey was created but could not be reloaded" };

  const message = bridgeResult.ok
    ? "Survey request created and sent to Install Scheduler"
    : `Survey request created, but Install Scheduler was not created: ${bridgeResult.error || "bridge not configured"}`;

  redirect(`/surveys?selected=${created.id}&message=${encodeURIComponent(message)}`);
}


export async function updateSurveyRequestAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const surveyId = String(formData.get("surveyId") ?? "").trim();

  if (!surveyId) {
    redirect("/surveys?error=Choose%20a%20survey%20request%20first");
  }

  await updateSurveyRequestForTenant(activeTenant.tenantId, surveyId, {
    status: nullable(formData.get("status")),
    assignedTo: nullable(formData.get("assignedTo")),
    dueDate: nullable(formData.get("dueDate")),
    notes: nullable(formData.get("notes")),
    surveyDetails: nullable(formData.get("surveyDetails"))
  });

  redirect(`/surveys?selected=${surveyId}&message=Survey%20request%20updated`);
}
