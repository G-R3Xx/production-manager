"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createDraftQuote } from "@/server/quotes";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createDraftQuoteAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect('/bootstrap');
  }

  const lineTitle = readString(formData, 'lineTitle');
  if (!lineTitle) {
    redirect('/quotes?error=Line%20title%20is%20required');
  }

  await createDraftQuote({
    tenantId: activeTenant.tenantId,
    customerId: readString(formData, 'customerId') || null,
    title: readString(formData, 'title') || null,
    attentionName: readString(formData, 'attentionName') || null,
    siteAddress: readString(formData, 'siteAddress') || null,
    createdBy: user.id,
    lineProductId: readString(formData, 'productId') || null,
    lineTitle,
    lineSubtitle: readString(formData, 'lineSubtitle') || null,
    selectionSummary: readString(formData, 'selectionSummary') || 'Recipe foundation pending',
    qty: readString(formData, 'qty') || '1',
    unitPrice: readString(formData, 'unitPrice') || '0',
    costTotal: readString(formData, 'costTotal') || '0',
    notes: readString(formData, 'notes') || null
  });

  redirect('/quotes?message=Draft%20quote%20created');
}
