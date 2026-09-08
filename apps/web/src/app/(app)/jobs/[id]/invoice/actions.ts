"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getJobById } from "@/server/jobs";
import { createJobInvoiceForTenant, getInvoiceById, listInvoiceLines, markInvoiceEmailFailed, markInvoiceEmailPending, markInvoiceEmailSent, syncJobInvoiceStatusForTenant, type InvoiceKind } from "@/server/invoicing";
import { pushPmInvoiceToMyobForTenant, refreshPmInvoiceFromMyobForTenant } from "@/server/myob-sync";
import { getCompanySettingsByTenantId } from "@/server/company";
import { getCustomerById } from "@/server/customers";
import { buildInvoicePdf } from "@/server/invoice-pdf";
import { getQuoteDraftById, listQuoteLines } from "@/server/quotes";
import { sendOutboundEmail } from "@/server/outbound-email";

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
    successMessage = result.message || (result.myobInvoiceNumber ? `MYOB invoice ${result.myobInvoiceNumber} created.` : "MYOB invoice created.");
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
    successMessage = result.message || (result.myobInvoiceNumber ? `MYOB invoice ${result.myobInvoiceNumber} created.` : "MYOB invoice created.");
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

function invoiceEmailEscape(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function invoiceEmailOrigin(): string | null {
  const explicit = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
}

function invoiceMoney(value: string | number | null | undefined): string {
  const parsed = Number(value ?? 0);
  return `$${(Number.isFinite(parsed) ? parsed : 0).toFixed(2)}`;
}

export async function emailInvoiceAction(formData: FormData): Promise<void> {
  const tenant = await requireInvoiceTenant();
  const jobId = text(formData.get("jobId"));
  const invoiceId = text(formData.get("invoiceId"));
  if (!jobId || !invoiceId) redirectWith(jobId || "", "error", "Invoice could not be emailed.");

  const [job, invoice] = await Promise.all([
    getJobById(tenant.tenantId, jobId),
    getInvoiceById(tenant.tenantId, invoiceId),
  ]);
  if (!job || !invoice || invoice.jobId !== jobId) redirectWith(jobId, "error", "Invoice could not be found for this job.");
  if (!invoice.myobUid || invoice.myobSyncStatus !== "synced") redirectWith(jobId, "error", "Create or recover the MYOB invoice before sending it to the client.");

  const quote = await getQuoteDraftById(tenant.tenantId, invoice.quoteId);
  if (!quote) redirectWith(jobId, "error", "The accepted quote linked to this invoice could not be found.");
  const client = await getCustomerById(tenant.tenantId, quote.linkedCustomerId);
  const requestedRecipient = text(formData.get("recipientEmail"));
  const recipient = requestedRecipient || String(quote.emailTo || quote.email || client?.email || "").trim();
  if (!recipient || !recipient.includes("@")) {
    await markInvoiceEmailFailed(tenant.tenantId, invoiceId, { recipient, error: "Enter a valid invoice recipient email address." });
    redirectWith(jobId, "error", "Enter a valid invoice recipient email address.");
  }

  await markInvoiceEmailPending(tenant.tenantId, invoiceId, recipient);
  try {
    const [invoiceLines, quoteLines, company] = await Promise.all([
      listInvoiceLines(tenant.tenantId, invoice.id),
      listQuoteLines(invoice.quoteId),
      getCompanySettingsByTenantId(tenant.tenantId),
    ]);
    const origin = invoiceEmailOrigin();
    const fallbackLogoUrl = origin ? `${origin}/brand/tender-edge-horizontal-logo-2025.png` : null;
    const clientAddress = typeof client?.payloadJson?.billingAddress === "string" ? client.payloadJson.billingAddress.trim() : null;
    const pdf = await buildInvoicePdf({
      invoice,
      lines: invoiceLines,
      quote,
      quoteLines,
      job: { jobNumber: job.jobNumber, title: job.title, clientName: job.clientName, myobOrderNumber: job.myobOrderNumber },
      company,
      companyLogoUrl: company?.companyLogoUrl || null,
      fallbackLogoUrl,
      clientAddress,
    });
    if (pdf.bytes.byteLength > 18 * 1024 * 1024) throw new Error(`Invoice PDF is ${(pdf.bytes.byteLength / 1024 / 1024).toFixed(1)}MB. Keep the PDF under 18MB so it can be delivered reliably by email.`);

    const companyName = company?.tradingName || company?.companyLegalName || tenant.tenantName || "Tender Edge";
    const invoiceNumber = invoice.myobNumber || invoice.invoiceNumber;
    const contactName = quote.contactName || quote.clientName || "there";
    const subject = `Invoice ${invoiceNumber} — ${job.title} — ${companyName}`;
    const emailLogoUrl = /tender\s*edge/i.test(companyName) && origin ? `${origin}/brand/tender-edge-horizontal-logo-2025.png` : company?.companyLogoUrl;
    const companyLogo = emailLogoUrl
      ? `<img src="${invoiceEmailEscape(emailLogoUrl)}" alt="${invoiceEmailEscape(companyName)}" style="display:block;max-width:390px;max-height:58px;width:auto;height:auto;border:0;outline:none;text-decoration:none" />`
      : `<div style="font-size:24px;line-height:1.1;font-weight:800;color:#123a63">${invoiceEmailEscape(companyName)}</div>`;
    const companyDetails = [company?.companyLegalName, company?.abn ? `ABN ${company.abn}` : null, company?.phone, company?.email, company?.address]
      .filter(Boolean).map((value) => invoiceEmailEscape(String(value))).join(" &nbsp;·&nbsp; ");
    const balance = invoice.myobBalanceDue != null ? Number(invoice.myobBalanceDue) : Number(invoice.grandTotal);
    const balanceText = invoiceMoney(Number.isFinite(balance) ? balance : invoice.grandTotal);
    const totalText = invoiceMoney(invoice.grandTotal);
    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;line-height:1.5">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f5f9;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #dfe7f2;border-radius:20px;overflow:hidden">
<tr><td style="padding:18px 28px;background:#ffffff;border-bottom:1px solid #d7e0eb">${companyLogo}</td></tr>
<tr><td style="padding:30px 32px 10px"><div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#18a7b5;margin-bottom:8px">Invoice</div><h1 style="margin:0;font-size:28px;line-height:1.2;color:#0f172a">${invoiceEmailEscape(job.title)}</h1><div style="margin-top:10px;font-size:15px;color:#64748b">Invoice ${invoiceEmailEscape(invoiceNumber)} &nbsp;·&nbsp; ${invoiceEmailEscape(quote.clientName || recipient)}</div></td></tr>
<tr><td style="padding:12px 32px 30px"><p style="margin:0 0 14px">Hi ${invoiceEmailEscape(contactName)},</p><p style="margin:0 0 18px;color:#475569">Please find attached invoice <strong>${invoiceEmailEscape(invoiceNumber)}</strong> from ${invoiceEmailEscape(companyName)} for <strong>${invoiceEmailEscape(job.title)}</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;border:1px solid #dbe4f0;border-radius:14px;background:#f8fbff"><tr><td style="padding:14px 16px"><div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase">Invoice total</div><div style="font-size:24px;font-weight:900;color:#0f172a">${invoiceEmailEscape(totalText)}</div></td><td style="padding:14px 16px;border-left:1px solid #dbe4f0"><div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase">Balance due</div><div style="font-size:24px;font-weight:900;color:#0f766e">${invoiceEmailEscape(balanceText)}</div></td></tr></table>
<div style="padding:14px 16px;border:1px solid #bbf7d0;border-radius:12px;background:#f0fdf4;color:#166534;font-size:12px"><strong>PDF invoice attached:</strong> ${invoiceEmailEscape(pdf.fileName)}</div></td></tr>
<tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px"><strong style="color:#334155">${invoiceEmailEscape(companyName)}</strong>${companyDetails ? `<br>${companyDetails}` : ""}</td></tr>
</table></td></tr></table></body></html>`;

    const sent = await sendOutboundEmail({
      fromName: `${companyName} Accounts`,
      to: recipient,
      subject,
      html,
      attachments: [{ fileName: pdf.fileName, content: pdf.bytes }],
      replyTo: company?.email || undefined,
      idempotencyKey: `invoice-${invoiceId}-${Date.now()}`,
      tags: [{ name: "Type", value: "Invoice" }, { name: "Invoice", value: invoiceNumber }],
    });
    await markInvoiceEmailSent(tenant.tenantId, invoiceId, { recipient, messageId: sent.messageId });
    await syncJobInvoiceStatusForTenant(tenant.tenantId, jobId, invoice.quoteId).catch(() => undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markInvoiceEmailFailed(tenant.tenantId, invoiceId, { recipient, error: message });
    revalidatePath(`/jobs/${jobId}/invoice`);
    redirectWith(jobId, "error", `Invoice email failed: ${message}`);
  }

  revalidatePath(`/jobs/${jobId}/invoice`);
  redirectWith(jobId, "message", `Invoice ${invoice.myobNumber || invoice.invoiceNumber} emailed to ${recipient}.`);
}
