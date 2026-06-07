"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createProduct, updateProduct } from "@/server/products";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createProductAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const name = readString(formData, "name");
  const sku = readString(formData, "sku");
  const department = readString(formData, "department") || "signage";
  const productFamily = readString(formData, "productFamily") || "rigid_signage";
  const status = readString(formData, "status") || "draft";
  const calculatorType = "configurator_template";
  const defaultTemplateId = readString(formData, "defaultTemplateId");
  const taxCode = readString(formData, "taxCode");

  if (!name) {
    redirect("/products?error=Product%20name%20is%20required");
  }

  await createProduct({
    tenantId: activeTenant.tenantId,
    sku: sku || null,
    name,
    department,
    productFamily,
    status,
    calculatorType,
    defaultTemplateId: defaultTemplateId || null,
    taxCode: taxCode || null
  });

  redirect("/products?message=Product%20created");
}

export async function updateProductAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const productId = readString(formData, "productId");
  const name = readString(formData, "name");
  const sku = readString(formData, "sku");
  const department = readString(formData, "department") || "signage";
  const productFamily = readString(formData, "productFamily") || "rigid_signage";
  const status = readString(formData, "status") || "draft";
  const defaultTemplateId = readString(formData, "defaultTemplateId");
  const taxCode = readString(formData, "taxCode");

  if (!productId || !name) {
    redirect("/products?error=Product%20selection%20and%20name%20are%20required");
  }

  await updateProduct(activeTenant.tenantId, productId, {
    sku: sku || null,
    name,
    department,
    productFamily,
    status,
    defaultTemplateId: defaultTemplateId || null,
    taxCode: taxCode || null
  });

  redirect(`/products?selected=${productId}&message=Product%20updated`);
}
