"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createProduct, updateProduct } from "@/server/products";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function requireActiveTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  return activeTenant;
}

export async function createProductAction(formData: FormData) {
  const activeTenant = await requireActiveTenant();

  const name = readString(formData, "name");
  const sku = readString(formData, "sku");
  const department = readString(formData, "department") || "signage";
  const productFamily = readString(formData, "productFamily") || "rigid_signage";
  const status = readString(formData, "status") || "draft";
  const calculatorType = "configurator_template";
  const defaultTemplateId = readString(formData, "defaultTemplateId");
  const taxCode = "GST";

  if (!name) {
    redirect("/products?error=Product%20name%20is%20required");
  }

  const created = await createProduct({
    tenantId: activeTenant.tenantId,
    sku: sku || null,
    name,
    department,
    productFamily,
    status,
    calculatorType,
    defaultTemplateId: defaultTemplateId || null,
    taxCode
  });

  redirect(`/products?selected=${created.id}&message=Product%20created`);
}

export async function updateProductAction(formData: FormData) {
  const activeTenant = await requireActiveTenant();

  const productId = readString(formData, "productId");
  const name = readString(formData, "name");
  const sku = readString(formData, "sku");
  const department = readString(formData, "department") || "signage";
  const productFamily = readString(formData, "productFamily") || "rigid_signage";
  const status = readString(formData, "status") || "draft";
  const defaultTemplateId = readString(formData, "defaultTemplateId");
  const taxCode = "GST";

  if (!productId) {
    redirect("/products?error=Select%20a%20product%20to%20update");
  }

  if (!name) {
    redirect(`/products?selected=${productId}&error=Product%20name%20is%20required`);
  }

  await updateProduct({
    id: productId,
    tenantId: activeTenant.tenantId,
    sku: sku || null,
    name,
    department,
    productFamily,
    status,
    defaultTemplateId: defaultTemplateId || null,
    taxCode
  });

  redirect(`/products?selected=${productId}&message=Product%20updated`);
}
