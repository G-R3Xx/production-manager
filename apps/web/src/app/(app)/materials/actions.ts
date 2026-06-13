"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createMaterial } from "@/server/materials";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createMaterialAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect('/bootstrap');

  const name = readString(formData, 'name');
  if (!name) redirect('/materials?error=Material%20name%20is%20required');

  await createMaterial({
    tenantId: activeTenant.tenantId,
    supplierId: readString(formData, 'supplierId') || null,
    sourceProductId: null,
    name,
    sku: readString(formData, 'sku') || null,
    materialType: readString(formData, 'materialType') || 'sheet_media',
    stockUom: readString(formData, 'stockUom') || 'sheet',
    purchaseUom: readString(formData, 'purchaseUom') || 'sheet',
    stockQuantity: readString(formData, 'stockQuantity') || '0',
    purchaseCost: readString(formData, 'purchaseCost') || '0',
    widthMm: readString(formData, 'widthMm') || null,
    lengthMm: readString(formData, 'lengthMm') || null,
    rollWidthMm: readString(formData, 'rollWidthMm') || null,
    gsm: readString(formData, 'gsm') || null,
    notes: readString(formData, 'notes') || null
  });

  redirect('/materials?message=Material%20created');
}
