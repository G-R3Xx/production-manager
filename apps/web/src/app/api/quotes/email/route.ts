import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  ensureQuotePublicIdentityForTenant,
  getQuoteDraftById,
  listQuoteLines,
  markQuoteEmailFailedForTenant,
  markQuoteEmailPendingForTenant,
  markQuoteEmailSentForTenant,
  markQuoteSentForTenant,
} from "@/server/quotes";
import { getCompanySettingsByTenantId } from "@/server/company";
import { customerLogoUrl, getCustomerById } from "@/server/customers";
import { getEnquiryById } from "@/server/enquiries";
import { getSurveyRequestById } from "@/server/surveys";
import { buildQuotePdf } from "@/server/quote-pdf";
import { sendOutboundEmail } from "@/server/outbound-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";
export const maxDuration = 60;

function publicUrlForQuote(token: string): string {
  const explicit = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  const base = explicit || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!base) throw new Error("Production Manager public URL is not configured. Add NEXT_PUBLIC_APP_URL to the deployment.");
  return `${base}/public/quotes/${encodeURIComponent(token)}`;
}

function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let quoteId = "";
  let recipient = "";
  try {
    const formData = await request.formData();
    quoteId = String(formData.get("quoteId") ?? "").trim();
    if (!quoteId) return NextResponse.json({ ok: false, error: "Select a quote first." }, { status: 400 });

    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Your session has expired. Sign in again." }, { status: 401 });
    const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
    if (!activeTenant) return NextResponse.json({ ok: false, error: "No active Production Manager workspace is available." }, { status: 403 });

    const initialQuote = await getQuoteDraftById(activeTenant.tenantId, quoteId);
    if (!initialQuote) return NextResponse.json({ ok: false, error: "Quote not found." }, { status: 404 });

    const initialLines = await listQuoteLines(quoteId);
    const hasUnconfiguredSurveyLines = initialLines.some((line) => {
      const snapshot = line.configurationSnapshot && typeof line.configurationSnapshot === "object" && !Array.isArray(line.configurationSnapshot)
        ? line.configurationSnapshot as Record<string, unknown>
        : null;
      return snapshot?.surveyNeedsConfiguration === true;
    });
    if (hasUnconfiguredSurveyLines) {
      return NextResponse.json({ ok: false, error: "Configure and price every surveyed sign line before emailing the quote." }, { status: 400 });
    }

    const requestedRecipient = String(formData.get("recipientEmail") ?? "").trim();
    recipient = requestedRecipient || String(initialQuote.email ?? "").trim();
    if (!recipient || !recipient.includes("@")) {
      await markQuoteEmailFailedForTenant(activeTenant.tenantId, quoteId, { recipient, error: "Enter a valid quote recipient email address." });
      return NextResponse.json({ ok: false, error: "Enter a valid quote recipient email address." }, { status: 400 });
    }

    await ensureQuotePublicIdentityForTenant(activeTenant.tenantId, quoteId);
    const quote = await getQuoteDraftById(activeTenant.tenantId, quoteId);
    if (!quote?.publicToken) {
      await markQuoteEmailFailedForTenant(activeTenant.tenantId, quoteId, { recipient, error: "Quote public link could not be generated." });
      return NextResponse.json({ ok: false, error: "Quote public link could not be generated." }, { status: 500 });
    }

    await markQuoteEmailPendingForTenant(activeTenant.tenantId, quoteId, recipient);

    try {
      const [company, linkedClient, sourceSurvey] = await Promise.all([
        getCompanySettingsByTenantId(activeTenant.tenantId),
        getCustomerById(activeTenant.tenantId, quote.linkedCustomerId),
        quote.surveyRequestId ? getSurveyRequestById(activeTenant.tenantId, quote.surveyRequestId) : Promise.resolve(null),
      ]);
      const sourceEnquiryId = quote.enquiryId || sourceSurvey?.enquiryId || null;
      const sourceEnquiry = sourceEnquiryId ? await getEnquiryById(activeTenant.tenantId, sourceEnquiryId) : null;
      const clientAddressValue = linkedClient?.payloadJson?.billingAddress;
      const defaultSiteAddressValue = linkedClient?.payloadJson?.defaultSiteAddress;
      const clientAddress = typeof clientAddressValue === "string" ? clientAddressValue.trim() : null;
      const siteAddress = sourceSurvey?.siteAddress || sourceEnquiry?.siteAddress || (typeof defaultSiteAddressValue === "string" ? defaultSiteAddressValue.trim() : null);
      const clientLogo = sourceEnquiry?.clientLogoUrl || customerLogoUrl(linkedClient) || null;
      const clientPurchaseOrderNumber = sourceEnquiry?.clientPurchaseOrderNumber || quote.clientPurchaseOrderNumber || null;
      const publicUrl = publicUrlForQuote(quote.publicToken);
      const companyName = company?.tradingName || company?.companyLegalName || activeTenant.tenantName || "Tender Edge";
      const contactName = quote.contactName || quote.clientName || "there";
      const title = quote.jobName || quote.quoteNumber || "Your quote";
      const quoteNumber = quote.quoteNumber || "Quote";
      const subject = `${quoteNumber} — ${title}`;
      const emailOrigin = new URL(publicUrl).origin;
      const tenderEdgeHorizontalLogoUrl = `${emailOrigin}/brand/tender-edge-horizontal-logo-2025.png`;
      const isTenderEdge = /tender\s*edge/i.test(companyName);
      const quoteEmailLogoUrl = isTenderEdge ? tenderEdgeHorizontalLogoUrl : company?.companyLogoUrl;

      let quotePdf: Awaited<ReturnType<typeof buildQuotePdf>>;
      try {
        quotePdf = await buildQuotePdf({
          quote,
          lines: initialLines,
          company,
          companyLogoUrl: company?.companyLogoUrl || quoteEmailLogoUrl || null,
          fallbackLogoUrl: tenderEdgeHorizontalLogoUrl,
          clientLogoUrl: clientLogo,
          clientAddress,
          siteAddress,
          clientPurchaseOrderNumber,
        });
        if (quotePdf.bytes.byteLength > 18 * 1024 * 1024) {
          throw new Error(`Quote PDF is ${(quotePdf.bytes.byteLength / 1024 / 1024).toFixed(1)}MB. Keep the PDF under 18MB so it can be delivered reliably by email.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Quote PDF could not be prepared: ${message}`);
      }

      const companyLogo = quoteEmailLogoUrl
        ? `<img src="${esc(quoteEmailLogoUrl)}" alt="${esc(companyName)}" style="display:block;max-width:390px;max-height:58px;width:auto;height:auto;border:0;outline:none;text-decoration:none" />`
        : `<div style="font-size:24px;line-height:1.1;font-weight:800;color:#123a63">${esc(companyName)}</div>`;
      const companyDetails = [company?.companyLegalName, company?.abn ? `ABN ${company.abn}` : null, company?.phone, company?.email, company?.address]
        .filter(Boolean)
        .map((value) => esc(String(value)))
        .join(" &nbsp;·&nbsp; ");
      const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;line-height:1.5">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f5f9;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #dfe7f2;border-radius:20px;overflow:hidden">
<tr><td style="padding:18px 28px;background:#ffffff;border-bottom:1px solid #d7e0eb">${companyLogo}</td></tr>
<tr><td style="padding:30px 32px 12px"><div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#18a7b5;margin-bottom:8px">Quote ready for review</div><h1 style="margin:0;font-size:28px;line-height:1.2;color:#0f172a">${esc(title)}</h1><div style="margin-top:10px;font-size:15px;color:#64748b">${esc(quoteNumber)} &nbsp;·&nbsp; ${esc(quote.clientName || recipient)}</div></td></tr>
<tr><td style="padding:12px 32px 30px"><p style="margin:0 0 14px">Hi ${esc(contactName)},</p><p style="margin:0 0 14px;color:#475569">Your ${esc(companyName)} quote is ready. A PDF copy of the quote is attached to this email.</p><p style="margin:0 0 22px;color:#475569">You can review each item and approve it, cancel it, or request changes directly from the quote page. <strong>If your organisation blocks external web links, please review the attached PDF and reply to this email with APPROVED or the changes required.</strong></p><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px"><tr><td style="border-radius:12px;background:#0f766e"><a href="${esc(publicUrl)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800">View and respond to quote</a></td></tr></table><div style="padding:14px 16px;border:1px solid #dbe4f0;border-radius:12px;background:#f8fbff;color:#64748b;font-size:12px;word-break:break-all">If the button does not open, use this link:<br><a href="${esc(publicUrl)}" style="color:#0f766e">${esc(publicUrl)}</a></div><div style="margin-top:12px;padding:14px 16px;border:1px solid #bbf7d0;border-radius:12px;background:#f0fdf4;color:#166534;font-size:12px"><strong>PDF quote attached:</strong> ${esc(quotePdf.fileName)}</div></td></tr>
<tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px"><strong style="color:#334155">${esc(companyName)}</strong>${companyDetails ? `<br>${companyDetails}` : ""}</td></tr>
</table></td></tr></table></body></html>`;

      const sent = await sendOutboundEmail({
        fromName: `${companyName} Quotes`,
        to: recipient,
        subject,
        html,
        attachments: [{ fileName: quotePdf.fileName, content: quotePdf.bytes }],
        replyTo: company?.email || undefined,
        idempotencyKey: `quote-${quoteId}-${Date.now()}`,
        tags: [{ name: "Type", value: "Quote" }, { name: "Quote", value: quoteNumber }],
      });
      await markQuoteSentForTenant(activeTenant.tenantId, quoteId);
      await markQuoteEmailSentForTenant(activeTenant.tenantId, quoteId, { recipient, messageId: sent.messageId });

      const message = `Quote emailed to ${recipient}`;
      console.info("[quote-email-api]", { quoteId, recipient, elapsedMs: Date.now() - startedAt, region: process.env.VERCEL_REGION ?? null });
      return NextResponse.json({ ok: true, message, elapsedMs: Date.now() - startedAt }, { status: 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markQuoteEmailFailedForTenant(activeTenant.tenantId, quoteId, { recipient, error: message });
      return NextResponse.json({ ok: false, error: `Quote email failed: ${message}`, elapsedMs: Date.now() - startedAt }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quote email could not be sent.";
    console.error("[quote-email-api]", { quoteId, recipient, elapsedMs: Date.now() - startedAt, error: message });
    return NextResponse.json({ ok: false, error: message, elapsedMs: Date.now() - startedAt }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
