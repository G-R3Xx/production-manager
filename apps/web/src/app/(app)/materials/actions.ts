"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createMaterial, setMaterialActive, updateMaterial } from "@/server/materials";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function readOptionalNumeric(formData: FormData, key: string): string | null {
  const raw = readString(formData, key);
  if (!raw) return null;

  const normalised = raw
    .replace(/,/g, "")
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .match(/-?\d+(?:\.\d+)?/);

  if (!normalised) return null;

  const value = Number(normalised[0]);
  if (!Number.isFinite(value)) return null;

  return String(value);
}

function readRequiredNumeric(formData: FormData, key: string, fallback = "0"): string {
  return readOptionalNumeric(formData, key) ?? fallback;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong while saving the material";
}

export async function createMaterialAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect('/bootstrap');

  const name = readString(formData, 'name');
  if (!name) redirect('/materials?error=Material%20name%20is%20required');

  try {
    await createMaterial({
      tenantId: activeTenant.tenantId,
      supplierId: readString(formData, 'supplierId') || null,
      sourceProductId: null,
      name,
      sku: readString(formData, 'sku') || null,
      materialType: readString(formData, 'materialType') || 'sheet_media',
      materialGroup: readString(formData, 'materialGroup') || null,
      minimumBillableSheetFraction: readOptionalNumeric(formData, 'minimumBillableSheetFraction'),
      stockUom: readString(formData, 'stockUom') || 'sheet',
      purchaseUom: readString(formData, 'purchaseUom') || 'sheet',
      stockQuantity: readRequiredNumeric(formData, 'stockQuantity'),
      purchaseCost: readRequiredNumeric(formData, 'purchaseCost'),
      widthMm: readOptionalNumeric(formData, 'widthMm'),
      lengthMm: readOptionalNumeric(formData, 'lengthMm'),
      rollWidthMm: readOptionalNumeric(formData, 'rollWidthMm'),
      gsm: readOptionalNumeric(formData, 'gsm'),
      notes: readString(formData, 'notes') || null
    });
  } catch (error) {
    console.error('Create material failed', error);
    redirect(`/materials?error=${encodeURIComponent(getErrorMessage(error))}`);
  }

  redirect('/materials?message=Material%20created');
}

export async function updateMaterialAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect('/bootstrap');

  const materialId = readString(formData, 'materialId');
  const name = readString(formData, 'name');
  if (!materialId) redirect('/materials?error=Material%20ID%20is%20missing');
  if (!name) redirect('/materials?error=Material%20name%20is%20required');

  try {
    await updateMaterial({
      id: materialId,
      tenantId: activeTenant.tenantId,
      supplierId: readString(formData, 'supplierId') || null,
      sourceProductId: null,
      name,
      sku: readString(formData, 'sku') || null,
      materialType: readString(formData, 'materialType') || 'sheet_media',
      materialGroup: readString(formData, 'materialGroup') || null,
      minimumBillableSheetFraction: readOptionalNumeric(formData, 'minimumBillableSheetFraction'),
      stockUom: readString(formData, 'stockUom') || 'sheet',
      purchaseUom: readString(formData, 'purchaseUom') || 'sheet',
      stockQuantity: readRequiredNumeric(formData, 'stockQuantity'),
      purchaseCost: readRequiredNumeric(formData, 'purchaseCost'),
      widthMm: readOptionalNumeric(formData, 'widthMm'),
      lengthMm: readOptionalNumeric(formData, 'lengthMm'),
      rollWidthMm: readOptionalNumeric(formData, 'rollWidthMm'),
      gsm: readOptionalNumeric(formData, 'gsm'),
      notes: readString(formData, 'notes') || null
    });
  } catch (error) {
    console.error('Update material failed', error);
    redirect(`/materials?error=${encodeURIComponent(getErrorMessage(error))}`);
  }

  redirect('/materials?message=Material%20updated');
}

export async function setMaterialActiveAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect('/bootstrap');

  const materialId = readString(formData, 'materialId');
  const nextActive = readString(formData, 'active') === 'true';
  if (!materialId) redirect('/materials?error=Material%20ID%20is%20missing');

  try {
    await setMaterialActive(activeTenant.tenantId, materialId, nextActive);
  } catch (error) {
    console.error('Set material active failed', error);
    redirect(`/materials?error=${encodeURIComponent(getErrorMessage(error))}`);
  }

  redirect(nextActive ? '/materials?message=Material%20restored' : '/materials?message=Material%20deleted');
}
