
"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { addQuoteLine, createQuoteDraftForTenant } from "@/server/quotes";
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
  const quantity = String(formData.get("quantity") ?? "1").trim();
  const unitPrice = String(formData.get("unitPrice") ?? "0").trim();

  if (!quoteId || !productId) {
    redirect("/quotes?error=Select%20a%20quote%20and%20a%20base%20product");
  }

  const product = await getProductById(activeTenant.tenantId, productId);
  if (!product) {
    redirect(`/quotes?selected=${quoteId}&error=Selected%20product%20was%20not%20found`);
  }

  await addQuoteLine(quoteId, {
    productId,
    productName: product.name,
    optionSummary: nullable(formData.get("optionSummary")),
    quantity,
    unitPrice,
    notes: nullable(formData.get("notes"))
  });

  redirect(`/quotes?selected=${quoteId}&message=Quote%20line%20added`);
}
