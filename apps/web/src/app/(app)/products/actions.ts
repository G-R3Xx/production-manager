"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createConfiguratorTemplate, addConfiguratorField } from "@/server/configurators";
import { createProduct } from "@/server/products";
import { addRecipeComponent, createProductRecipe } from "@/server/recipes";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  return activeTenant;
}

function productRedirectUrl(productId: string, suffix?: string) {
  const search = new URLSearchParams({ product: productId });
  if (suffix) {
    const [key, value] = suffix.split("=");
    if (key && value) search.set(key, value);
  }
  return `/products?${search.toString()}`;
}

export async function createProductAction(formData: FormData) {
  const activeTenant = await requireTenant();

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

export async function createRecipeForProductAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const name = readString(formData, "name") || "Default components";

  if (!productId) redirect("/products?error=Product%20selection%20is%20required");

  await createProductRecipe({
    tenantId: activeTenant.tenantId,
    productId,
    name,
    yieldQty: readString(formData, "yieldQty") || "1",
    yieldUom: readString(formData, "yieldUom") || "item",
    notes: readString(formData, "notes") || null
  });

  redirect(productRedirectUrl(productId, "message=Components%20set%20created"));
}

export async function addComponentForProductAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const recipeId = readString(formData, "recipeId");
  const name = readString(formData, "name");

  if (!productId || !recipeId || !name) {
    redirect(productRedirectUrl(productId, "error=Recipe%20and%20component%20name%20are%20required"));
  }

  await addRecipeComponent({
    tenantId: activeTenant.tenantId,
    recipeId,
    componentType: readString(formData, "componentType") || "material",
    materialId: readString(formData, "materialId") || null,
    labourRateId: readString(formData, "labourRateId") || null,
    supplierId: readString(formData, "supplierId") || null,
    name,
    qty: readString(formData, "qty") || "0",
    uom: readString(formData, "uom") || "ea",
    wastePercent: readString(formData, "wastePercent") || "0",
    costOverride: readString(formData, "costOverride") || null,
    notes: readString(formData, "notes") || null
  });

  redirect(productRedirectUrl(productId, "message=Component%20added"));
}

function createStarterDefinitionJson(label: string) {
  return {
    version: 1,
    fields: [],
    displayRules: [],
    pricingRules: [],
    materialRules: []
  };
}

export async function createOptionsForProductAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const productName = readString(formData, "productName") || "Product";
  const department = readString(formData, "department") || "signage";
  const productFamily = readString(formData, "productFamily") || "rigid_signage";

  if (!productId) redirect("/products?error=Product%20selection%20is%20required");

  const templateId = await createConfiguratorTemplate({
    tenantId: activeTenant.tenantId,
    name: `${productName} options`,
    department,
    productFamily,
    status: "draft",
    definitionJson: createStarterDefinitionJson(productName),
    pricingJson: { basePrice: 0, currency: "AUD" },
    constraintsJson: {}
  });

  if (!templateId) redirect(productRedirectUrl(productId, "error=Failed%20to%20create%20options%20set"));

  redirect(productRedirectUrl(productId, "message=Options%20set%20created"));
}

export async function addOptionForProductAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const templateId = readString(formData, "templateId");
  const label = readString(formData, "label");
  const key = readString(formData, "key");

  if (!productId || !templateId || !label || !key) {
    redirect(productRedirectUrl(productId, "error=Option%20label%20and%20key%20are%20required"));
  }

  await addConfiguratorField({
    tenantId: activeTenant.tenantId,
    templateId,
    label,
    key,
    type: readString(formData, "type") || "text",
    required: readString(formData, "required") === "on",
    defaultValue: readString(formData, "defaultValue") || null,
    optionsCsv: readString(formData, "optionsCsv") || null
  });

  redirect(productRedirectUrl(productId, "message=Option%20added"));
}
