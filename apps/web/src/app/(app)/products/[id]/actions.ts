"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { ensureProductEditorTemplate, updateConfiguratorDefinitionJson } from "@/server/configurators";
import { saveProductProductionFlow, type ProductProductionFlowStepInput } from "@/server/productionResources";
import {
  getProductById,
  touchProductWebsiteSync,
  updateProduct,
  updateProductProductionRecipe,
  updateProductWebsitePublishing
} from "@/server/products";

function read(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function context(productId: string) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  const product = await getProductById(tenant.tenantId, productId);
  if (!product) redirect("/products?error=Product%20not%20found");
  return { tenant, product };
}

export async function saveProductGeneralAction(formData: FormData) {
  const productId = read(formData, "productId");
  const { tenant, product } = await context(productId);
  const name = read(formData, "name");
  if (!name) redirect(`/products/${productId}?tab=general&error=Product%20name%20is%20required`);
  await updateProduct(tenant.tenantId, productId, {
    sku: read(formData, "sku") || null,
    name,
    department: read(formData, "department") || product.department,
    productFamily: read(formData, "productFamily") || product.productFamily,
    status: read(formData, "status") || product.status,
    defaultTemplateId: product.defaultTemplateId,
    taxCode: product.taxCode ?? "GST"
  });
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}?tab=general&message=Product%20details%20saved`);
}

export async function saveProductBuildAction(formData: FormData) {
  const productId = read(formData, "productId");
  const { tenant } = await context(productId);
  await updateProductProductionRecipe(tenant.tenantId, productId, read(formData, "productionRecipeId") || null);
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}?tab=build&message=Build%20method%20saved`);
}

function parseProductionFlowSteps(value: string): ProductProductionFlowStepInput[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("The production workflow is invalid.");
  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const processToken = String(row.processToken ?? "").trim();
    if (!processToken) return [];
    return [{
      processToken,
      machineId: String(row.machineId ?? "").trim() || null,
      labourOperationId: String(row.labourOperationId ?? "").trim() || null
    }];
  });
}

