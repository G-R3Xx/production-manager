"use server";

import { Buffer } from "node:buffer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getCompanySettingsByTenantId } from "@/server/company";
import { sendOutboundEmail } from "@/server/outbound-email";
import {
  addArtworkApprovalPageForTenant,
  artworkQuoteLineInScope,
  quoteUsesLineResponses,
  createArtworkApprovalFromQuote,
  getArtworkApprovalById,
  getQuoteDraftById,
  listArtworkApprovalPages,
  listQuoteLines,
  markArtworkApprovalInternallyApprovedForTenant,
  markArtworkApprovalSentForTenant,
  prefillArtworkApprovalPagesFromQuoteLines,
  removeArtworkApprovalPageForTenant,
  reopenArtworkApprovalPageForTenant,
  replaceArtworkApprovalPageProofForTenant,
  setArtworkApprovalStatusForTenant,
  startArtworkApprovalRevisionForTenant,
  updateArtworkApprovalDetailsForTenant,
  updateArtworkApprovalPagePmsColoursForTenant
} from "@/server/quotes";

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    redirect("/bootstrap?error=Create%20or%20select%20a%20tenant%20first");
  }
  return { user, activeTenant };
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

function publicArtworkUrl(token: string | null | undefined): string {
  return token ? `${appBaseUrl()}/public/artwork-approvals/${token}` : "";
}

