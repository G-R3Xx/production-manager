import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getCompanySettingsByTenantId } from "@/server/company";
import { getCustomerById } from "@/server/customers";
import { getInvoiceById, listInvoiceLines } from "@/server/invoicing";
import { buildInvoicePdf } from "@/server/invoice-pdf";
import { getJobById } from "@/server/jobs";
import { getQuoteDraftById, listQuoteLines } from "@/server/quotes";

export const runtime = "nodejs";

const INVOICE_ROLES = new Set(["owner", "manager", "accounts"]);

type RouteContext = { params: Promise<{ id: string; invoiceId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant || !INVOICE_ROLES.has(tenant.tenantRole)) return new Response("Not authorised", { status: 403 });
  const { id: jobId, invoiceId } = await context.params;
  const [job, invoice] = await Promise.all([
    getJobById(tenant.tenantId, jobId),
    getInvoiceById(tenant.tenantId, invoiceId),
  ]);
  if (!job || !invoice || invoice.jobId !== job.id || invoice.tenantId !== tenant.tenantId) return new Response("Invoice not found", { status: 404 });
  const [quote, invoiceLines, company] = await Promise.all([
    getQuoteDraftById(tenant.tenantId, invoice.quoteId),
    listInvoiceLines(tenant.tenantId, invoice.id),
    getCompanySettingsByTenantId(tenant.tenantId),
  ]);
  if (!quote) return new Response("Accepted quote not found", { status: 404 });
  const [quoteLines, client] = await Promise.all([
    listQuoteLines(invoice.quoteId),
    getCustomerById(tenant.tenantId, quote.linkedCustomerId),
  ]);
  const origin = new URL(request.url).origin;
  const fallbackLogoUrl = `${origin}/brand/tender-edge-horizontal-logo-2025.png`;
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
  return new Response(new Uint8Array(pdf.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
