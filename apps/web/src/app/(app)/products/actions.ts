"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createProduct, getProductById, updateProduct } from "@/server/products";
import { ensureProductEditorTemplate, updateConfiguratorDefinitionJson } from "@/server/configurators";
import { randomUUID } from "crypto";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  return activeTenant;
}

export async function createProductAction(formData: FormData) {
  const activeTenant = await requireTenant();

  const name = readString(formData, "name");
  const sku = readString(formData, "sku");
  const department = readString(formData, "department") || "signage";
  const productFamily = readString(formData, "productFamily") || "rigid_signage";
  const status = readString(formData, "status") || "draft";
  const calculatorType = "configurator_template";
  const taxCode = 'GST';

  if (!name) redirect("/products?error=Product%20name%20is%20required");

  const created = await createProduct({
    tenantId: activeTenant.tenantId,
    sku: sku || null,
    name,
    department,
    productFamily,
    status,
    calculatorType,
    defaultTemplateId: null,
    taxCode
  });

  const productId = created.id;
  redirect(`/products?selected=${productId}&message=Product%20created`);
}

export async function updateProductAction(formData: FormData) {
  const activeTenant = await requireTenant();

  const productId = readString(formData, "productId");
  const name = readString(formData, "name");
  const sku = readString(formData, "sku");
  const department = readString(formData, "department") || "signage";
  const productFamily = readString(formData, "productFamily") || "rigid_signage";
  const status = readString(formData, "status") || "draft";
  const defaultTemplateId = readString(formData, "defaultTemplateId");
  const taxCode = 'GST';

  if (!productId || !name) redirect("/products?error=Product%20selection%20and%20name%20are%20required");

  await updateProduct(activeTenant.tenantId, productId, {
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

export async function addProductComponentAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const componentKind = readString(formData, "componentKind") || "material";
  const materialId = readString(formData, "materialId") || null;
  const supplierId = readString(formData, "supplierId") || null;
  const label = readString(formData, "label");
  const quantity = readString(formData, "quantity") || "1";
  const unit = readString(formData, "unit") || "each";
  const ruleType = readString(formData, "ruleType") || "fixed";
  const wastePercent = readString(formData, "wastePercent") || "0";
  const optionTriggerKey = readString(formData, "optionTriggerKey") || null;
  const optionTriggerValue = readString(formData, "optionTriggerValue") || null;
  const notes = readString(formData, "notes") || null;

  if (!productId) redirect("/products?error=No%20product%20selected");

  const product = await getProductById(activeTenant.tenantId, productId);
  if (!product) redirect("/products?error=Product%20not%20found");

  const template = await ensureProductEditorTemplate({
    tenantId: activeTenant.tenantId,
    productId: product.id,
    currentTemplateId: product.defaultTemplateId,
    productName: product.name,
    department: product.department,
    productFamily: product.productFamily
  });

  const definition = template.definitionJson as any;
  const components = Array.isArray(definition.components) ? [...definition.components] : [];

  components.push({
    id: randomUUID(),
    kind: componentKind,
    materialId,
    supplierId,
    label: label || (componentKind === 'material' ? 'Material component' : 'Labour component'),
    quantity,
    unit,
    ruleType,
    wastePercent,
    optionTriggerKey,
    optionTriggerValue,
    notes
  });

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    components
  });

  redirect(`/products?selected=${productId}&message=Component%20added`);
}

export async function addProductOptionAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const key = readString(formData, "key");
  const label = readString(formData, "label");
  const fieldType = readString(formData, "fieldType") || "text";
  const optionsCsv = readString(formData, "optionsCsv");
  const defaultValue = readString(formData, "defaultValue") || null;
  const helpText = readString(formData, "helpText") || null;
  const required = readString(formData, "required") === "yes";

  if (!productId) redirect("/products?error=No%20product%20selected");

  const product = await getProductById(activeTenant.tenantId, productId);
  if (!product) redirect("/products?error=Product%20not%20found");

  const template = await ensureProductEditorTemplate({
    tenantId: activeTenant.tenantId,
    productId: product.id,
    currentTemplateId: product.defaultTemplateId,
    productName: product.name,
    department: product.department,
    productFamily: product.productFamily
  });

  const definition = template.definitionJson as any;
  const fields = Array.isArray(definition.fields) ? [...definition.fields] : [];
  const normalizedKey = key || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const options = fieldType === 'select'
    ? optionsCsv.split(',').map((entry) => entry.trim()).filter(Boolean).map((value) => ({ id: randomUUID(), label: value, value }))
    : [];

  fields.push({
    id: randomUUID(),
    key: normalizedKey,
    label: label || normalizedKey,
    type: fieldType,
    required,
    defaultValue,
    helpText,
    options
  });

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    fields
  });

  redirect(`/products?selected=${productId}&message=Option%20added`);
}
