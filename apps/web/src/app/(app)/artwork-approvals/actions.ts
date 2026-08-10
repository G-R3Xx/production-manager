"use server";

import { Buffer } from "node:buffer";
import { redirect } from "next/navigation";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  addArtworkApprovalPageForTenant,
  artworkQuoteLineKind,
  createArtworkApprovalFromQuote,
  getArtworkApprovalById,
  listArtworkApprovalPages,
  listQuoteLines,
  markArtworkApprovalInternallyApprovedForTenant,
  markArtworkApprovalSentForTenant,
  prefillArtworkApprovalPagesFromQuoteLines,
  removeArtworkApprovalPageForTenant,
  replaceArtworkApprovalPageProofForTenant,
  setArtworkApprovalStatusForTenant,
  startArtworkApprovalRevisionForTenant,
  updateArtworkApprovalDetailsForTenant
} from "@/server/quotes";

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    redirect("/bootstrap?error=Create%20or%20select%20a%20tenant%20first");
  }
  return { user, activeTenant };
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

  const result = await prefillArtworkApprovalPagesFromQuoteLines(activeTenant.tenantId, approvalId);
  const message = result.created > 0
    ? `${result.created} quote line${result.created === 1 ? "" : "s"} added as artwork page${result.created === 1 ? "" : "s"}`
    : "No new sign or small-format quote lines to add";
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

  await replaceArtworkApprovalPageProofForTenant(activeTenant.tenantId, approvalId, pageId, {
    imageUrl,
    imageStoragePath: uploaded.storagePath ?? directStoragePath,
    fileName: uploaded.fileName ?? directFileName
  });

  redirect(`/artwork-approvals?selected=${approvalId}&message=Proof%20image%20updated`);
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
  const [pages, lines] = await Promise.all([listArtworkApprovalPages(approvalId), listQuoteLines(approval.quoteId)]);
  const usesLineResponses = lines.some((line) => line.clientResponseStatus && line.clientResponseStatus !== "pending");
  const inScopeLineIds = new Set(lines.filter((line) => {
    if (!artworkQuoteLineKind(line)) return false;
    if (line.clientResponseStatus === "cancelled") return false;
    if (usesLineResponses && line.clientResponseStatus !== "approved") return false;
    return true;
  }).map((line) => line.id));
  const requiredPages = pages.filter((page) => !page.sourceQuoteLineId || inScopeLineIds.has(page.sourceQuoteLineId));
  const missingProof = requiredPages.some((page) => page.imageUrl.startsWith("data:image/svg+xml") || (!page.fileName && !page.imageStoragePath && /auto-created from quote line/i.test(page.notes ?? "")) || (approval.revision && page.proofRevision !== approval.revision));
  const missingSlots = [...inScopeLineIds].some((lineId) => !pages.some((page) => page.sourceQuoteLineId === lineId));

  if (!requiredPages.length || missingProof || missingSlots) {
    redirect(`/artwork-approvals?selected=${approvalId}&error=Artwork%20is%20not%20ready%20to%20send.%20Upload%20all%20required%20proofs%20and%20sync%20any%20missing%20quote%20lines%20first.`);
  }

  await markArtworkApprovalSentForTenant(activeTenant.tenantId, approvalId);
  redirect(`/artwork-approvals?selected=${approvalId}&message=Artwork%20approval%20marked%20as%20sent`);
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

export async function directApproveArtworkApprovalAction(formData: FormData): Promise<void> {
  const { user, activeTenant } = await requireTenant();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  if (!approvalId) redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20first");

  const approval = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  if (!approval) return redirect("/artwork-approvals?error=Artwork%20approval%20not%20found");
  const [pages, lines] = await Promise.all([listArtworkApprovalPages(approvalId), listQuoteLines(approval.quoteId)]);
  const usesLineResponses = lines.some((line) => line.clientResponseStatus && line.clientResponseStatus !== "pending");
  const inScopeLineIds = new Set(lines.filter((line) => {
    if (!artworkQuoteLineKind(line)) return false;
    if (line.clientResponseStatus === "cancelled") return false;
    if (usesLineResponses && line.clientResponseStatus !== "approved") return false;
    return true;
  }).map((line) => line.id));
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

  redirect(`/artwork-approvals?selected=${approvalId}&message=Proof%20page%20added`);
}

export async function removeArtworkApprovalPageFromPageAction(formData: FormData): Promise<void> {
  const { activeTenant } = await requireTenant();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  const pageId = String(formData.get("pageId") ?? "").trim();

  if (!approvalId || !pageId) {
    redirect("/artwork-approvals?error=Select%20an%20artwork%20page%20to%20remove");
  }

  await removeArtworkApprovalPageForTenant(activeTenant.tenantId, approvalId, pageId);
  redirect(`/artwork-approvals?selected=${approvalId}&message=Proof%20page%20removed`);
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
