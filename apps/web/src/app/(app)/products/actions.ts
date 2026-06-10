"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { ensureProductEditorTemplate, updateConfiguratorDefinitionJson } from "@/server/configurators";
import { createProduct, getProductById, updateProduct } from "@/server/products";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function safeNumberString(value: string, fallback: string): string {
  if (!value) return fallback;
  const normalized = value.replace(/,/g, "").trim();
  return Number.isFinite(Number(normalized)) ? normalized : fallback;
}

function keyFromLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "option";
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function labelFromValue(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/(\d+)x(\d+)/i, "$1 × $2 mm");
}

function parseChoice(entry: string) {
  const [rawLabel, rawValue] = entry.includes("=") ? entry.split("=").map((part) => part.trim()) : [entry.trim(), entry.trim()];
  const value = rawValue || keyFromLabel(rawLabel);
  const sizeMatch = value.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*mm)?$/i);

  return {
    id: randomUUID(),
    label: rawLabel.includes("x") || rawLabel.includes("×") ? labelFromValue(rawLabel) : rawLabel || labelFromValue(value),
    value: keyFromLabel(value) === "option" ? value : value.replace(/\s+/g, "_"),
    widthMm: sizeMatch ? sizeMatch[1] : null,
    heightMm: sizeMatch ? sizeMatch[2] : null
  };
}

function quoteField(input: {
  key: string;
  label: string;
  type: string;
  defaultValue: string;
  optionsCsv?: string;
  helpText: string;
  required?: boolean;
  showWhen?: Record<string, unknown> | null;
}) {
  return {
    id: randomUUID(),
    key: input.key,
    label: input.label,
    type: input.type,
    required: input.required ?? true,
    defaultValue: input.defaultValue,
    helpText: input.helpText,
    quoteOnly: true,
    showWhen: input.showWhen ?? null,
    options: splitCsv(input.optionsCsv ?? "").map(parseChoice),
    rule: {
      effectType: "none",
      effectTarget: null,
      effectValue: null,
      effectUnit: null,
      componentLinkMode: "none"
    }
  };
}

function component(input: {
  label: string;
  kind?: string;
  materialId?: string | null;
  role?: string;
  ruleType: string;
  unit: string;
  quantity?: string;
  wastePercent?: string;
  notes: string;
  dimensionSource?: string;
  usageOptionKey?: string | null;
  optionValues?: string[];
  triggerOptionKey?: string | null;
  triggerOptionValues?: string[];
  labourRateName?: string | null;
}) {
  const optionValues = input.optionValues ?? input.triggerOptionValues ?? [];
  return {
    id: randomUUID(),
    kind: input.kind ?? "material",
    role: input.role ?? "base_material",
    materialId: input.materialId ?? null,
    supplierId: null,
    labourRateName: input.labourRateName ?? null,
    label: input.label,
    quantity: input.quantity ?? "1",
    unit: input.unit,
    notes: input.notes,
    ruleType: input.ruleType,
    wastePercent: input.wastePercent ?? "10",
    stockUsage: {
      usageBasis: input.ruleType,
      dimensionSource: input.dimensionSource ?? "finished_size",
      optionKey: input.usageOptionKey ?? input.triggerOptionKey ?? null,
      optionValues,
      widthMm: null,
      heightMm: null,
      rollWidthMm: null,
      partsPerSheet: null,
      metresPerUnit: null,
      sheetsPerUnit: null
    },
    trigger: {
      optionKey: input.triggerOptionKey ?? null,
      optionValue: null,
      optionValues: input.triggerOptionValues ?? []
    }
  };
}

function mergeByKey(existingFields: Array<Record<string, any>>, incomingFields: Array<Record<string, any>>) {
  const existingKeys = new Set(existingFields.map((field) => field.key));
  return [...existingFields, ...incomingFields.filter((field) => !existingKeys.has(field.key))];
}

function mergeByLabel(existingComponents: Array<Record<string, any>>, incomingComponents: Array<Record<string, any>>) {
  const existingLabels = new Set(existingComponents.map((item) => item.label));
  return [...existingComponents, ...incomingComponents.filter((item) => !existingLabels.has(item.label))];
}

function productFamilyForStarter(starterType: string): string {
  switch (starterType) {
    case "banner":
      return "banners";
    case "roll_print":
      return "roll_media";
    case "business_cards":
    case "flyers":
      return "small_format_print";
    case "books":
    case "carbon_books":
      return "display_products";
    default:
      return "rigid_signage";
  }
}

