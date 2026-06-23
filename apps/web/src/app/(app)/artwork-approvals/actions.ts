"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  addArtworkApprovalPageForTenant,
  createArtworkApprovalFromQuote,
  markArtworkApprovalSentForTenant,
  removeArtworkApprovalPageForTenant
} from "@/server/quotes";

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

export async function createArtworkApprovalFromQuoteAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();

  if (!quoteId) {
    redirect("/artwork-approvals?error=Select%20a%20quote%20first");
  }

  const approval = await createArtworkApprovalFromQuote(activeTenant.tenantId, quoteId);
  redirect(`/artwork-approvals?selected=${approval.id}&message=Artwork%20approval%20created`);
}

export async function sendArtworkApprovalFromPageAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const approvalId = String(formData.get("approvalId") ?? "").trim();

  if (!approvalId) {
    redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20first");
  }

  await markArtworkApprovalSentForTenant(activeTenant.tenantId, approvalId);
  redirect(`/artwork-approvals?selected=${approvalId}&message=Artwork%20approval%20marked%20as%20sent`);
}

export async function addArtworkApprovalPageFromPageAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const notes = nullable(formData.get("notes"));

  if (!approvalId) {
    redirect("/artwork-approvals?error=Select%20an%20artwork%20approval%20first");
  }

  if (!title || !imageUrl) {
    redirect(`/artwork-approvals?selected=${approvalId}&error=Artwork%20title%20and%20image%20URL%20are%20required`);
  }

  await addArtworkApprovalPageForTenant(activeTenant.tenantId, approvalId, { title, imageUrl, notes });
  redirect(`/artwork-approvals?selected=${approvalId}&message=Artwork%20page%20added`);
}

export async function removeArtworkApprovalPageFromPageAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  const pageId = String(formData.get("pageId") ?? "").trim();

  if (!approvalId || !pageId) {
    redirect("/artwork-approvals?error=Select%20an%20artwork%20page%20to%20remove");
  }

  await removeArtworkApprovalPageForTenant(activeTenant.tenantId, approvalId, pageId);
  redirect(`/artwork-approvals?selected=${approvalId}&message=Artwork%20page%20removed`);
}
