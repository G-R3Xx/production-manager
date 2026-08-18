"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { attachQuoteToJobForTenant, createJobTaskForTenant, getJobById, updateJobMetaForTenant, updateJobTaskForTenant } from "@/server/jobs";
import { getEnquiryById } from "@/server/enquiries";
import { createQuoteDraftForTenant, getQuoteDraftForEnquiry } from "@/server/quotes";

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  return activeTenant;
}

function text(value: FormDataEntryValue | null): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

export async function createJobTaskAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  const jobId = text(formData.get("jobId"));
  const title = text(formData.get("title"));
  if (!jobId || !title) { redirect("/dashboard?error=Job%20and%20task%20title%20are%20required"); return; }
  await createJobTaskForTenant(tenant.tenantId, {
    jobId,
    title,
    stage: text(formData.get("stage")),
    priority: text(formData.get("priority")),
    dueDate: text(formData.get("dueDate")),
    allDay: true,
    assigneeProfileIds: formData.getAll("assigneeIds").map(String).filter(Boolean),
    notes: text(formData.get("notes")),
  });
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?message=${encodeURIComponent("Task added")}`);
}

export async function updateJobTaskAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  const jobId = text(formData.get("jobId"));
  const taskId = text(formData.get("taskId"));
  if (!jobId || !taskId) { redirect("/dashboard?error=Task%20could%20not%20be%20updated"); return; }
  await updateJobTaskForTenant(tenant.tenantId, {
    taskId,
    title: text(formData.get("title")),
    stage: text(formData.get("stage")),
    status: text(formData.get("status")),
    priority: text(formData.get("priority")),
    dueDate: text(formData.get("dueDate")),
    assigneeProfileIds: formData.getAll("assigneeIds").map(String).filter(Boolean),
    notes: text(formData.get("notes")),
  });
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?message=${encodeURIComponent("Task updated")}`);
}

export async function updateJobMetaAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  const jobId = text(formData.get("jobId"));
  if (!jobId) { redirect("/dashboard?error=Job%20could%20not%20be%20updated"); return; }
  await updateJobMetaForTenant(tenant.tenantId, {
    jobId,
    title: text(formData.get("title")),
    dueDate: text(formData.get("dueDate")),
    priority: text(formData.get("priority")),
    ownerProfileId: text(formData.get("ownerProfileId")),
    invoiceStatus: text(formData.get("invoiceStatus")),
  });
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?message=${encodeURIComponent("Job details updated")}`);
}

export async function createQuoteFromJobEnquiryAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  const jobId = text(formData.get("jobId"));
  if (!jobId) { redirect("/dashboard?error=Job%20could%20not%20be%20found"); return; }

  const job = await getJobById(tenant.tenantId, jobId);
  if (!job) { redirect("/dashboard?error=Job%20could%20not%20be%20found"); return; }
  if (job.quoteId) redirect(`/quotes?selected=${job.quoteId}`);

  const enquiry = job.enquiryId ? await getEnquiryById(tenant.tenantId, job.enquiryId) : null;
  const existingQuote = enquiry ? await getQuoteDraftForEnquiry(tenant.tenantId, enquiry.id) : null;
  const quote = existingQuote ?? await createQuoteDraftForTenant(tenant.tenantId, {
    enquiryId: enquiry?.id ?? null,
    linkedCustomerId: enquiry?.linkedCustomerId ?? job.linkedCustomerId,
    clientPurchaseOrderNumber: enquiry?.clientPurchaseOrderNumber ?? null,
    jobName: job.title,
    clientName: enquiry?.clientName || job.clientName,
    contactName: enquiry?.contactName ?? null,
    email: enquiry?.email ?? null,
    phone: enquiry?.phone ?? null,
    discountPercent: "0",
    notes: [
      enquiry?.requestSummary ? `Enquiry summary:\n${enquiry.requestSummary}` : null,
      enquiry?.siteAddress ? `Site address: ${enquiry.siteAddress}` : null,
      enquiry?.notes ? `Enquiry notes:\n${enquiry.notes}` : null,
    ].filter(Boolean).join("\n\n") || null,
  });

  await attachQuoteToJobForTenant(tenant.tenantId, job.id, quote.id);
  revalidatePath("/dashboard");
  revalidatePath(`/jobs/${job.id}`);
  redirect(`/quotes?selected=${quote.id}&message=${encodeURIComponent(existingQuote ? "Opened existing enquiry quote" : "Quote created from enquiry details")}`);
}