function departmentForStarter(starterType: string): string {
  if (["business_cards", "flyers", "books", "carbon_books"].includes(starterType)) return "small_format";
  return "signage";
}

function starterName(starterType: string): string {
  switch (starterType) {
    case "sign_acm":
      return "Sign - ACM";
    case "sign_corflute":
      return "Sign - Corflute";
    case "sign_acrylic":
      return "Sign - Acrylic";
    case "sign_pvc":
      return "Sign - PVC";
    case "banner":
      return "Banner";
    case "roll_print":
      return "Roll print";
    case "business_cards":
      return "Business cards";
    case "flyers":
      return "Flyers";
    case "books":
      return "Books / pads";
    case "carbon_books":
      return "Duplicate / triplicate books";
    default:
      return "Custom product";
  }
}

function makeBaseMaterialComponent(baseMaterialId: string | null, baseUsage: string, label: string) {
  if (!baseMaterialId) return [];

  if (baseUsage === "whole_sheet") {
    return [component({
      label: label || "Base sheet material",
      materialId: baseMaterialId,
      role: "base_material",
      ruleType: "per_unit",
      unit: "sheet",
      wastePercent: "0",
      dimensionSource: "quantity_only",
      usageOptionKey: "quantity",
      notes: "Base purchased sheet/board for this product. Used as a whole sheet per quoted unit."
    })];
  }

  if (baseUsage === "roll_metres") {
    return [component({
      label: label || "Base roll material",
      materialId: baseMaterialId,
      role: "base_material",
      ruleType: "per_linear_metre",
      unit: "lm",
      dimensionSource: "finished_size",
      usageOptionKey: "finished_size",
      notes: "Base purchased roll stock for this product. Quote size drives metres from the roll."
    })];
  }

  if (baseUsage === "paper_yield") {
    return [component({
      label: label || "Base paper/card stock",
      materialId: baseMaterialId,
      role: "base_material",
      ruleType: "yield_based",
      unit: "sheet",
      dimensionSource: "finished_size",
      usageOptionKey: "finished_size",
      notes: "Base purchased paper/card stock. Finished size and quantity drive parent sheet yield."
    })];
  }

  return [component({
    label: label || "Base sheet material",
    materialId: baseMaterialId,
    role: "base_material",
    ruleType: "yield_based",
    unit: "sheet",
    dimensionSource: "finished_size",
    usageOptionKey: "finished_size",
    notes: "Base purchased sheet/board for this product. Quote size allocates part of the parent sheet."
  })];
}

