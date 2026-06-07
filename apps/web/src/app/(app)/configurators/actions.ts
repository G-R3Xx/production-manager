"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { addConfiguratorField, createConfiguratorTemplate } from "@/server/configurators";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `field-${Date.now()}`;
}

function createStarterDefinitionJson(label: string) {
  return {
    version: 1,
    fields: [
      {
        id: "size",
        key: "size",
        label: `${label} size`,
        type: "select",
        required: true,
        options: [
          { id: "size-a4", label: "A4", value: "A4", priceAdjustment: 0, costAdjustment: 0 },
          { id: "size-a3", label: "A3", value: "A3", priceAdjustment: 15, costAdjustment: 6 },
          { id: "size-custom", label: "Custom", value: "custom", priceAdjustment: 0, costAdjustment: 0 }
        ]
      },
      {
        id: "qty",
        key: "qty",
        label: "Quantity",
        type: "quantity",
        required: true,
        defaultValue: 1
      }
    ],
    displayRules: [],
    pricingRules: [],
    materialRules: []
  };
}

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  return activeTenant;
}

export async function createConfiguratorTemplateAction(formData: FormData) {
  const activeTenant = await requireTenant();

  const name = readString(formData, "name");
  const department = readString(formData, "department") || "signage";
  const productFamily = readString(formData, "productFamily") || "rigid_signage";
  const status = readString(formData, "status") || "draft";

  if (!name) {
    redirect("/configurators?error=Template%20name%20is%20required");
  }

  await createConfiguratorTemplate({
    tenantId: activeTenant.tenantId,
    name,
    department,
    productFamily,
    status,
    definitionJson: createStarterDefinitionJson(name),
    pricingJson: {
      basePrice: 0,
      currency: "AUD",
      notes: "Starter template pricing scaffold"
    },
    constraintsJson: {
      notes: "Starter constraints scaffold"
    }
  });

  redirect("/configurators?message=Configurator%20template%20created");
}

export async function addConfiguratorFieldAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const templateId = readString(formData, "templateId");
  const label = readString(formData, "label");
  const type = readString(formData, "type") || "select";
  const optionsRaw = readString(formData, "optionsCsv");
  const required = readString(formData, "required") === "on";

  if (!templateId || !label) {
    redirect("/configurators?error=Template%20and%20field%20label%20are%20required");
  }

  const key = slugify(readString(formData, "key") || label);
  const options = type === "select"
    ? optionsRaw.split(",").map((part) => part.trim()).filter(Boolean).map((value) => ({
        id: `${key}-${slugify(value)}`,
        label: value,
        value,
        priceAdjustment: 0,
        costAdjustment: 0
      }))
    : [];

  await addConfiguratorField({
    tenantId: activeTenant.tenantId,
    templateId,
    label,
    key,
    type,
    required,
    options
  });

  redirect("/configurators?message=Configurator%20field%20added");
}
