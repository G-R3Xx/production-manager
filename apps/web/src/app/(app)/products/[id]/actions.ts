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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function parseStringArrayJson(value: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function internalChoice(
  label: string,
  value: string,
  widthMm: number | null = null,
  heightMm: number | null = null,
  priceDelta = 0,
  quoteRequired = false
) {
  return {
    id: randomUUID(),
    label,
    value,
    priceDelta: Number.isFinite(priceDelta) ? priceDelta.toFixed(2) : "0.00",
    quoteRequired,
    widthMm: widthMm == null ? null : String(widthMm),
    heightMm: heightMm == null ? null : String(heightMm)
  };
}

function eyeletQuantityPresets(defaultValue: string) {
  const presets = [
    { id: randomUUID(), label: "4 corners", value: "four_corners", qty: "4" },
    { id: randomUUID(), label: "Top corners only", value: "top_corners_only", qty: "2" },
    { id: randomUUID(), label: "Centre top + bottom", value: "centre_top_bottom", qty: "2" },
    { id: randomUUID(), label: "2 top + 2 bottom for pole fixing", value: "pole_fixing", qty: "4" },
    { id: randomUUID(), label: "Custom", value: "__custom", qty: "custom" }
  ];
  const selectedIndex = presets.findIndex((preset) => preset.value === defaultValue);
  if (selectedIndex <= 0) return presets;
  return [presets[selectedIndex], ...presets.slice(0, selectedIndex), ...presets.slice(selectedIndex + 1)];
}

function triggerKeyFor(component: Record<string, any>): string {
  return String(asObject(component.trigger).optionKey ?? asObject(component.stockUsage).optionKey ?? "");
}

function isEyeletComponent(component: Record<string, any>): boolean {
  const usage = asObject(component.stockUsage);
  return /eyelet|grommet/i.test(`${String(component.label ?? "")} ${String(usage.quantityPrompt ?? "")}`);
}

function mergeInternalQuoteFields(
  definition: Record<string, any>,
  input: {
    width: number;
    height: number;
    quantity: number;
    wastePercent: number;
    mainMaterialId: string | null;
    mainMaterialName: string | null;
    mainMaterialIsRoll: boolean;
    printMethod: string;
    printMethods: string[];
    rollMediaId: string | null;
    rollMediaName: string | null;
    inkChoices: string[];
    defaultInk: string;
    artworkOptions: string[];
    defaultArtwork: string;
    artworkCheckPrice: number;
    artworkDesignPrice: number;
    deliveryMethod: string;
    deliveryFee: number;
    finishings: string[];
    laminateMaterialIds: string[];
    laminateMaterialNames: string[];
    defaultLaminateMaterialId: string | null;
    eyeletMaterialId: string | null;
    eyeletMaterialName: string | null;
    eyeletPreset: string;
  }
) {
  // Quantity is controlled by WooCommerce and by the quote line itself. Remove
  // the old generated quantity question so it cannot appear twice.
  const removeSeparateRollStockQuestion = input.mainMaterialIsRoll || Boolean(input.rollMediaId);
  const existingFields = (Array.isArray(definition.fields) ? [...definition.fields] : [])
    .filter((field: any) => String(field?.key ?? "") !== "quantity")
    .filter((field: any) => !(removeSeparateRollStockQuestion && String(field?.key ?? "") === "roll_stock_type"));
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

  const printLabels: Record<string, string> = { none: "No print", direct_print: "Direct print", roll_stock: "Roll print / applied media" };
  const quotePrintMethod = input.printMethod === "roll_print" ? "roll_stock" : input.printMethod;
  const allowedPrintMethods = uniqueStrings(input.printMethods.map((value) => value === "roll_print" ? "roll_stock" : value).filter((value) => ["none", "direct_print", "roll_stock"].includes(value)));
  if (!allowedPrintMethods.includes(quotePrintMethod)) allowedPrintMethods.unshift(quotePrintMethod || "none");
  const printOptions = allowedPrintMethods.map((value) => internalChoice(printLabels[value] ?? value.replace(/_/g, " "), value));
  upsert("print_method", () => ({
    id: randomUUID(),
    key: "print_method",
    label: "Print method",
    type: "select",
    required: true,
    defaultValue: quotePrintMethod,
    helpText: "Choose one of the print methods enabled in the guided product builder.",
    quoteOnly: true,
    showWhen: null,
    meta: { source: "internal_product_setup", websiteVisible: true },
    options: printOptions,
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  }), (field) => ({
    ...field,
    label: "Print method",
    type: "select",
    required: true,
    defaultValue: quotePrintMethod,
    helpText: "Choose one of the print methods enabled in the guided product builder.",
    meta: standardMeta(field),
    options: printOptions
  }));

  const inkLabels: Record<string, string> = { none: "No ink", cmyk: "CMYK", white: "White", cmyk_white: "CMYK + White" };
  const allowedInkChoices = uniqueStrings(input.inkChoices.filter((value) => ["none", "cmyk", "white", "cmyk_white"].includes(value)));
  if (!allowedInkChoices.includes(input.defaultInk)) allowedInkChoices.unshift(input.defaultInk || "cmyk");
  const inkOptions = allowedInkChoices.map((value) => internalChoice(inkLabels[value] ?? value.replace(/_/g, " "), value));
  upsert("ink", () => ({
    id: randomUUID(),
    key: "ink",
    label: "Ink",
    type: "select",
    required: true,
    defaultValue: input.defaultInk || allowedInkChoices[0] || "cmyk",
    helpText: "Choose the ink mode available for this product.",
    quoteOnly: true,
    showWhen: { optionKey: "print_method", optionValues: ["direct_print", "roll_stock"] },
    meta: { source: "internal_product_setup", websiteVisible: true },
    options: inkOptions,
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  }), (field) => ({
    ...field,
    label: "Ink",
    type: "select",
    required: true,
    defaultValue: input.defaultInk || allowedInkChoices[0] || "cmyk",
    helpText: "Choose the ink mode available for this product.",
    showWhen: { optionKey: "print_method", optionValues: ["direct_print", "roll_stock"] },
    meta: standardMeta(field),
    options: inkOptions
  }));

  const artworkLabels: Record<string, string> = {
    client_supplied: "Print-ready artwork supplied",
    artwork_check: "Artwork check / minor changes",
    artwork_required: "Artwork or design required"
  };
  const allowedArtworkOptions = uniqueStrings(input.artworkOptions)
    .filter((value) => ["client_supplied", "artwork_check", "artwork_required"].includes(value));
  if (!allowedArtworkOptions.length) allowedArtworkOptions.push("client_supplied");
  if (!allowedArtworkOptions.includes(input.defaultArtwork)) {
    allowedArtworkOptions.unshift(input.defaultArtwork || allowedArtworkOptions[0]);
  }
  const artworkOptions = allowedArtworkOptions.map((value) => internalChoice(
    artworkLabels[value] ?? value.replace(/_/g, " "),
    value,
    null,
    null,
    value === "artwork_check" ? input.artworkCheckPrice : value === "artwork_required" ? input.artworkDesignPrice : 0,
    false
  ));
  upsert("artwork", () => ({
    id: randomUUID(),
    key: "artwork",
    label: "Artwork",
    type: "select",
    required: true,
    defaultValue: input.defaultArtwork || allowedArtworkOptions[0],
    helpText: "Choose whether print-ready artwork is supplied, needs checking, or requires design work.",
    quoteOnly: true,
    showWhen: null,
    meta: { source: "internal_product_setup", websiteVisible: true },
    options: artworkOptions,
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  }), (field) => ({
    ...field,
    label: "Artwork",
    type: "select",
    required: true,
    defaultValue: input.defaultArtwork || allowedArtworkOptions[0],
    helpText: "Choose whether print-ready artwork is supplied, needs checking, or requires design work.",
    meta: standardMeta(field),
    options: artworkOptions,
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  }));

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
      internalChoice("Delivery", "delivery", null, null, input.deliveryFee),
      internalChoice("Install", "install", null, null, 0, true)
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
        internalChoice("Delivery", "delivery", null, null, input.deliveryFee),
        internalChoice("Install", "install", null, null, 0, true),
        ...extras
      ]
    };
  });

  const laminatePairs = uniqueStrings(input.laminateMaterialIds).map((materialId, index) => ({
    materialId,
    name: input.laminateMaterialNames[index] || `Laminate ${index + 1}`
  }));
  const laminateValue = input.defaultLaminateMaterialId && laminatePairs.some((item) => item.materialId === input.defaultLaminateMaterialId)
    ? input.defaultLaminateMaterialId
    : "none";
  const laminateOptions = [internalChoice("No laminate", "none"), ...laminatePairs.map((item) => internalChoice(item.name, item.materialId))];
  upsert("laminate", () => ({
    id: randomUUID(),
    key: "laminate",
    label: "Laminate",
    type: "select",
    required: false,
    defaultValue: laminateValue,
    helpText: "Choose none or one of the laminate materials enabled in the guided product builder.",
    quoteOnly: true,
    showWhen: null,
    meta: { source: "internal_product_setup", websiteVisible: true },
    options: laminateOptions,
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  }), (field) => ({
    ...field,
    label: "Laminate",
    type: "select",
    required: false,
    defaultValue: laminateValue,
    helpText: "Choose none or one of the laminate materials enabled in the guided product builder.",
    meta: standardMeta(field),
    options: laminateOptions
  }));

  const finishingLabels: Record<string, string> = {
    trim_cut: "Trim / cut",
    mount_apply: "Mount / apply",
    eyelets: "Eyelets",
    finishing: "Other finishing",
    pack: "Pack"
  };
  upsert("finishing", () => ({
    id: randomUUID(),
    key: "finishing",
    label: "Finishing",
    type: "multi_select",
    required: false,
    defaultValue: input.finishings,
    helpText: "Tick all finishing processes required. Eyelets ask for placement and quantity.",
    quoteOnly: true,
    showWhen: null,
    meta: { source: "internal_product_setup", websiteVisible: true },
    options: input.finishings.map((value) => internalChoice(finishingLabels[value] ?? value.replace(/_/g, " "), value)),
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  }), (field) => ({
    ...field,
    label: "Finishing",
    type: "multi_select",
    required: false,
    defaultValue: input.finishings,
    helpText: "Tick all finishing processes required. Eyelets ask for placement and quantity.",
    meta: standardMeta(field),
    options: input.finishings.map((value) => internalChoice(finishingLabels[value] ?? value.replace(/_/g, " "), value))
  }));

  if (input.finishings.includes("eyelets")) {
    const websiteEyeletPresets = eyeletQuantityPresets(input.eyeletPreset || "four_corners");
    upsert("eyelet_placement", () => ({
      id: randomUUID(),
      key: "eyelet_placement",
      label: "Eyelet placement",
      type: "select",
      required: true,
      defaultValue: input.eyeletPreset || "four_corners",
      helpText: "Choose the same eyelet placement used by the internal Quick Quote builder.",
      quoteOnly: true,
      showWhen: { optionKey: "finishing", optionValues: ["eyelets"] },
      meta: { source: "internal_product_setup", websiteVisible: true },
      options: websiteEyeletPresets.map((preset) => internalChoice(preset.label, preset.value)),
      rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
    }), (field) => ({
      ...field,
      label: "Eyelet placement",
      type: "select",
      required: true,
      defaultValue: input.eyeletPreset || "four_corners",
      helpText: "Choose the same eyelet placement used by the internal Quick Quote builder.",
      showWhen: { optionKey: "finishing", optionValues: ["eyelets"] },
      meta: standardMeta(field),
      options: websiteEyeletPresets.map((preset) => internalChoice(preset.label, preset.value))
    }));
    upsert("eyelet_custom_quantity", () => ({
      id: randomUUID(),
      key: "eyelet_custom_quantity",
      label: "Custom eyelet quantity",
      type: "quantity",
      required: true,
      defaultValue: "4",
      helpText: "Enter the total number of eyelets only when Custom placement is selected.",
      quoteOnly: true,
      showWhen: { optionKey: "eyelet_placement", optionValues: ["__custom"] },
      meta: { source: "internal_product_setup", websiteVisible: true, minimum: 1, step: 1 },
      options: [],
      rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
    }), (field) => ({
      ...field,
      label: "Custom eyelet quantity",
      type: "quantity",
      required: true,
      defaultValue: String(field.defaultValue || "4"),
      helpText: "Enter the total number of eyelets only when Custom placement is selected.",
      showWhen: { optionKey: "eyelet_placement", optionValues: ["__custom"] },
      meta: standardMeta(field, { minimum: 1, step: 1 }),
      options: []
    }));
  }

  let components = Array.isArray(definition.components) ? [...definition.components] : [];
  const baseWastePercent = String(Math.max(0, input.wastePercent));
  components = components.filter((rawComponent: any) => {
    const component = asObject(rawComponent);
    const triggerKey = triggerKeyFor(component);
    const role = String(component.role ?? "");
    const label = String(component.label ?? "").toLowerCase();
    const notes = String(component.notes ?? "").toLowerCase();
    const managedNote = notes.includes("quick product builder") || notes.includes("guided product builder") || notes.includes("guided workflow") || notes.includes("internal product setup");
    if (role === "base_material") return false;
    if (managedNote && ["print_method", "ink", "laminate"].includes(triggerKey)) return false;
    if (managedNote && isEyeletComponent(component)) return false;
    if (role === "quote_sell_charge" && (triggerKey === "ink" || (label.includes("ink") && (triggerKey === "print_method" || notes.includes("simple print charge"))))) return false;
    if (role === "quote_selected_material" && !component.materialId && (label.includes("roll stock") || label.includes("print media"))) return false;
    return true;
  });

  if (input.mainMaterialId) {
    const isRoll = input.mainMaterialIsRoll;
    components.push({
      id: randomUUID(),
      kind: "material",
      role: "base_material",
      materialId: input.mainMaterialId,
      supplierId: null,
      labourRateName: null,
      label: input.mainMaterialName || (isRoll ? "Base roll material" : "Base sheet material"),
      quantity: "1",
      unit: isRoll ? "lm" : "sheet",
      notes: "Main material linked by the guided product builder. Quote dimensions drive the material usage.",
      ruleType: isRoll ? "per_linear_metre" : "yield_based",
      wastePercent: baseWastePercent,
      stockUsage: {
        usageBasis: isRoll ? "per_linear_metre" : "yield_based",
        dimensionSource: "finished_size",
        optionKey: "finished_size",
        optionValues: [],
        widthMm: null, heightMm: null, rollWidthMm: null, partsPerSheet: null, metresPerUnit: null, sheetsPerUnit: null
      },
      trigger: { optionKey: null, optionValue: null, optionValues: [] }
    });
  }

  if (input.rollMediaId && input.rollMediaId !== input.mainMaterialId && allowedPrintMethods.includes("roll_stock")) {
    components.push({
      id: randomUUID(),
      kind: "material",
      role: "quote_selected_material",
      materialId: input.rollMediaId,
      supplierId: null,
      labourRateName: null,
      label: input.rollMediaName || "Roll print media",
      quantity: "1",
      unit: "lm",
      notes: "Roll media linked by the guided product builder.",
      ruleType: "per_linear_metre",
      wastePercent: "10",
      stockUsage: {
        usageBasis: "per_linear_metre",
        dimensionSource: "finished_size",
        optionKey: "print_method",
        optionValues: ["roll_stock"],
        widthMm: null, heightMm: null, rollWidthMm: null, partsPerSheet: null, metresPerUnit: null, sheetsPerUnit: null
      },
      trigger: { optionKey: "print_method", optionValue: null, optionValues: ["roll_stock"] }
    });
  }

  const inkRates: Record<string, string> = { cmyk: "10", white: "10", cmyk_white: "20" };
  const inkChargeNames: Record<string, string> = { cmyk: "CMYK Ink", white: "White Ink", cmyk_white: "CMYK + White Ink" };
  for (const value of allowedInkChoices.filter((choice) => choice !== "none")) {
    components.push({
      id: randomUUID(),
      kind: "material",
      role: "quote_sell_charge",
      materialId: null,
      supplierId: null,
      labourRateName: null,
      label: inkChargeNames[value] || `${inkLabels[value] || value} Ink`,
      quantity: "1",
      unit: "sqm",
      notes: "Ink charge linked by the guided product builder.",
      ruleType: "sell_sqm",
      wastePercent: "0",
      stockUsage: {
        usageBasis: "sell_sqm",
        dimensionSource: "finished_size",
        optionKey: "ink",
        optionValues: [value],
        widthMm: null, heightMm: null, rollWidthMm: null, partsPerSheet: null, metresPerUnit: null, sheetsPerUnit: null,
        sellRate: inkRates[value] || "10",
        chargeName: inkChargeNames[value] || `${inkLabels[value] || value} Ink`
      },
      trigger: { optionKey: "ink", optionValue: null, optionValues: [value] }
    });
  }

  for (const item of laminatePairs) {
    components.push({
      id: randomUUID(),
      kind: "material",
      role: "quote_selected_material",
      materialId: item.materialId,
      supplierId: null,
      labourRateName: null,
      label: item.name,
      quantity: "1",
      unit: "lm",
      notes: "Laminate linked by the guided product builder.",
      ruleType: "per_linear_metre",
      wastePercent: "10",
      stockUsage: {
        usageBasis: "per_linear_metre",
        dimensionSource: "finished_size",
        optionKey: "laminate",
        optionValues: [item.materialId],
        widthMm: null, heightMm: null, rollWidthMm: null, partsPerSheet: null, metresPerUnit: null, sheetsPerUnit: null
      },
      trigger: { optionKey: "laminate", optionValue: null, optionValues: [item.materialId] }
    });
  }

  if (input.finishings.includes("eyelets")) {
    const presets = eyeletQuantityPresets(input.eyeletPreset || "four_corners");
    components = components.map((rawComponent: any) => {
      const component = asObject(rawComponent);
      if (!isEyeletComponent(component)) return rawComponent;
      return {
        ...component,
        stockUsage: {
          ...asObject(component.stockUsage),
          quantitySource: "follow_up",
          quantityPrompt: "Eyelet placement",
          quantityPresets: presets.map((preset) => ({ ...preset, id: randomUUID() })),
          allowCustomQuantity: true,
          customQuantityLabel: "Custom eyelet quantity"
        }
      };
    });

    if (input.eyeletMaterialId && !components.some((component: any) => isEyeletComponent(asObject(component)) && String(component?.materialId ?? "") === input.eyeletMaterialId)) {
      components.push({
        id: randomUUID(),
        kind: "material",
        role: "quote_finishing",
        materialId: input.eyeletMaterialId,
        supplierId: null,
        labourRateName: null,
        label: input.eyeletMaterialName || "Eyelets",
        quantity: "1",
        unit: "each",
        notes: "Eyelet hardware linked by the quick product builder.",
        ruleType: "per_unit",
        wastePercent: "0",
        stockUsage: {
          usageBasis: "per_unit",
          dimensionSource: "quantity_only",
          optionKey: "finishing",
          optionValues: ["eyelets"],
          widthMm: null, heightMm: null, rollWidthMm: null, partsPerSheet: null, metresPerUnit: null, sheetsPerUnit: null,
          quantitySource: "follow_up", quantityPrompt: "Eyelet placement", quantityPresets: presets, allowCustomQuantity: true, customQuantityLabel: "Custom eyelet quantity"
        },
        trigger: { optionKey: "finishing", optionValue: null, optionValues: ["eyelets"] }
      });
    }

    if (!components.some((component: any) => isEyeletComponent(asObject(component)) && String(component?.kind ?? "") === "labour")) {
      components.push({
        id: randomUUID(),
        kind: "labour",
        role: "factory_labour",
        materialId: null,
        supplierId: null,
        labourRateName: "Factory",
        label: "Eyelet install labour",
        quantity: "0.03",
        unit: "hr",
        notes: "Labour per eyelet. Quote placement and quantity multiplies this row.",
        ruleType: "labour_hours",
        wastePercent: "0",
        stockUsage: {
          usageBasis: "labour_hours",
          dimensionSource: "quantity_only",
          optionKey: "finishing",
          optionValues: ["eyelets"],
          widthMm: null, heightMm: null, rollWidthMm: null, partsPerSheet: null, metresPerUnit: null, sheetsPerUnit: null,
          sellRate: "66", chargeName: "Eyelet install labour", quantitySource: "follow_up", quantityPrompt: "Eyelet placement", quantityPresets: presets.map((preset) => ({ ...preset, id: randomUUID() })), allowCustomQuantity: true, customQuantityLabel: "Custom eyelet quantity"
        },
        trigger: { optionKey: "finishing", optionValue: null, optionValues: ["eyelets"] }
      });
    }
  }

  const standardOrder = ["finished_size", "print_method", "ink", "laminate", "finishing", "eyelet_placement", "eyelet_custom_quantity", "artwork", "delivery_method"];
  const orderIndex = new Map(standardOrder.map((key, index) => [key, index]));
  const orderedFields = existingFields
    .filter((field: any) => !["white_ink", "print_type"].includes(String(field?.key ?? "")))
    .filter((field: any) => !(removeSeparateRollStockQuestion && String(field?.key ?? "") === "roll_stock_type"))
    .filter((field: any) => input.finishings.includes("eyelets") || !["eyelet_placement", "eyelet_custom_quantity"].includes(String(field?.key ?? "")))
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

  return { ...definition, fields: orderedFields, components };
}

