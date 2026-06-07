"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { addRecipeComponent, createLabourRate, createProductRecipe } from "@/server/recipes";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect('/bootstrap');
  return activeTenant;
}

export async function createLabourRateAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const name = readString(formData, 'name');
  if (!name) redirect('/recipes?error=Labour%20name%20is%20required');
  await createLabourRate({ tenantId: activeTenant.tenantId, name, unit: readString(formData, 'unit') || 'hour', costRate: readString(formData, 'costRate') || '0', sellRate: readString(formData, 'sellRate') || '0' });
  redirect('/recipes?message=Labour%20rate%20created');
}

export async function createRecipeAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, 'productId');
  const name = readString(formData, 'name');
  if (!productId || !name) redirect('/recipes?error=Product%20and%20recipe%20name%20are%20required');
  await createProductRecipe({ tenantId: activeTenant.tenantId, productId, name, yieldQty: readString(formData, 'yieldQty') || '1', yieldUom: readString(formData, 'yieldUom') || 'item', notes: readString(formData, 'notes') || null });
  redirect('/recipes?message=Recipe%20created');
}

export async function addRecipeComponentAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const recipeId = readString(formData, 'recipeId');
  const componentType = readString(formData, 'componentType') || 'material';
  const name = readString(formData, 'name');
  if (!recipeId || !name) redirect('/recipes?error=Recipe%20and%20component%20name%20are%20required');
  await addRecipeComponent({ tenantId: activeTenant.tenantId, recipeId, componentType, materialId: readString(formData, 'materialId') || null, labourRateId: readString(formData, 'labourRateId') || null, supplierId: readString(formData, 'supplierId') || null, name, qty: readString(formData, 'qty') || '0', uom: readString(formData, 'uom') || 'ea', wastePercent: readString(formData, 'wastePercent') || '0', costOverride: readString(formData, 'costOverride') || null, notes: readString(formData, 'notes') || null });
  redirect('/recipes?message=Recipe%20component%20added');
}
