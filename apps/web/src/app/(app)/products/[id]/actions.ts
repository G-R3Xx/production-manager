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
  updateProductInternalDefaults,
  updateProductProductionRecipe,
  updateProductWebsitePublishing
} from "@/server/products";

function read(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
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


function safePositiveNumber(value: string, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function internalChoice(label: string, value: string, widthMm: number | null = null, heightMm: number | null = null) {
  return {
    id: randomUUID(),
    label,
    value,
    priceDelta: "0.00",
    widthMm: widthMm == null ? null : String(widthMm),
    heightMm: heightMm == null ? null : String(heightMm)
  };
}

function mergeInternalQuoteFields(
  definition: Record<string, any>,
  input: { width: number; height: number; quantity: number; printMethod: string; deliveryMethod: string }
) {
  const existingFields = Array.isArray(definition.fields) ? [...definition.fields] : [];
  const byKey = new Map(existingFields.map((field: any, index: number) => [String(field?.key ?? ""), index]));
  const sizeValue = `${Math.round(input.width)}x${Math.round(input.height)}`;
  const standardMeta = (field: Record<string, any>, extra: Record<string, unknown> = {}) => ({
    ...asObject(field.meta),
    source: "internal_product_setup",
    websiteVisible: true,
    ...extra
  });

  const upsert = (key: string, create: () => Record<string, any>, update: (field: Record<string, any>) => Record<string, any>) => {
    const index = byKey.get(key);
    if (index == null) {
      byKey.set(key, existingFields.length);
      existingFields.push(create());
      return;
    }
    existingFields[index] = update(existingFields[index] as Record<string, any>);
  };

  upsert("finished_size", () => ({
    id: randomUUID(),
    key: "finished_size",
    label: "Finished size",
    type: "size_select",
    required: true,
    defaultValue: sizeValue,
    helpText: "Choose the finished size. Select Custom size to enter different dimensions.",
    quoteOnly: true,
    showWhen: null,
    meta: { source: "internal_product_setup", websiteVisible: true, customDimensions: true },
    options: [
      internalChoice(`${Math.round(input.width)} × ${Math.round(input.height)} mm`, sizeValue, input.width, input.height),
      internalChoice("Custom size", "custom")
    ],
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  }), (field) => {
    const options = Array.isArray(field.options) ? [...field.options] : [];
    const otherOptions = options.filter((option: any) => {
      const value = String(option?.value ?? "");
      return value !== sizeValue && value !== "custom";
    });
    return {
      ...field,
      label: "Finished size",
      type: "size_select",
      required: true,
      defaultValue: sizeValue,
      helpText: "Choose the finished size. Select Custom size to enter different dimensions.",
      meta: standardMeta(field, { customDimensions: true }),
      options: [
        internalChoice(`${Math.round(input.width)} × ${Math.round(input.height)} mm`, sizeValue, input.width, input.height),
        ...otherOptions,
        internalChoice("Custom size", "custom")
      ]
    };
  });

  upsert("quantity", () => ({
    id: randomUUID(),
    key: "quantity",
    label: "Quantity",
    type: "quantity",
    required: true,
    defaultValue: String(Math.round(input.quantity)),
    helpText: "Number of finished items required.",
    quoteOnly: true,
    showWhen: null,
    meta: { source: "internal_product_setup", websiteVisible: true, minimum: 1, step: 1 },
    options: [],
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  }), (field) => ({
    ...field,
    label: "Quantity",
    type: "quantity",
    required: true,
    defaultValue: String(Math.round(input.quantity)),
    helpText: "Number of finished items required.",
    meta: standardMeta(field, { minimum: 1, step: 1 })
  }));

  const quotePrintMethod = input.printMethod === "roll_print" ? "roll_stock" : input.printMethod;
  upsert("print_method", () => ({
    id: randomUUID(),
    key: "print_method",
    label: "Print method",
    type: "select",
    required: true,
    defaultValue: quotePrintMethod,
    helpText: "Choose how the product is normally printed.",
    quoteOnly: true,
    showWhen: null,
    meta: { source: "internal_product_setup", websiteVisible: true },
    options: [
      internalChoice("No print", "none"),
      internalChoice("Direct print", "direct_print"),
      internalChoice("Roll print", "roll_stock")
    ],
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  }), (field) => {
    const options = Array.isArray(field.options) ? [...field.options] : [];
    const extras = options.filter((option: any) => !["none", "direct_print", "roll_stock", "roll_print"].includes(String(option?.value ?? "")));
    return {
      ...field,
      label: "Print method",
      type: "select",
      required: true,
      defaultValue: quotePrintMethod,
      helpText: "Choose how the product is normally printed.",
      meta: standardMeta(field),
      options: [
        internalChoice("No print", "none"),
        internalChoice("Direct print", "direct_print"),
        internalChoice("Roll print", "roll_stock"),
        ...extras
      ]
    };
  });

  upsert("delivery_method", () => ({
    id: randomUUID(),
    key: "delivery_method",
    label: "How does the customer receive it?",
    type: "select",
    required: true,
    defaultValue: input.deliveryMethod,
    helpText: "Choose pickup, delivery or installation.",
    quoteOnly: true,
    showWhen: null,
    meta: { source: "internal_product_setup", websiteVisible: true },
    options: [
      internalChoice("Pickup", "pickup"),
      internalChoice("Delivery", "delivery"),
      internalChoice("Install", "install")
    ],
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  }), (field) => {
    const options = Array.isArray(field.options) ? [...field.options] : [];
    const extras = options.filter((option: any) => !["pickup", "delivery", "install"].includes(String(option?.value ?? "")));
    return {
      ...field,
      label: "How does the customer receive it?",
      type: "select",
      required: true,
      defaultValue: input.deliveryMethod,
      helpText: "Choose pickup, delivery or installation.",
      meta: standardMeta(field),
      options: [
        internalChoice("Pickup", "pickup"),
        internalChoice("Delivery", "delivery"),
        internalChoice("Install", "install"),
        ...extras
      ]
    };
  });

  const standardOrder = ["finished_size", "quantity", "print_method", "delivery_method"];
  const orderIndex = new Map(standardOrder.map((key, index) => [key, index]));
  const orderedFields = existingFields
    .map((field: any, index: number) => ({ field, index }))
    .sort((left, right) => {
      const leftOrder = orderIndex.get(String(left.field?.key ?? ""));
      const rightOrder = orderIndex.get(String(right.field?.key ?? ""));
      if (leftOrder != null && rightOrder != null) return leftOrder - rightOrder;
      if (leftOrder != null) return -1;
      if (rightOrder != null) return 1;
      return left.index - right.index;
    })
    .map(({ field }) => field);

  return { ...definition, fields: orderedFields };
}

export async function saveInternalProductSetupAction(formData: FormData) {
  const productId = read(formData, "productId");
  const { tenant, product } = await context(productId);
  const width = safePositiveNumber(read(formData, "width"), 600);
  const height = safePositiveNumber(read(formData, "height"), 450);
  const quantity = Math.max(1, Math.round(safePositiveNumber(read(formData, "quantity"), 1)));
  const deliveryMethod = ["pickup", "delivery", "install"].includes(read(formData, "deliveryMethod")) ? read(formData, "deliveryMethod") : "pickup";
  const printMethod = ["none", "direct_print", "roll_print"].includes(read(formData, "printMethod")) ? read(formData, "printMethod") : "none";

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

    const template = await ensureProductEditorTemplate({
      tenantId: tenant.tenantId,
      productId,
      currentTemplateId: product.defaultTemplateId,
      productName: product.name,
      department: product.department,
      productFamily: product.productFamily
    });
    const definition = template.definitionJson && typeof template.definitionJson === "object" && !Array.isArray(template.definitionJson)
      ? template.definitionJson as Record<string, any>
      : {};
    await updateConfiguratorDefinitionJson(
      tenant.tenantId,
      template.id,
      mergeInternalQuoteFields(definition, { width, height, quantity, printMethod, deliveryMethod })
    );
    await updateProductInternalDefaults(tenant.tenantId, productId, { widthMm: width, heightMm: height, quantity, deliveryMethod, printMethod });
    const nextStatus = formData.get("makeActive") === "on" ? "active" : (product.status === "archived" ? "archived" : "draft");
    if (nextStatus !== product.status || product.defaultTemplateId !== template.id) {
      await updateProduct(tenant.tenantId, productId, {
        sku: product.sku,
        name: product.name,
        department: product.department,
        productFamily: product.productFamily,
        status: nextStatus,
        defaultTemplateId: template.id,
        taxCode: product.taxCode ?? "GST"
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The product setup could not be saved.";
    redirect(`/products/${productId}?tab=build&error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/quotes");
  revalidatePath("/manufacturing-methods");
  revalidatePath("/processes");
  revalidatePath("/integrations/wordpress");
  redirect(`/products/${productId}?tab=build&message=Product%20saved%20and%20ready%20to%20quote`);
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