function makeQuoteBehaviour(starterType: string, baseMaterialId: string | null = null, baseUsage = "part_sheet") {
  const setupPreset = starterType || "sign_acm";
  const baseLabel = `${starterName(setupPreset)} base material`;
  const fields: Array<Record<string, any>> = [];
  const components: Array<Record<string, any>> = [];

  if (["sign_acm", "sign_corflute", "sign_acrylic", "sign_pvc"].includes(setupPreset)) {
    fields.push(
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: "600x900", optionsCsv: "600x900,450x600,300x450,Custom=custom", helpText: "Quote-time sign size. This allocates part of the parent sheet and drives print/laminate area." }),
      quoteField({ key: "print_method", label: "Print type", type: "select", defaultValue: "direct_print", optionsCsv: "Direct print=direct_print,Roll stock applied=roll_stock", helpText: "Direct print uses ink on the base sheet. Roll stock adds a separate roll media layer." }),
      quoteField({ key: "roll_stock_type", label: "Roll stock", type: "select", defaultValue: "white", optionsCsv: "White print vinyl=white,Clear reverse print=clear_reverse", helpText: "Only used when Print type is Roll stock applied.", showWhen: { optionKey: "print_method", optionValues: ["roll_stock"] } }),
      quoteField({ key: "laminate", label: "Laminate", type: "select", defaultValue: "none", optionsCsv: "None=none,Gloss laminate=gloss_laminate,Matt laminate=matt_laminate", helpText: "Optional laminate. Laminate stock is only consumed when gloss or matt is selected." }),
      quoteField({ key: "finishing", label: "Finishing", type: "select", defaultValue: "none", optionsCsv: "None=none,Jingwei cutting=jingwei_cutting,Router/CNC cut=cnc_cut,Drill holes=drill_holes", helpText: "Optional finishing choice for the quoted sign." }),
      quoteField({ key: "quantity", label: "Quantity", type: "quantity", defaultValue: "1", helpText: "Number of finished signs being quoted." })
    );
    components.push(
      ...makeBaseMaterialComponent(baseMaterialId, baseUsage, baseLabel),
      component({ label: "Direct print ink", role: "quote_consumable", ruleType: "per_sqm", unit: "sqm", wastePercent: "5", triggerOptionKey: "print_method", triggerOptionValues: ["direct_print"], notes: "Quote option: only used when Print type is Direct print." }),
      component({ label: "Roll stock layer", role: "quote_selected_material", ruleType: "per_linear_metre", unit: "lm", triggerOptionKey: "print_method", triggerOptionValues: ["roll_stock"], notes: "Optional roll material layer. Link white or clear roll stock material if this product needs it." }),
      component({ label: "Laminate roll", role: "quote_selected_material", ruleType: "per_linear_metre", unit: "lm", triggerOptionKey: "laminate", triggerOptionValues: ["gloss_laminate", "matt_laminate"], notes: "Optional laminate material, triggered by the Laminate quote choice." }),
      component({ label: "Jingwei / cutting labour", kind: "labour", role: "quote_finishing", ruleType: "selected_by_option", unit: "each", triggerOptionKey: "finishing", triggerOptionValues: ["jingwei_cutting", "cnc_cut"], labourRateName: "Cutting", notes: "Only applies when a cutting finish is chosen on the quote." })
    );
  }

  if (setupPreset === "banner") {
    fields.push(
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: "1200x2400", optionsCsv: "900x1800,1200x2400,1500x3000,Custom=custom", helpText: "Banner size. Width/height drive roll media and finishing." }),
      quoteField({ key: "banner_finish", label: "Finishing", type: "select", defaultValue: "hem_eyelets", optionsCsv: "Trim only=trim_only,Hem + eyelets=hem_eyelets,Pole pockets=pole_pockets,Rope track=keder", helpText: "Banner finishing method." }),
      quoteField({ key: "laminate", label: "Laminate", type: "select", defaultValue: "none", optionsCsv: "None=none,Gloss laminate=gloss_laminate,Matt laminate=matt_laminate", helpText: "Usually none for banners, but available if needed." }),
      quoteField({ key: "quantity", label: "Quantity", type: "quantity", defaultValue: "1", helpText: "Number of banners." })
    );
    components.push(
      ...makeBaseMaterialComponent(baseMaterialId, baseUsage === "part_sheet" ? "roll_metres" : baseUsage, baseLabel),
      component({ label: "Banner print ink", role: "quote_consumable", ruleType: "per_sqm", unit: "sqm", wastePercent: "5", notes: "Ink/print coverage driven by banner size." }),
      component({ label: "Eyelets / hem finishing", role: "quote_finishing", ruleType: "selected_by_option", unit: "each", triggerOptionKey: "banner_finish", triggerOptionValues: ["hem_eyelets", "pole_pockets", "keder"], notes: "Finishing consumables/labour triggered by banner finish." })
    );
  }

  if (setupPreset === "roll_print") {
    fields.push(
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: "1000x1000", optionsCsv: "1000x1000,1200x2400,1500x3000,Custom=custom", helpText: "Finished size drives roll stock, print and laminate usage." }),
      quoteField({ key: "roll_stock_type", label: "Roll stock", type: "select", defaultValue: "white", optionsCsv: "White print media=white,Clear reverse print=clear_reverse,Etch/frost=etch", helpText: "Roll media type selected while quoting." }),
      quoteField({ key: "laminate", label: "Laminate", type: "select", defaultValue: "none", optionsCsv: "None=none,Gloss laminate=gloss_laminate,Matt laminate=matt_laminate,Anti-graffiti=anti_graffiti", helpText: "Optional overlaminate." }),
      quoteField({ key: "quantity", label: "Quantity", type: "quantity", defaultValue: "1", helpText: "Number of prints." })
    );
    components.push(
      ...makeBaseMaterialComponent(baseMaterialId, "roll_metres", baseLabel),
      component({ label: "Print ink", role: "quote_consumable", ruleType: "per_sqm", unit: "sqm", wastePercent: "5", notes: "Ink/print area driven by finished size." }),
      component({ label: "Laminate roll", role: "quote_selected_material", ruleType: "per_linear_metre", unit: "lm", triggerOptionKey: "laminate", triggerOptionValues: ["gloss_laminate", "matt_laminate", "anti_graffiti"], notes: "Only used when a laminate is chosen." })
    );
  }

  if (["business_cards", "flyers"].includes(setupPreset)) {
    const isCards = setupPreset === "business_cards";
    fields.push(
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: isCards ? "90x55" : "A5", optionsCsv: isCards ? "90x55,85x55,Custom=custom" : "A4=A4,A5=A5,DL=DL,Custom=custom", helpText: "Small format finished size." }),
      quoteField({ key: "sides", label: "Front / back", type: "select", defaultValue: "double_sided", optionsCsv: "Front only=single_sided,Front and back=double_sided", helpText: "Controls print faces." }),
      quoteField({ key: "cello", label: "Celloglaze", type: "select", defaultValue: "none", optionsCsv: "None=none,Gloss cello=gloss_cello,Matt cello=matt_cello", helpText: "Optional cello. Cello stock is only allocated when selected." }),
      quoteField({ key: "quantity", label: "Quantity", type: "quantity", defaultValue: isCards ? "250" : "100", helpText: "Quantity being quoted." })
    );
    components.push(
      ...makeBaseMaterialComponent(baseMaterialId, baseUsage === "part_sheet" ? "paper_yield" : baseUsage, baseLabel),
      component({ label: "Print faces", role: "quote_consumable", ruleType: "per_unit", unit: "face", quantity: isCards ? "2" : "1", wastePercent: "0", notes: "Print face allowance driven by Front / back and quantity." }),
      component({ label: "Celloglaze", role: "quote_selected_material", ruleType: "per_linear_metre", unit: "lm", triggerOptionKey: "cello", triggerOptionValues: ["gloss_cello", "matt_cello"], notes: "Only used when gloss or matt cello is selected." })
    );
  }

  if (setupPreset === "books") {
    fields.push(
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: "A5", optionsCsv: "A4=A4,A5=A5,DL=DL,Custom=custom", helpText: "Book/pad finished size." }),
      quoteField({ key: "page_count", label: "Pages", type: "quantity", defaultValue: "50", helpText: "Pages per book or pad." }),
      quoteField({ key: "cover_colour", label: "Cover colour", type: "color", defaultValue: "white", optionsCsv: "White=white,Black=black,Blue=blue,Green=green,Red=red,Yellow=yellow", helpText: "Cover stock colour." }),
      quoteField({ key: "binding_type", label: "Binding", type: "select", defaultValue: "pad_binding", optionsCsv: "Pad binding=pad_binding,Saddle stitch=saddle_stitch,Wire bind=wire_bind,Perfect bind=perfect_bind", helpText: "Binding method." }),
      quoteField({ key: "quantity", label: "Quantity", type: "quantity", defaultValue: "25", helpText: "Book/pad quantity." })
    );
    components.push(
      ...makeBaseMaterialComponent(baseMaterialId, baseUsage === "part_sheet" ? "paper_yield" : baseUsage, baseLabel),
      component({ label: "Cover stock", role: "quote_selected_material", ruleType: "per_unit", unit: "cover", notes: "Cover card used per book/pad." }),
      component({ label: "Binding consumable / labour", kind: "labour", role: "quote_finishing", ruleType: "selected_by_option", unit: "each", triggerOptionKey: "binding_type", triggerOptionValues: ["pad_binding", "saddle_stitch", "wire_bind", "perfect_bind"], labourRateName: "Bindery", notes: "Binding time/consumables from the quote selection." })
    );
  }

  if (setupPreset === "carbon_books") {
    fields.push(
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: "A5", optionsCsv: "A4=A4,A5=A5,DL=DL,Custom=custom", helpText: "Carbon book finished size." }),
      quoteField({ key: "page_count", label: "Pages", type: "quantity", defaultValue: "50", helpText: "Numbered pages/sets per book." }),
      quoteField({ key: "copy_set", label: "Copies", type: "select", defaultValue: "duplicate", optionsCsv: "Duplicate=duplicate,Triplicate=triplicate,Quadruplicate=quadruplicate", helpText: "Duplicate/triplicate copy count per set." }),
      quoteField({ key: "copy_colours", label: "Copy colours", type: "select", defaultValue: "white_yellow", optionsCsv: "White / Yellow=white_yellow,White / Yellow / Pink=white_yellow_pink,White / Green / Blue=white_green_blue,Custom=custom", helpText: "Carbonless copy paper colour set." }),
      quoteField({ key: "cover_colour", label: "Cover colour", type: "color", defaultValue: "blue", optionsCsv: "White=white,Black=black,Blue=blue,Green=green,Red=red,Yellow=yellow", helpText: "Cover colour." }),
      quoteField({ key: "tape_colour", label: "Tape colour", type: "color", defaultValue: "black", optionsCsv: "Black=black,White=white,Blue=blue,Red=red,Green=green", helpText: "Binding tape colour." }),
      quoteField({ key: "sequential_numbering", label: "Numbering", type: "select", defaultValue: "yes", optionsCsv: "Yes=yes,No=no", helpText: "Sequential numbering." }),
      quoteField({ key: "quantity", label: "Quantity", type: "quantity", defaultValue: "10", helpText: "Number of books." })
    );
    components.push(
      ...makeBaseMaterialComponent(baseMaterialId, baseUsage === "part_sheet" ? "paper_yield" : baseUsage, baseLabel),
      component({ label: "Carbonless copy sheets", role: "quote_selected_material", ruleType: "yield_based", unit: "sheet", usageOptionKey: "copy_set", optionValues: ["duplicate", "triplicate", "quadruplicate"], notes: "Paper quantity is driven by pages, copy set, size and quantity." }),
      component({ label: "Cover card", role: "quote_selected_material", ruleType: "per_unit", unit: "cover", notes: "Cover card per carbon book." }),
      component({ label: "Binding tape", role: "quote_selected_material", ruleType: "per_linear_metre", unit: "lm", usageOptionKey: "tape_colour", notes: "Tape material chosen by tape colour." }),
      component({ label: "Sequential numbering", kind: "labour", role: "quote_finishing", ruleType: "selected_by_option", unit: "each", triggerOptionKey: "sequential_numbering", triggerOptionValues: ["yes"], labourRateName: "Numbering", notes: "Only applied when numbering is selected." })
    );
  }

  return {
    version: 3,
    setupMode: "base_product_with_quote_behaviour",
    setupPreset,
    productKindLabel: starterName(setupPreset),
    fields,
    components
  };
}

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  return activeTenant;
}

