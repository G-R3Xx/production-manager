"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createConfiguratorTemplate } from "@/server/configurators";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
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
        id: "sides",
        key: "sides",
        label: "Sides",
        type: "select",
        required: true,
        options: [
          { id: "single", label: "Single sided", value: "single", priceAdjustment: 0, costAdjustment: 0 },
          { id: "double", label: "Double sided", value: "double", priceAdjustment: 20, costAdjustment: 10 }
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

export async function createConfiguratorTemplateAction(formData: FormData) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

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