export async function saveInternalProductSetupAction(formData: FormData) {
  const productId = read(formData, "productId");
  const { tenant, product } = await context(productId);
  const width = safePositiveNumber(read(formData, "width"), 600);
  const height = safePositiveNumber(read(formData, "height"), 450);
  const quantity = Math.max(1, Math.round(safePositiveNumber(read(formData, "quantity"), 1)));
  const wastePercent = Math.max(0, Number(read(formData, "recipeWastePercent")) || 0);
  const deliveryMethod = ["pickup", "delivery", "install"].includes(read(formData, "deliveryMethod")) ? read(formData, "deliveryMethod") : "pickup";
  const printMethod = ["none", "direct_print", "roll_stock", "roll_print", "roll_stock_applied"].includes(read(formData, "printMethod"))
    ? (["roll_print", "roll_stock_applied"].includes(read(formData, "printMethod")) ? "roll_stock" : read(formData, "printMethod"))
    : "none";
  const printMethods = uniqueStrings(read(formData, "printMethodsCsv").split(",")).filter((value) => ["none", "direct_print", "roll_stock", "roll_print", "roll_stock_applied"].includes(value)).map((value) => ["roll_print", "roll_stock_applied"].includes(value) ? "roll_stock" : value);
  const mainMaterialId = read(formData, "materialId") || null;
  const mainMaterialName = read(formData, "mainMaterialName") || null;
  const mainMaterialIsRoll = read(formData, "mainMaterialIsRoll") === "1";
  const rollMediaId = read(formData, "rollMediaId") || null;
  const rollMediaName = read(formData, "rollMediaName") || null;
  const inkChoices = uniqueStrings(read(formData, "inkChoicesCsv").split(",")).filter((value) => ["none", "cmyk", "white", "cmyk_white"].includes(value));
  const defaultInk = ["none", "cmyk", "white", "cmyk_white"].includes(read(formData, "defaultInk")) ? read(formData, "defaultInk") : (inkChoices[0] || "cmyk");
  const artworkOptions = uniqueStrings(read(formData, "artworkOptionsCsv").split(","))
    .filter((value) => ["client_supplied", "artwork_check", "artwork_required"].includes(value));
  const defaultArtwork = artworkOptions.includes(read(formData, "defaultArtwork"))
    ? read(formData, "defaultArtwork")
    : (artworkOptions[0] || "client_supplied");
  const artworkCheckPrice = Math.max(0, Number(read(formData, "artworkCheckPrice")) || 0);
  const artworkDesignPrice = Math.max(0, Number(read(formData, "artworkDesignPrice")) || 0);
  const deliveryFee = Math.max(0, Number(read(formData, "deliveryFee")) || 0);
  const finishings = read(formData, "finishingsCsv").split(",").map((value) => value.trim()).filter((value) => ["trim_cut", "mount_apply", "eyelets", "finishing", "pack"].includes(value));
  const laminateMaterialIds = uniqueStrings(read(formData, "laminateMaterialIdsCsv").split(","));
  const laminateMaterialNames = parseStringArrayJson(read(formData, "laminateMaterialNamesJson"));
  const defaultLaminateMaterialId = read(formData, "laminateMaterialId") || null;
  const eyeletMaterialId = read(formData, "eyeletMaterialId") || null;
  const eyeletMaterialName = read(formData, "eyeletMaterialName") || null;
  const eyeletPreset = ["four_corners", "top_corners_only", "centre_top_bottom", "pole_fixing", "__custom"].includes(read(formData, "eyeletPreset")) ? read(formData, "eyeletPreset") : "four_corners";

  try {
    const steps = parseProductionFlowSteps(read(formData, "flowJson"));
    await saveProductProductionFlow({
      tenantId: tenant.tenantId,
      productId,
      productName: product.name,
      department: product.department,
      materialId: mainMaterialId,
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
    const nextDefinition = mergeInternalQuoteFields(definition, {
      width,
      height,
      quantity,
      wastePercent,
      mainMaterialId,
      mainMaterialName,
      mainMaterialIsRoll,
      printMethod,
      printMethods,
      rollMediaId,
      rollMediaName,
      inkChoices,
      defaultInk,
      artworkOptions,
      defaultArtwork,
      artworkCheckPrice,
      artworkDesignPrice,
      deliveryMethod,
      deliveryFee,
      finishings,
      laminateMaterialIds,
      laminateMaterialNames,
      defaultLaminateMaterialId,
      eyeletMaterialId,
      eyeletMaterialName,
      eyeletPreset
    });
    await updateConfiguratorDefinitionJson(
      tenant.tenantId,
      template.id,
      nextDefinition
    );
    await updateProductInternalDefaults(tenant.tenantId, productId, {
      widthMm: width,
      heightMm: height,
      quantity,
      deliveryMethod,
      printMethod,
      guidedFields: Array.isArray(nextDefinition.fields) ? nextDefinition.fields : [],
      guidedComponents: Array.isArray(nextDefinition.components) ? nextDefinition.components : []
    });
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
  const mainMaterialId = read(formData, "materialId") || null;

  try {
    const steps = parseProductionFlowSteps(read(formData, "flowJson"));
    await saveProductProductionFlow({
      tenantId: tenant.tenantId,
      productId,
      productName: product.name,
      department: product.department,
      materialId: mainMaterialId,
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
    websiteProductName: read(formData, "websiteProductName") || null,
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