type ProductEditorTemplateInput = {
  productId: string;
  tenantId: string;
};

async function getEditableDefinition(input: ProductEditorTemplateInput) {
  const product = await getProductById(input.tenantId, input.productId);
  if (!product) redirect("/products?error=Product%20not%20found");

  const template = await ensureProductEditorTemplate({
    tenantId: input.tenantId,
    productId: product.id,
    currentTemplateId: product.defaultTemplateId,
    productName: product.name,
    department: product.department,
    productFamily: product.productFamily
  });

  const definition = template.definitionJson as Record<string, any>;
  return {
    product,
    template,
    definition: {
      version: 3,
      setupMode: "base_product_with_quote_behaviour",
      ...definition,
      fields: Array.isArray(definition.fields) ? [...definition.fields] : [],
      components: Array.isArray(definition.components) ? [...definition.components] : []
    }
  };
}

export async function createProductAction(formData: FormData) {
  const activeTenant = await requireTenant();

  const name = readString(formData, "name");
  const sku = readString(formData, "sku");
  const starterType = readString(formData, "starterType") || "sign_acm";
  const baseMaterialId = readString(formData, "baseMaterialId") || null;
  const baseUsage = readString(formData, "baseUsage") || "part_sheet";
  const department = readString(formData, "department") || departmentForStarter(starterType);
  const productFamily = readString(formData, "productFamily") || productFamilyForStarter(starterType);

  if (!name) redirect("/products?error=Product%20name%20is%20required");

  const created = await createProduct({
    tenantId: activeTenant.tenantId,
    sku: sku || null,
    name,
    department,
    productFamily,
    status: "draft",
    calculatorType: "configurator_template",
    defaultTemplateId: null,
    taxCode: "GST"
  });

  if (created.id) {
    const template = await ensureProductEditorTemplate({
      tenantId: activeTenant.tenantId,
      productId: created.id,
      currentTemplateId: null,
      productName: name,
      department,
      productFamily
    });

    await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, makeQuoteBehaviour(starterType, baseMaterialId, baseUsage));
  }

  redirect(`/products?selected=${created.id}&message=Base%20product%20created`);
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

  if (!productId || !name) redirect("/products?error=Product%20selection%20and%20name%20are%20required");

  await updateProduct(activeTenant.tenantId, productId, {
    sku: sku || null,
    name,
    department,
    productFamily,
    status,
    defaultTemplateId: defaultTemplateId || null,
    taxCode: "GST"
  });

  redirect(`/products?selected=${productId}&message=Product%20details%20updated`);
}

export async function applyQuoteBehaviourPresetAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const starterType = readString(formData, "starterType") || "sign_acm";
  const baseMaterialId = readString(formData, "baseMaterialId") || null;
  const baseUsage = readString(formData, "baseUsage") || "part_sheet";

  if (!productId) redirect("/products?error=No%20product%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const next = makeQuoteBehaviour(starterType, baseMaterialId, baseUsage);

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    ...next,
    fields: mergeByKey(definition.fields, next.fields),
    components: mergeByLabel(definition.components, next.components),
    setupPreset: starterType,
    productKindLabel: starterName(starterType)
  });

  redirect(`/products?selected=${productId}&message=Quote%20behaviour%20preset%20applied`);
}

export async function addProductComponentAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");

  if (!productId) redirect("/products?error=No%20product%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const materialId = readString(formData, "materialId") || null;
  const baseUsage = readString(formData, "baseUsage") || "part_sheet";
  const label = readString(formData, "label") || "Base material";
  const triggerOptionKey = readString(formData, "triggerOptionKey") || null;
  const triggerOptionValues = splitCsv(readString(formData, "triggerOptionValuesCsv"));
  const role = triggerOptionKey ? "quote_selected_material" : "base_material";

  let ruleType = "yield_based";
  let unit = "sheet";
  let dimensionSource = "finished_size";
  let usageOptionKey = "finished_size";

  if (baseUsage === "whole_sheet") {
    ruleType = "per_unit";
    unit = "sheet";
    dimensionSource = "quantity_only";
    usageOptionKey = "quantity";
  }

  if (baseUsage === "roll_metres") {
    ruleType = "per_linear_metre";
    unit = "lm";
  }

  if (baseUsage === "area") {
    ruleType = "per_sqm";
    unit = "sqm";
  }

  if (baseUsage === "each") {
    ruleType = "per_unit";
    unit = "each";
    dimensionSource = "quantity_only";
    usageOptionKey = "quantity";
  }

  const nextComponent = component({
    label,
    materialId,
    role,
    ruleType,
    unit,
    quantity: safeNumberString(readString(formData, "quantity"), "1"),
    wastePercent: safeNumberString(readString(formData, "wastePercent"), "10"),
    dimensionSource,
    usageOptionKey,
    triggerOptionKey,
    triggerOptionValues,
    notes: readString(formData, "notes") || "Material linked to this base product."
  });

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    components: [...definition.components, nextComponent]
  });

  redirect(`/products?selected=${productId}&message=Material%20linked%20to%20product`);
}