function emailEscape(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nullable(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function oneLine(value: FormDataEntryValue | null, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function numberText(value: FormDataEntryValue | null, fallback = "1"): string {
  const cleaned = String(value ?? "").replace(/[^0-9.\-]/g, "").trim();
  if (!cleaned) return fallback;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : fallback;
}

const MAX_PROOF_FILE_SIZE_BYTES = 50 * 1024 * 1024;

async function uploadProofImageIfPresent(tenantId: string, approvalId: string, formData: FormData): Promise<{ imageUrl?: string; storagePath?: string; fileName?: string }> {
  const rawFile = formData.get("proofFile");
  if (!rawFile || typeof rawFile !== "object" || !("size" in rawFile) || !("arrayBuffer" in rawFile)) return {};

  const file = rawFile as unknown as { name?: string; type?: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
  if (!file.size || file.size <= 0) return {};
  if (file.size > MAX_PROOF_FILE_SIZE_BYTES) {
    throw new Error("Proof artwork is too large. Please keep uploads under 50MB, or paste a hosted proof URL instead.");
  }

  const safeName = String(file.name || "proof-image")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .slice(0, 120);
  const extension = safeName.includes(".") ? "" : ".png";
  const storagePath = `${tenantId}/artwork-approvals/${approvalId}/${Date.now()}-${safeName}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const supabase = getSupabaseServiceRoleClient();
  const bucket = "artwork-approvals";

  await supabase.storage.createBucket(bucket, { public: true }).catch(() => undefined);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Artwork proof upload failed: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { imageUrl: data.publicUrl, storagePath, fileName: safeName };
}

export async function createArtworkApprovalFromQuoteAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();

  if (!quoteId) {
    redirect("/artwork-approvals?error=Select%20a%20quote%20first");
  }

  const approval = await createArtworkApprovalFromQuote(activeTenant.tenantId, quoteId);
  redirect(`/artwork-approvals?selected=${approval.id}&message=Artwork%20approval%20created`);
}


export async function prefillArtworkApprovalPagesFromQuoteAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = oneLine(formData.get("approvalId"));
  if (!approvalId) redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20first");

  const before = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  const result = await prefillArtworkApprovalPagesFromQuoteLines(activeTenant.tenantId, approvalId);
  const after = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  const synced = result.created + result.updated;
  const quoteLabel = result.quoteNumber || "Source quote";
  let message = synced > 0
    ? `${quoteLabel} synced: ${result.created} added, ${result.updated} refreshed${result.outOfScope > 0 ? `, ${result.outOfScope} out of scope preserved` : ""}`
    : `${quoteLabel}: 0 artwork lines synced (${result.total} quote lines; ${result.approved} approved, ${result.cancelled} cancelled, ${result.pending} pending; quote status ${result.quoteStatus || "unknown"}).`;
  if (before?.status === "approved" && after?.status === "draft") {
    message += ` Approval reopened as Revision ${after.revision || "A"}; existing page decisions were retained and new pages require approval.`;
  }
  revalidatePath("/artwork-approvals");
  redirect(`/artwork-approvals?selected=${approvalId}&message=${encodeURIComponent(message)}`);
}

export async function replaceArtworkApprovalPageProofAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = oneLine(formData.get("approvalId"));
  const pageId = oneLine(formData.get("pageId"));
  const imageUrlFromInput = oneLine(formData.get("imageUrl"));
  const directStoragePath = nullable(formData.get("imageStoragePath"));
  const directFileName = nullable(formData.get("fileName"));

  if (!approvalId || !pageId) redirect("/artwork-approvals?error=Select%20an%20artwork%20page%20first");

  let uploaded: { imageUrl?: string; storagePath?: string; fileName?: string } = {};
  try {
    uploaded = await uploadProofImageIfPresent(activeTenant.tenantId, approvalId, formData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`/artwork-approvals?selected=${approvalId}&error=${encodeURIComponent(message)}`);
  }

  const imageUrl = uploaded.imageUrl || imageUrlFromInput;
  if (!imageUrl) {
    redirect(`/artwork-approvals?selected=${approvalId}&error=Upload%20a%20proof%20image%20or%20paste%20a%20proof%20URL`);
  }

  const before = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  await replaceArtworkApprovalPageProofForTenant(activeTenant.tenantId, approvalId, pageId, {
    imageUrl,
    imageStoragePath: uploaded.storagePath ?? directStoragePath,
    fileName: uploaded.fileName ?? directFileName
  });
  const after = await getArtworkApprovalById(activeTenant.tenantId, approvalId);

  const message = before?.status === "approved" && after?.status === "draft"
    ? `Proof updated. Approval reopened as Revision ${after.revision || "A"}; this page returned to pending and other page approvals were retained.`
    : "Proof updated. This page returned to pending approval.";
  revalidatePath("/artwork-approvals");
  redirect(`/artwork-approvals?selected=${approvalId}&message=${encodeURIComponent(message)}`);
}

export async function saveArtworkApprovalPmsColoursAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = oneLine(formData.get("approvalId"));
  const pageId = oneLine(formData.get("pageId"));
  const pageLabel = oneLine(formData.get("pageLabel"), "Proof page");
  if (!approvalId || !pageId) redirect("/artwork-approvals?error=Select%20an%20artwork%20proof%20page%20first");

  const result = await updateArtworkApprovalPagePmsColoursForTenant(
    activeTenant.tenantId,
    approvalId,
    pageId,
    nullable(formData.get("pmsColours")),
  );

  revalidatePath("/artwork-approvals");
  const message = result.revisionStarted
    ? `${pageLabel} PMS colours saved. Approval moved to Revision ${result.revision} for client re-approval.`
    : `${pageLabel} PMS colours saved for client approval.`;
  redirect(`/artwork-approvals?selected=${approvalId}&message=${encodeURIComponent(message)}`);
}

export async function saveArtworkApprovalDetailsAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = oneLine(formData.get("approvalId"));
  if (!approvalId) redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20first");

  const clientName = oneLine(formData.get("clientName"));
  if (!clientName) redirect(`/artwork-approvals?selected=${approvalId}&error=Client%20name%20is%20required`);

  await updateArtworkApprovalDetailsForTenant(activeTenant.tenantId, approvalId, {
    clientName,
    contactName: nullable(formData.get("contactName")),
    email: nullable(formData.get("email")),
    projectName: nullable(formData.get("projectName")),
    siteAddress: nullable(formData.get("siteAddress")),
    drawingTitle: nullable(formData.get("drawingTitle")),
    drawingNumber: nullable(formData.get("drawingNumber")),
    revision: nullable(formData.get("revision")),
    revisionNote: nullable(formData.get("revisionNote")),
    designerName: nullable(formData.get("designerName")),
    clientMessage: nullable(formData.get("clientMessage")),
    internalNotes: nullable(formData.get("internalNotes"))
  });

  redirect(`/artwork-approvals?selected=${approvalId}&message=Artwork%20details%20saved`);
}

export async function sendArtworkApprovalFromPageAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = String(formData.get("approvalId") ?? "").trim();

  if (!approvalId) {
    redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20first");
  }

  const approval = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  if (!approval) return redirect("/artwork-approvals?error=Artwork%20approval%20not%20found");
  const [pages, lines, sourceQuote] = await Promise.all([
    listArtworkApprovalPages(approvalId),
    listQuoteLines(approval.quoteId),
    getQuoteDraftById(activeTenant.tenantId, approval.quoteId)
  ]);
  const usesLineResponses = quoteUsesLineResponses(lines);
  const inScopeLineIds = new Set(lines
    .filter((line) => artworkQuoteLineInScope(line, sourceQuote?.status, usesLineResponses))
    .map((line) => line.id));
  const requiredPages = pages.filter((page) => !page.sourceQuoteLineId || inScopeLineIds.has(page.sourceQuoteLineId));
  const missingProof = requiredPages.some((page) => page.imageUrl.startsWith("data:image/svg+xml") || (!page.fileName && !page.imageStoragePath && /auto-created from quote line/i.test(page.notes ?? "")) || (approval.revision && page.proofRevision !== approval.revision));
  const missingSlots = [...inScopeLineIds].some((lineId) => !pages.some((page) => page.sourceQuoteLineId === lineId));

  if (!requiredPages.length || missingProof || missingSlots) {
    redirect(`/artwork-approvals?selected=${approvalId}&error=Artwork%20is%20not%20ready%20to%20send.%20Upload%20all%20required%20proofs%20and%20sync%20any%20missing%20quote%20lines%20first.`);
  }

  await markArtworkApprovalSentForTenant(activeTenant.tenantId, approvalId);
  revalidatePath("/artwork-approvals");
  redirect(`/artwork-approvals?selected=${approvalId}&message=Artwork%20approval%20marked%20as%20sent`);
}

export async function emailArtworkApprovalClientAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = oneLine(formData.get("approvalId"));
  if (!approvalId) redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20first");

  const approval = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  if (!approval) redirect("/artwork-approvals?error=Artwork%20approval%20not%20found");

  const recipient = String(approval.email ?? "").trim();
  if (!recipient || !recipient.includes("@")) {
    redirect(`/artwork-approvals?selected=${approvalId}&error=${encodeURIComponent("Artwork approval has no valid client email address.")}`);
  }

  const [pages, lines, sourceQuote, company] = await Promise.all([
    listArtworkApprovalPages(approvalId),
    listQuoteLines(approval.quoteId),
    getQuoteDraftById(activeTenant.tenantId, approval.quoteId),
    getCompanySettingsByTenantId(activeTenant.tenantId)
  ]);
  const usesLineResponses = quoteUsesLineResponses(lines);
  const inScopeLineIds = new Set(lines
    .filter((line) => artworkQuoteLineInScope(line, sourceQuote?.status, usesLineResponses))
    .map((line) => line.id));
  const requiredPages = pages.filter((page) => !page.sourceQuoteLineId || inScopeLineIds.has(page.sourceQuoteLineId));
  const missingProof = requiredPages.some((page) => page.imageUrl.startsWith("data:image/svg+xml") || (!page.fileName && !page.imageStoragePath && /auto-created from quote line/i.test(page.notes ?? "")) || (approval.revision && page.proofRevision !== approval.revision));
  const missingSlots = [...inScopeLineIds].some((lineId) => !pages.some((page) => page.sourceQuoteLineId === lineId));

  if (!requiredPages.length || missingProof || missingSlots) {
    redirect(`/artwork-approvals?selected=${approvalId}&error=Artwork%20is%20not%20ready%20to%20send.%20Upload%20all%20required%20proofs%20and%20sync%20any%20missing%20quote%20lines%20first.`);
  }

  const publicUrl = publicArtworkUrl(approval.publicToken);
  if (!publicUrl) {
    redirect(`/artwork-approvals?selected=${approvalId}&error=${encodeURIComponent("Artwork client link could not be generated.")}`);
  }

  const companyName = company?.tradingName || company?.companyLegalName || activeTenant.tenantName || "Tender Edge";
  const contactName = approval.contactName || approval.clientName || "there";
  const title = approval.projectName || sourceQuote?.jobName || approval.drawingTitle || "Artwork approval";
  const revision = approval.revision || "A";
  const quoteNumber = sourceQuote?.quoteNumber || "";
  const emailOrigin = new URL(publicUrl).origin;
  const tenderEdgeHorizontalLogoUrl = `${emailOrigin}/brand/tender-edge-horizontal-logo-2025.png`;
  const isTenderEdge = /tender\s*edge/i.test(companyName);
  const logoUrl = isTenderEdge ? tenderEdgeHorizontalLogoUrl : company?.companyLogoUrl;
  const logo = logoUrl
    ? `<img src="${emailEscape(logoUrl)}" alt="${emailEscape(companyName)}" style="display:block;max-width:390px;max-height:58px;width:auto;height:auto;border:0;outline:none;text-decoration:none" />`
    : `<div style="font-size:24px;line-height:1.1;font-weight:800;color:#123a63">${emailEscape(companyName)}</div>`;
  const companyDetails = [company?.companyLegalName, company?.abn ? `ABN ${company.abn}` : null, company?.phone, company?.email, company?.address]
    .filter(Boolean)
    .map((value) => emailEscape(String(value)))
    .join(" &nbsp;·&nbsp; ");
  const subject = `${title} — Artwork approval${revision ? ` Rev ${revision}` : ""}`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;line-height:1.5">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f5f9;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #dfe7f2;border-radius:20px;overflow:hidden">
          <tr><td style="padding:18px 28px;background:#ffffff;border-bottom:1px solid #d7e0eb">${logo}</td></tr>
          <tr><td style="padding:30px 32px 12px">
            <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#18a7b5;margin-bottom:8px">Artwork ready for review</div>
            <h1 style="margin:0;font-size:28px;line-height:1.2;color:#0f172a">${emailEscape(title)}</h1>
            <div style="margin-top:10px;font-size:15px;color:#64748b">${quoteNumber ? `${emailEscape(quoteNumber)} &nbsp;·&nbsp; ` : ""}Revision ${emailEscape(revision)} &nbsp;·&nbsp; ${emailEscape(approval.clientName || recipient)}</div>
          </td></tr>
          <tr><td style="padding:12px 32px 30px">
            <p style="margin:0 0 14px">Hi ${emailEscape(contactName)},</p>
            <p style="margin:0 0 22px;color:#475569">Your artwork proof is ready for review. Please check each proof page and approve the artwork or request changes directly from the approval page.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px"><tr><td style="border-radius:12px;background:#0f766e">
              <a href="${emailEscape(publicUrl)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800">Review artwork proof</a>
            </td></tr></table>
            <div style="padding:14px 16px;border:1px solid #dbe4f0;border-radius:12px;background:#f8fbff;color:#64748b;font-size:12px;word-break:break-all">
              If the button does not open, use this link:<br><a href="${emailEscape(publicUrl)}" style="color:#0f766e">${emailEscape(publicUrl)}</a>
            </div>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">
            <strong style="color:#334155">${emailEscape(companyName)}</strong>${companyDetails ? `<br>${companyDetails}` : ""}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  try {
    await sendOutboundEmail({
      fromName: `${companyName} Artwork`,
      to: recipient,
      subject,
      html,
      replyTo: company?.email || undefined,
      idempotencyKey: `artwork-${approvalId}-${Date.now()}`,
      tags: [
        { name: "Type", value: "Artwork-Approval" },
        { name: "Revision", value: revision },
        ...(quoteNumber ? [{ name: "Quote", value: quoteNumber }] : [])
      ]
    });
    await markArtworkApprovalSentForTenant(activeTenant.tenantId, approvalId);
    revalidatePath("/artwork-approvals");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/artwork-approvals?selected=${approvalId}&error=${encodeURIComponent(`Artwork email failed: ${message}`)}`);
  }

  redirect(`/artwork-approvals?selected=${approvalId}&message=${encodeURIComponent(`Artwork approval emailed to ${recipient}`)}`);
}

export async function startArtworkApprovalRevisionAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = oneLine(formData.get("approvalId"));
  if (!approvalId) redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20first");
  let revision = "";
  try {
    revision = await startArtworkApprovalRevisionForTenant(activeTenant.tenantId, approvalId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return redirect(`/artwork-approvals?selected=${approvalId}&error=${encodeURIComponent(message)}`);
  }
  redirect(`/artwork-approvals?selected=${approvalId}&message=${encodeURIComponent(`Revision ${revision} started. Upload the revised proofs, then resend the client link.`)}`);
}

export async function reopenArtworkApprovalPageAction(formData: FormData): Promise<void> {
  const { user, activeTenant } = await requireTenant();
  const approvalId = oneLine(formData.get("approvalId"));
  const pageId = oneLine(formData.get("pageId"));
  const pageLabel = oneLine(formData.get("pageLabel"), "Proof page");
  if (!approvalId || !pageId) redirect("/artwork-approvals?error=Select%20an%20artwork%20proof%20page%20first");

  let result: Awaited<ReturnType<typeof reopenArtworkApprovalPageForTenant>> | null = null;
  try {
    result = await reopenArtworkApprovalPageForTenant(
      activeTenant.tenantId,
      approvalId,
      pageId,
      `${pageLabel} was reopened by ${user.email || "staff"}.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/artwork-approvals?selected=${approvalId}&error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/artwork-approvals");
  const message = result?.reopened
    ? `${pageLabel} reopened. Revision ${result.revision} started and active production paused pending re-approval.`
    : `${pageLabel} approval cleared and returned to pending.`;
  redirect(`/artwork-approvals?selected=${approvalId}&message=${encodeURIComponent(message)}`);
}

export async function directApproveArtworkApprovalAction(formData: FormData): Promise<void> {
  const { user, activeTenant } = await requireTenant();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  if (!approvalId) redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20first");

  const approval = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  if (!approval) return redirect("/artwork-approvals?error=Artwork%20approval%20not%20found");
  const [pages, lines, sourceQuote] = await Promise.all([
    listArtworkApprovalPages(approvalId),
    listQuoteLines(approval.quoteId),
    getQuoteDraftById(activeTenant.tenantId, approval.quoteId)
  ]);
  const usesLineResponses = quoteUsesLineResponses(lines);
  const inScopeLineIds = new Set(lines
    .filter((line) => artworkQuoteLineInScope(line, sourceQuote?.status, usesLineResponses))
    .map((line) => line.id));
  const requiredPages = pages.filter((page) => !page.sourceQuoteLineId || inScopeLineIds.has(page.sourceQuoteLineId));
  const missingProof = requiredPages.some((page) => page.imageUrl.startsWith("data:image/svg+xml") || (!page.fileName && !page.imageStoragePath && /auto-created from quote line/i.test(page.notes ?? "")) || (approval.revision && page.proofRevision !== approval.revision));
  const missingSlots = [...inScopeLineIds].some((lineId) => !pages.some((page) => page.sourceQuoteLineId === lineId));
  if (!requiredPages.length || missingProof || missingSlots) {
    redirect(`/artwork-approvals?selected=${approvalId}&error=Artwork%20is%20not%20ready%20for%20approval.%20Upload%20all%20required%20proofs%20first.`);
  }

  await markArtworkApprovalInternallyApprovedForTenant(activeTenant.tenantId, approvalId, user.email ?? null);
  redirect(`/artwork-approvals?selected=${approvalId}&message=Artwork%20approved%20internally`);
}

export async function addArtworkApprovalPageFromPageAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = oneLine(formData.get("approvalId"));
  const title = oneLine(formData.get("title"));
  const imageUrlFromInput = oneLine(formData.get("imageUrl"));
  const directStoragePath = nullable(formData.get("imageStoragePath"));
  const directFileName = nullable(formData.get("fileName"));

  if (!approvalId) {
    redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20first");
  }

  let uploaded: { imageUrl?: string; storagePath?: string; fileName?: string } = {};
  try {
    uploaded = await uploadProofImageIfPresent(activeTenant.tenantId, approvalId, formData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`/artwork-approvals?selected=${approvalId}&error=${encodeURIComponent(message)}`);
  }

  const imageUrl = uploaded.imageUrl || imageUrlFromInput;
  if (!title || !imageUrl) {
    redirect(`/artwork-approvals?selected=${approvalId}&error=Proof%20title%20and%20image%20are%20required`);
  }

  const before = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  await addArtworkApprovalPageForTenant(activeTenant.tenantId, approvalId, {
    title,
    signCode: nullable(formData.get("signCode")),
    description: nullable(formData.get("description")),
    imageUrl,
    imageStoragePath: uploaded.storagePath ?? directStoragePath,
    fileName: uploaded.fileName ?? directFileName,
    notes: nullable(formData.get("notes")),
    productionType: oneLine(formData.get("productionType"), "signage"),
    quantity: numberText(formData.get("quantity"), "1"),
    colourSummary: nullable(formData.get("colourSummary")),
    sizeSummary: nullable(formData.get("sizeSummary")),
    substrateSummary: nullable(formData.get("substrateSummary")),
    installSummary: nullable(formData.get("installSummary")),
    smallFormatSummary: nullable(formData.get("smallFormatSummary"))
  });
  const after = await getArtworkApprovalById(activeTenant.tenantId, approvalId);

  const message = before?.status === "approved" && after?.status === "draft"
    ? `Proof page added. Approval reopened as Revision ${after.revision || "A"}; existing page approvals were retained and the new page is pending.`
    : "Proof page added and awaiting a client decision.";
  revalidatePath("/artwork-approvals");
  redirect(`/artwork-approvals?selected=${approvalId}&message=${encodeURIComponent(message)}`);
}

export async function removeArtworkApprovalPageFromPageAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  const pageId = String(formData.get("pageId") ?? "").trim();

  if (!approvalId || !pageId) {
    redirect("/artwork-approvals?error=Select%20an%20artwork%20page%20to%20remove");
  }

  const before = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  await removeArtworkApprovalPageForTenant(activeTenant.tenantId, approvalId, pageId);
  const after = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  const message = before?.status === "approved" && after?.status === "draft"
    ? `Proof page removed. Approval reopened as Revision ${after.revision || "A"}; remaining page approvals were retained.`
    : "Proof page removed.";
  revalidatePath("/artwork-approvals");
  redirect(`/artwork-approvals?selected=${approvalId}&message=${encodeURIComponent(message)}`);
}


export async function deleteArtworkApprovalAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = oneLine(formData.get("approvalId"));
  if (!approvalId) redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20to%20delete");

  await setArtworkApprovalStatusForTenant(activeTenant.tenantId, approvalId, "deleted");
  redirect("/artwork-approvals?message=Artwork%20approval%20deleted%20from%20the%20active%20list");
}

export async function restoreArtworkApprovalAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = oneLine(formData.get("approvalId"));
  if (!approvalId) redirect("/artwork-approvals?filter=deleted&error=Select%20an%20artwork%20approval%20to%20restore");

  await setArtworkApprovalStatusForTenant(activeTenant.tenantId, approvalId, "draft");
  redirect(`/artwork-approvals?selected=${approvalId}&message=Artwork%20approval%20restored`);
}
