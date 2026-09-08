"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getJobById } from "@/server/jobs";
import { createJobInvoiceForTenant, getInvoiceById, type InvoiceKind } from "@/server/invoicing";
import { pushPmInvoiceToMyobForTenant, refreshPmInvoiceFromMyobForTenant } from "@/server/myob-sync";

const INVOICE_ROLES = new Set(["owner", "manager", "accounts"]);

async function requireInvoiceTenant() {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  if (!INVOICE_ROLES.has(tenant.tenantRole)) redirect("/dashboard?error=You%20do%20not%20have%20permission%20to%20create%20invoices");
  return tenant;
}

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function num(value: FormDataEntryValue | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeInvoiceKind(value: string): InvoiceKind {
  if (["full_remaining", "selected_lines", "deposit", "progress", "final_balance", "variation"].includes(value)) return value as InvoiceKind;
  return "full_remaining";
}

function redirectWith(jobId: string, kind: "message" | "error", value: string): never {
  redirect(`/jobs/${jobId}/invoice?${kind}=${encodeURIComponent(value)}`);
}

export async function createAndPushInvoiceAction(formData: FormData): Promise<void> {
  const tenant = await requireInvoiceTenant();
  const jobId = text(formData.get("jobId"));
  const quoteId = text(formData.get("quoteId"));
  if (!jobId || !quoteId) redirectWith(jobId || "", "error", "Job and accepted quote are required for invoicing.");

  const job = await getJobById(tenant.tenantId, jobId);
  if (!job || job.quoteId !== quoteId) redirectWith(jobId, "error", "The job or linked quote could not be found.");

  const kind = safeInvoiceKind(text(formData.get("invoiceKind")));
  const selectedQtyByQuoteLineId: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;
    const lineId = key.slice(4);
    const quantity = Number(value);
    if (lineId && Number.isFinite(quantity) && quantity > 0) selectedQtyByQuoteLineId[lineId] = quantity;
  }

  let invoiceId: string | null = null;
  let successMessage = "MYOB invoice created.";
  try {
    const invoice = await createJobInvoiceForTenant(tenant.tenantId, {
      jobId,
      quoteId,
      kind,
      selectedQtyByQuoteLineId,
      advanceAmount: num(formData.get("advanceAmount")),
      advancePercent: num(formData.get("advancePercent")),
      advanceLabel: text(formData.get("advanceLabel")) || null,
      variationDescription: text(formData.get("variationDescription")) || null,
      variationQty: num(formData.get("variationQty")),
      variationUnitPrice: num(formData.get("variationUnitPrice")),
      createdBy: tenant.userProfileId,
      sourceOrderUid: job.myobOrderUid,
      sourceOrderNumber: job.myobOrderNumber,
    });
    invoiceId = invoice.id;
    const result = await pushPmInvoiceToMyobForTenant(tenant.tenantId, invoice.id);
    successMessage = result.myobInvoiceNumber ? `MYOB invoice ${result.myobInvoiceNumber} created.` : "MYOB invoice created.";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    revalidatePath(`/jobs/${jobId}/invoice`);
    redirectWith(jobId, "error", invoiceId ? `${message} The PM invoice draft has been kept so you can retry safely.` : message);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invoice`);
  redirectWith(jobId, "message", successMessage);
}

export async function retryInvoiceAction(formData: FormData): Promise<void> {
  const tenant = await requireInvoiceTenant();
  const jobId = text(formData.get("jobId"));
  const invoiceId = text(formData.get("invoiceId"));
  if (!jobId || !invoiceId) redirectWith(jobId || "", "error", "Invoice could not be retried.");
  const invoice = await getInvoiceById(tenant.tenantId, invoiceId);
  if (!invoice || invoice.jobId !== jobId) redirectWith(jobId, "error", "Invoice could not be found for this job.");
  let successMessage = "MYOB invoice created.";
  try {
    const result = await pushPmInvoiceToMyobForTenant(tenant.tenantId, invoiceId);
    successMessage = result.myobInvoiceNumber ? `MYOB invoice ${result.myobInvoiceNumber} created.` : "MYOB invoice created.";
  } catch (error) {
    redirectWith(jobId, "error", error instanceof Error ? error.message : String(error));
  }
  revalidatePath("/dashboard");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invoice`);
  redirectWith(jobId, "message", successMessage);
}

export async function refreshInvoiceAction(formData: FormData): Promise<void> {
  const tenant = await requireInvoiceTenant();
  const jobId = text(formData.get("jobId"));
  const invoiceId = text(formData.get("invoiceId"));
  if (!jobId || !invoiceId) redirectWith(jobId || "", "error", "Invoice status could not be refreshed.");
  const invoice = await getInvoiceById(tenant.tenantId, invoiceId);
  if (!invoice || invoice.jobId !== jobId) redirectWith(jobId, "error", "Invoice could not be found for this job.");
  try {
    await refreshPmInvoiceFromMyobForTenant(tenant.tenantId, invoiceId);
  } catch (error) {
    redirectWith(jobId, "error", error instanceof Error ? error.message : String(error));
  }
  revalidatePath("/dashboard");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invoice`);
  redirectWith(jobId, "message", "MYOB invoice status refreshed.");
}