export async function addProductOptionAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");

  if (!productId) redirect("/products?error=No%20product%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const label = readString(formData, "label") || readString(formData, "questionLabel") || "Quote choice";
  const key = keyFromLabel(readString(formData, "key") || label);
  const fieldType = readString(formData, "fieldType") || "select";
  const defaultAnswer = readString(formData, "defaultAnswer");
  const otherOptionsCsv = readString(formData, "otherOptionsCsv");
  const helpText = readString(formData, "helpText") || "Shown after this product is selected on a quote.";
  const required = readString(formData, "required") !== "no";

  let defaultValue = defaultAnswer || null;
  let options: Array<Record<string, any>> = [];

  if (defaultAnswer) {
    const parsedDefault = parseChoice(defaultAnswer);
    defaultValue = parsedDefault.value;
    options = [parsedDefault, ...splitCsv(otherOptionsCsv).map(parseChoice)];
  }

  const nextField = {
    id: randomUUID(),
    key,
    label,
    type: fieldType,
    required,
    defaultValue,
    helpText,
    quoteOnly: true,
    showWhen: null,
    options,
    rule: {
      effectType: "none",
      effectTarget: null,
      effectValue: null,
      effectUnit: null,
      componentLinkMode: "none"
    }
  };

  const existingIndex = definition.fields.findIndex((field: Record<string, any>) => field.key === key);
  const fields = existingIndex >= 0
    ? definition.fields.map((field: Record<string, any>, index: number) => index === existingIndex ? { ...nextField, id: field.id ?? nextField.id } : field)
    : [...definition.fields, nextField];

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    version: 3,
    fields
  });

  redirect(`/products?selected=${productId}&message=Quote%20choice%20saved`);
}

// Backwards-compatible export for older form names used by previous zips.
export const addStarterRulesAction = applyQuoteBehaviourPresetAction;