export async function saveSimpleProductProductionFlowAction(formData: FormData) {
  const productId = read(formData, "productId");
  const { tenant, product } = await context(productId);

  try {
    const steps = parseProductionFlowSteps(read(formData, "flowJson"));
    await saveProductProductionFlow({
      tenantId: tenant.tenantId,
      productId,
      productName: product.name,
      department: product.department,
      materialId: read(formData, "materialId") || null,
      steps
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The production workflow could not be saved.";
    redirect(`/products/${productId}?tab=build&error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/manufacturing-methods");
  revalidatePath("/processes");
  revalidatePath("/integrations/wordpress");
  redirect(`/products/${productId}?tab=build&message=Production%20workflow%20saved%20and%20pricing%20updated`);
}

export async function saveProductWebsiteAction(formData: FormData) {
  const productId = read(formData, "productId");
  const { tenant, product } = await context(productId);
  const existing = product.websiteConfigJson && typeof product.websiteConfigJson === "object" && !Array.isArray(product.websiteConfigJson)
    ? product.websiteConfigJson
    : {};
  const fieldDisplays: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("display:")) continue;
    fieldDisplays[key.slice("display:".length)] = String(value);
  }
  const numberOr = (key: string, fallback: unknown) => {
    const value = Number(read(formData, key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const configJson = {
    ...existing,
    defaultWidthMm: numberOr("defaultWidthMm", existing.defaultWidthMm ?? 600),
    defaultHeightMm: numberOr("defaultHeightMm", existing.defaultHeightMm ?? 450),
    defaultQuantity: Math.max(1, Math.round(Number(numberOr("defaultQuantity", existing.defaultQuantity ?? 1)))),
    basePrice: read(formData, "basePrice") ? Number(read(formData, "basePrice")) : existing.basePrice ?? 0,
    fieldDisplays
  };
  await updateProductWebsitePublishing(tenant.tenantId, productId, {
    enabled: formData.get("websiteEnabled") === "on",
    mode: read(formData, "websiteMode") === "live_checkout" ? "live_checkout" : "quote_only",
    slug: read(formData, "websiteSlug") || null,
    category: read(formData, "websiteCategory") || null,
    shortDescription: read(formData, "websiteShortDescription") || null,
    description: read(formData, "websiteDescription") || null,
    imageUrl: read(formData, "websiteImageUrl") || null,
    configJson
  });
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/integrations/wordpress");
  redirect(`/products/${productId}?tab=website&message=Website%20settings%20saved`);
}


function questionKey(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "question";
}

function questionOptions(value: string) {
  return value.split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [choicePart, pricePart = "0"] = entry.split("|").map((part) => part.trim());
    const equalsAt = choicePart.indexOf("=");
    const label = (equalsAt >= 0 ? choicePart.slice(0, equalsAt) : choicePart).trim();
    const rawValue = (equalsAt >= 0 ? choicePart.slice(equalsAt + 1) : questionKey(label)).trim();
    const size = `${label} ${rawValue}`.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    return {
      id: randomUUID(),
      label: label || rawValue,
      value: rawValue || questionKey(label),
      priceDelta: Number.isFinite(Number(pricePart)) ? Number(pricePart).toFixed(2) : "0.00",
      widthMm: size?.[1] ?? null,
      heightMm: size?.[2] ?? null
    };
  });
}

async function editableDefinition(productId: string) {
  const { tenant, product } = await context(productId);
  const template = await ensureProductEditorTemplate({
    tenantId: tenant.tenantId,
    productId,
    currentTemplateId: product.defaultTemplateId,
    productName: product.name,
    department: product.department,
    productFamily: product.productFamily
  });
  const definition = template.definitionJson && typeof template.definitionJson === "object" && !Array.isArray(template.definitionJson)
    ? template.definitionJson
    : {};
  return {
    tenant,
    product,
    template,
    definition: {
      ...definition,
      version: typeof definition.version === "number" ? definition.version : 2,
      fields: Array.isArray(definition.fields) ? definition.fields : [],
      components: Array.isArray(definition.components) ? definition.components : []
    }
  };
}

function questionFromForm(formData: FormData, existing?: Record<string, any>) {
  const label = read(formData, "label");
  const type = read(formData, "type") || "select";
  const options = ["number", "text", "quantity"].includes(type) && !read(formData, "options")
    ? []
    : questionOptions(read(formData, "options"));
  const existingValues = new Set(options.map((option) => option.value));
  const currentDefault = String(existing?.defaultValue ?? "");
  return {
    ...(existing ?? {}),
    id: String(existing?.id ?? randomUUID()),
    key: String(existing?.key ?? questionKey(label)),
    label,
    type,
    required: formData.get("required") === "on",
    defaultValue: existingValues.has(currentDefault) ? currentDefault : options[0]?.value ?? existing?.defaultValue ?? null,
    helpText: read(formData, "helpText") || null,
    quoteOnly: true,
    showWhen: existing?.showWhen ?? null,
    options,
    rule: existing?.rule ?? { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  };
}

async function saveDefinition(productId: string, templateId: string, tenantId: string, definition: Record<string, unknown>) {
  await updateConfiguratorDefinitionJson(tenantId, templateId, definition);
  await touchProductWebsiteSync(tenantId, productId);
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/integrations/wordpress");
}

export async function addSimpleProductQuestionAction(formData: FormData) {
  const productId = read(formData, "productId");
  const label = read(formData, "label");
  if (!label) redirect(`/products/${productId}?tab=build&error=Question%20label%20is%20required`);
  const { tenant, template, definition } = await editableDefinition(productId);
  const field = questionFromForm(formData);
  let key = field.key;
  const used = new Set(definition.fields.map((item: any) => String(item?.key ?? "")));
  let suffix = 2;
  while (used.has(key)) key = `${field.key}_${suffix++}`;
  field.key = key;
  await saveDefinition(productId, template.id, tenant.tenantId, { ...definition, fields: [...definition.fields, field] });
  redirect(`/products/${productId}?tab=build&message=Customer%20question%20added`);
}

export async function updateSimpleProductQuestionAction(formData: FormData) {
  const productId = read(formData, "productId");
  const fieldId = read(formData, "fieldId");
  const label = read(formData, "label");
  if (!label) redirect(`/products/${productId}?tab=build&error=Question%20label%20is%20required`);
  const { tenant, template, definition } = await editableDefinition(productId);
  const fields = definition.fields.map((field: any) => String(field?.id ?? "") === fieldId ? questionFromForm(formData, field) : field);
  await saveDefinition(productId, template.id, tenant.tenantId, { ...definition, fields });
  redirect(`/products/${productId}?tab=build&message=Customer%20question%20saved`);
}

export async function deleteSimpleProductQuestionAction(formData: FormData) {
  const productId = read(formData, "productId");
  const fieldId = read(formData, "fieldId");
  const { tenant, template, definition } = await editableDefinition(productId);
  const field = definition.fields.find((item: any) => String(item?.id ?? "") === fieldId);
  const optionKey = String(field?.key ?? "");
  const fields = definition.fields.filter((item: any) => String(item?.id ?? "") !== fieldId);
  const components = definition.components.filter((component: any) => {
    const stockKey = String(component?.stockUsage?.optionKey ?? "");
    const triggerKey = String(component?.trigger?.optionKey ?? "");
    return !optionKey || (stockKey !== optionKey && triggerKey !== optionKey);
  });
  await saveDefinition(productId, template.id, tenant.tenantId, { ...definition, fields, components });
  redirect(`/products/${productId}?tab=build&message=Customer%20question%20removed`);
}

export async function moveSimpleProductQuestionAction(formData: FormData) {
  const productId = read(formData, "productId");
  const fieldId = read(formData, "fieldId");
  const direction = read(formData, "direction") === "up" ? -1 : 1;
  const { tenant, template, definition } = await editableDefinition(productId);
  const fields = [...definition.fields];
  const index = fields.findIndex((item: any) => String(item?.id ?? "") === fieldId);
  const target = index + direction;
  if (index >= 0 && target >= 0 && target < fields.length) [fields[index], fields[target]] = [fields[target], fields[index]];
  await saveDefinition(productId, template.id, tenant.tenantId, { ...definition, fields });
  redirect(`/products/${productId}?tab=build&message=Question%20order%20updated`);
}
