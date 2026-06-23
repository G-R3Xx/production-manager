"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  addArtworkApprovalPageForTenant,
  addQuoteLine,
  createArtworkApprovalFromQuote,
  createQuoteDraftForTenant,
  deleteQuoteLineForTenant,
  markArtworkApprovalSentForTenant,
  markQuoteSentForTenant,
  removeArtworkApprovalPageForTenant
} from "@/server/quotes";
import { getProductById } from "@/server/products";

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

export async function createQuoteDraftAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const clientName = String(formData.get("clientName") ?? "").trim();

  if (!clientName) {
    redirect("/quotes?error=Client%20name%20is%20required");
  }

  const created = await createQuoteDraftForTenant(activeTenant.tenantId, {
    enquiryId: nullable(formData.get("enquiryId")),
    surveyRequestId: nullable(formData.get("surveyRequestId")),
    linkedCustomerId: nullable(formData.get("linkedCustomerId")),
    clientName,
    contactName: nullable(formData.get("contactName")),
    email: nullable(formData.get("email")),
    phone: nullable(formData.get("phone")),
    discountPercent: nullable(formData.get("discountPercent")) ?? "0",
    notes: nullable(formData.get("notes"))
  });

  redirect(`/quotes?selected=${created.id}&message=Quote%20draft%20created`);
}

export async function addQuoteLineAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const formProductName = String(formData.get("productName") ?? "").trim();
  const quantity = String(formData.get("quantity") ?? "1").trim();
  const unitPrice = String(formData.get("unitPrice") ?? "0").trim();

  if (!quoteId) {
    redirect("/quotes?error=Select%20a%20quote%20first");
  }

  let productName = formProductName || "Custom material quote line";
  let savedProductId: string | null = null;

  if (productId) {
    const product = await getProductById(activeTenant.tenantId, productId);
    if (!product) {
      redirect(`/quotes?selected=${quoteId}&error=Selected%20product%20was%20not%20found`);
    }
    savedProductId = product.id;
    productName = product.name;
  }

  await addQuoteLine(quoteId, {
    productId: savedProductId,
    productName,
    optionSummary: nullable(formData.get("optionSummary")),
    quantity,
    unitPrice,
    notes: nullable(formData.get("notes"))
  });

  redirect(`/quotes?selected=${quoteId}&message=Quote%20line%20added`);
}

export async function deleteQuoteLineAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const lineId = String(formData.get("lineId") ?? "").trim();

  if (!quoteId || !lineId) {
    redirect("/quotes?error=Select%20a%20saved%20quote%20line%20to%20remove");
  }

  await deleteQuoteLineForTenant(activeTenant.tenantId, quoteId, lineId);

  redirect(`/quotes?selected=${quoteId}&message=Saved%20quote%20line%20removed`);
}

export async function markQuoteSentAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) redirect("/quotes?error=Select%20a%20quote%20first");

  await markQuoteSentForTenant(activeTenant.tenantId, quoteId);
  redirect(`/quotes?selected=${quoteId}&message=Quote%20marked%20as%20sent`);
}

export async function createArtworkApprovalAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) redirect("/quotes?error=Select%20a%20quote%20first");

  const approval = await createArtworkApprovalFromQuote(activeTenant.tenantId, quoteId);
  redirect(`/artwork-approvals?selected=${approval.id}&message=Artwork%20approval%20created`);
}

export async function sendArtworkApprovalAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  if (!quoteId || !approvalId) redirect("/quotes?error=Select%20an%20artwork%20approval%20first");

  await markArtworkApprovalSentForTenant(activeTenant.tenantId, approvalId);
  redirect(`/quotes?selected=${quoteId}&message=Artwork%20approval%20marked%20as%20sent`);
}

export async function addArtworkApprovalPageAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const notes = nullable(formData.get("notes"));

  if (!quoteId || !approvalId) redirect("/quotes?error=Select%20an%20artwork%20approval%20first");
  if (!title || !imageUrl) redirect(`/quotes?selected=${quoteId}&error=Artwork%20title%20and%20image%20URL%20are%20required`);

  await addArtworkApprovalPageForTenant(activeTenant.tenantId, approvalId, { title, imageUrl, notes });
  redirect(`/quotes?selected=${quoteId}&message=Artwork%20page%20added`);
}

export async function removeArtworkApprovalPageAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  const pageId = String(formData.get("pageId") ?? "").trim();

  if (!quoteId || !approvalId || !pageId) redirect("/quotes?error=Select%20an%20artwork%20page%20to%20remove");

  await removeArtworkApprovalPageForTenant(activeTenant.tenantId, approvalId, pageId);
  redirect(`/quotes?selected=${quoteId}&message=Artwork%20page%20removed`);
}
