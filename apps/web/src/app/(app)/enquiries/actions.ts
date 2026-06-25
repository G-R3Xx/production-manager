
"use server";

import { Buffer } from "node:buffer";
import { redirect } from "next/navigation";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createEnquiryCorrespondenceForTenant, createEnquiryForTenant, getEnquiryById, updateEnquiryClientLogoForTenant, updateEnquiryStatusForTenant } from "@/server/enquiries";
import { getCustomerById, customerLogoUrl } from "@/server/customers";
import { createInstallSchedulerSurveyJob } from "@/server/installSchedulerBridge";
import { createSurveyRequestForTenant, getLatestSurveyRequestForEnquiry, getSurveyRequestById } from "@/server/surveys";


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

function getAllStrings(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((value) => String(value ?? "").trim());
}

function isValidHttpUrl(value: string | null): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function uploadEnquiryLogoIfPresent(tenantId: string, enquiryId: string, formData: FormData): Promise<{ logoUrl?: string; logoStoragePath?: string }> {
  const rawFile = formData.get("clientLogoFile");
  if (!rawFile || typeof rawFile !== "object" || !("size" in rawFile) || !("arrayBuffer" in rawFile)) return {};

  const file = rawFile as unknown as { name?: string; type?: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
  if (!file.size || file.size <= 0) return {};
  if (file.size > 5 * 1024 * 1024) throw new Error("Client logo upload failed: please keep the logo under 5MB.");
  if (file.type && !file.type.startsWith("image/")) throw new Error("Client logo upload failed: please upload an image file.");

  const safeName = String(file.name || "client-logo").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120);
  const extension = safeName.includes(".") ? "" : ".png";
  const storagePath = `${tenantId}/enquiries/${enquiryId}/client-logo-${Date.now()}-${safeName}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "image/png";
  const supabase = getSupabaseServiceRoleClient();
  const bucket = "client-assets";

  await supabase.storage.createBucket(bucket, { public: true }).catch(() => undefined);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Client logo upload failed: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { logoUrl: data.publicUrl, logoStoragePath: storagePath };
}


export async function createEnquiryAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const user = await getRequiredSessionUser();

  const linkedCustomerId = nullable(formData.get("linkedCustomerId"));
  const linkedCustomer = linkedCustomerId ? await getCustomerById(activeTenant.tenantId, linkedCustomerId) : null;
  const clientName = String(formData.get("clientName") ?? "").trim() || linkedCustomer?.displayName || "";
  const requestSummary = String(formData.get("requestSummary") ?? "").trim();

  if (!clientName || !requestSummary) {
    redirect("/enquiries?error=Client%20name%20and%20request%20summary%20are%20required");
  }

  const pastedClientLogoUrl = nullable(formData.get("clientLogoUrl"));
  if (!isValidHttpUrl(pastedClientLogoUrl)) {
    redirect("/enquiries?error=Client%20logo%20URL%20must%20start%20with%20http%20or%20https");
  }

  const created = await createEnquiryForTenant(activeTenant.tenantId, {
    clientName,
    contactName: nullable(formData.get("contactName")) ?? ([linkedCustomer?.firstName, linkedCustomer?.lastName].filter(Boolean).join(" ") || null),
    email: nullable(formData.get("email")) ?? linkedCustomer?.email ?? null,
    phone: nullable(formData.get("phone")) ?? linkedCustomer?.phone ?? null,
    source: nullable(formData.get("source")),
    urgency: nullable(formData.get("urgency")) ?? "Normal",
    siteAddress: nullable(formData.get("siteAddress")) ?? (typeof linkedCustomer?.payloadJson.defaultSiteAddress === "string" ? linkedCustomer.payloadJson.defaultSiteAddress : null),
    requestSummary,
    clientPurchaseOrderNumber: nullable(formData.get("clientPurchaseOrderNumber")),
    clientLogoUrl: pastedClientLogoUrl,
    notes: nullable(formData.get("notes")),
    linkedCustomerId: linkedCustomer?.id ?? null
  });

  try {
    const uploadedLogo = await uploadEnquiryLogoIfPresent(activeTenant.tenantId, created.id, formData);
    if (uploadedLogo.logoUrl) {
      await updateEnquiryClientLogoForTenant(activeTenant.tenantId, created.id, uploadedLogo);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`/enquiries?error=${encodeURIComponent(message)}`);
  }

  const fileNames = getAllStrings(formData, "pendingCorrespondenceFileName");
  const fileUrls = getAllStrings(formData, "pendingCorrespondenceFileUrl");
  const storagePaths = getAllStrings(formData, "pendingCorrespondenceStoragePath");
  const mimeTypes = getAllStrings(formData, "pendingCorrespondenceMimeType");
  const sizeBytes = getAllStrings(formData, "pendingCorrespondenceSizeBytes");
  const previewKinds = getAllStrings(formData, "pendingCorrespondencePreviewKind");
  const emailSubjects = getAllStrings(formData, "pendingCorrespondenceEmailSubject");
  const emailFroms = getAllStrings(formData, "pendingCorrespondenceEmailFrom");
  const emailTos = getAllStrings(formData, "pendingCorrespondenceEmailTo");
  const emailDates = getAllStrings(formData, "pendingCorrespondenceEmailDate");
  const bodyPreviews = getAllStrings(formData, "pendingCorrespondenceBodyPreview");

  for (let index = 0; index < fileNames.length; index += 1) {
    const fileName = fileNames[index] ?? "";
    const fileUrl = fileUrls[index] ?? "";
    if (!fileName || !fileUrl) continue;
    const rawSizeBytes = Number(sizeBytes[index] ?? 0);
    await createEnquiryCorrespondenceForTenant(activeTenant.tenantId, {
      enquiryId: created.id,
      fileName,
      fileUrl,
      storagePath: storagePaths[index] || null,
      mimeType: mimeTypes[index] || null,
      sizeBytes: Number.isFinite(rawSizeBytes) && rawSizeBytes > 0 ? rawSizeBytes : null,
      uploadedBy: user.email ?? user.id,
      previewKind: previewKinds[index] || null,
      emailSubject: emailSubjects[index] || null,
      emailFrom: emailFroms[index] || null,
      emailTo: emailTos[index] || null,
      emailDate: emailDates[index] || null,
      bodyPreview: bodyPreviews[index] || null
    });
  }

  const message = fileNames.length > 0 ? "Enquiry created and correspondence attached" : "Enquiry created";
  redirect(`/enquiries?message=${encodeURIComponent(message)}`);
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

  const survey = await getSurveyRequestById(activeTenant.tenantId, created.id);
  const linkedCustomer = enquiry.linkedCustomerId ? await getCustomerById(activeTenant.tenantId, enquiry.linkedCustomerId) : null;
  const bridgeResult = survey
    ? await createInstallSchedulerSurveyJob({
        tenantId: activeTenant.tenantId,
        survey,
        enquiryRequestSummary: enquiry.requestSummary,
        enquiryNotes: enquiry.notes,
        email: enquiry.email,
        clientLogoUrl: enquiry.clientLogoUrl || customerLogoUrl(linkedCustomer),
        clientLogoStoragePath: enquiry.clientLogoStoragePath || (typeof linkedCustomer?.payloadJson.logoStoragePath === "string" ? linkedCustomer.payloadJson.logoStoragePath : null),
      })
    : { ok: false, error: "Survey was created but could not be reloaded" };

  const message = bridgeResult.ok
    ? "Site survey request created and sent to Install Scheduler"
    : `Site survey request created, but Install Scheduler was not created: ${bridgeResult.error || "bridge not configured"}`;

  redirect(`/surveys?selected=${created.id}&message=${encodeURIComponent(message)}`);
}


export async function deleteEnquiryAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const enquiryId = String(formData.get("enquiryId") ?? "").trim();
  if (!enquiryId) redirect("/enquiries?error=Choose%20an%20enquiry%20to%20delete");

  await updateEnquiryStatusForTenant(activeTenant.tenantId, enquiryId, "deleted");
  redirect("/enquiries?message=Enquiry%20deleted%20from%20the%20active%20list");
}

export async function restoreEnquiryAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const enquiryId = String(formData.get("enquiryId") ?? "").trim();
  if (!enquiryId) redirect("/enquiries?filter=deleted&error=Choose%20an%20enquiry%20to%20restore");

  await updateEnquiryStatusForTenant(activeTenant.tenantId, enquiryId, "new");
  redirect("/enquiries?message=Enquiry%20restored");
}


export async function attachEnquiryCorrespondenceAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const user = await getRequiredSessionUser();
  const enquiryId = String(formData.get("enquiryId") ?? "").trim();
  const fileName = String(formData.get("fileName") ?? "").trim();
  const fileUrl = String(formData.get("fileUrl") ?? "").trim();
  const storagePath = nullable(formData.get("storagePath"));
  const mimeType = nullable(formData.get("mimeType"));
  const rawSizeBytes = Number(formData.get("sizeBytes") ?? 0);
  const previewKind = nullable(formData.get("previewKind"));
  const emailSubject = nullable(formData.get("emailSubject"));
  const emailFrom = nullable(formData.get("emailFrom"));
  const emailTo = nullable(formData.get("emailTo"));
  const emailDate = nullable(formData.get("emailDate"));
  const bodyPreview = nullable(formData.get("bodyPreview"));

  if (!enquiryId) {
    redirect("/enquiries?error=Choose%20an%20enquiry%20before%20attaching%20correspondence");
  }

  if (!fileName || !fileUrl) {
    redirect("/enquiries?error=Drop%20or%20choose%20an%20email%20correspondence%20file%20first");
  }

  const enquiry = await getEnquiryById(activeTenant.tenantId, enquiryId);
  if (!enquiry) {
    redirect("/enquiries?error=Enquiry%20was%20not%20found");
  }

  await createEnquiryCorrespondenceForTenant(activeTenant.tenantId, {
    enquiryId,
    fileName,
    fileUrl,
    storagePath,
    mimeType,
    sizeBytes: Number.isFinite(rawSizeBytes) && rawSizeBytes > 0 ? rawSizeBytes : null,
    uploadedBy: user.email ?? user.id,
    previewKind,
    emailSubject,
    emailFrom,
    emailTo,
    emailDate,
    bodyPreview
  });

  redirect("/enquiries?message=Correspondence%20attached%20to%20enquiry");
}
