
"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createEnquiryForTenant, getEnquiryById, updateEnquiryStatusForTenant } from "@/server/enquiries";
import { createSurveyRequestForTenant, getLatestSurveyRequestForEnquiry } from "@/server/surveys";


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


export async function createSurveyFromEnquiryAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const enquiryId = String(formData.get("enquiryId") ?? "").trim();

  if (!enquiryId) {
    redirect("/enquiries?error=Choose%20an%20enquiry%20first");
  }

  const enquiry = await getEnquiryById(activeTenant.tenantId, enquiryId);
  if (!enquiry) {
    redirect("/enquiries?error=Enquiry%20was%20not%20found");
  }

  const existing = await getLatestSurveyRequestForEnquiry(activeTenant.tenantId, enquiryId);
  if (existing) {
    redirect(`/surveys?selected=${existing.id}&message=Survey%20request%20already%20exists%20for%20this%20enquiry`);
  }

  const created = await createSurveyRequestForTenant(activeTenant.tenantId, {
    enquiryId: enquiry.id,
    linkedCustomerId: enquiry.linkedCustomerId,
    clientName: enquiry.clientName,
    contactName: enquiry.contactName,
    phone: enquiry.phone,
    siteAddress: enquiry.siteAddress,
    notes: [enquiry.requestSummary, enquiry.notes].filter(Boolean).join("\n\n")
  });

  await updateEnquiryStatusForTenant(activeTenant.tenantId, enquiry.id, "survey_requested");
  redirect(`/surveys?selected=${created.id}&message=Site%20survey%20request%20created`);
}
