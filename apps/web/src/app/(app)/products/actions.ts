"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { ensureProductEditorTemplate, updateConfiguratorDefinitionJson } from "@/server/configurators";
import { createProduct, getProductById, setProductStatusForTenant, updateProduct } from "@/server/products";

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function safeNumberString(value: string, fallback: string): string {
  if (!value) return fallback;
  const normalized = value.replace(/,/g, "").replace(/\$/g, "").trim();
  return Number.isFinite(Number(normalized)) ? normalized : fallback;
}

function safeMoneyString(value: string, fallback = "0"): string {
  const normalized = safeNumberString(value, fallback);
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount.toFixed(2) : fallback;
}

function optionalNumberString(formData: FormData, key: string, existingValue: unknown = null): string | null {
  if (!formData.has(key)) return existingValue == null ? null : String(existingValue);
  const raw = readString(formData, key);
  if (!raw) return null;
  const normalized = raw.replace(/,/g, "").replace(/\$/g, "").trim();
  return Number.isFinite(Number(normalized)) ? normalized : (existingValue == null ? null : String(existingValue));
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

function splitChoiceEntries(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readStringArray(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((value) => String(value ?? "").trim());
}

function labelFromValue(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/(\d+)x(\d+)/i, "$1 × $2 mm");
}

function parseChoice(entry: string) {
  const pipeParts = entry.split("|").map((part) => part.trim());
  let choicePart = pipeParts[0] ?? "";
  let pricePart = pipeParts.length > 1 ? pipeParts.slice(1).join("|") : "";

  if (!pricePart) {
    const atPrice = choicePart.match(/\s*@\s*\$?(-?\d+(?:\.\d+)?)\s*$/);
    if (atPrice) {
      pricePart = atPrice[1] ?? "0";
      choicePart = choicePart.slice(0, atPrice.index).trim();
    }
  }

  const equalsIndex = choicePart.indexOf("=");
  const rawLabel = equalsIndex >= 0 ? choicePart.slice(0, equalsIndex).trim() : choicePart.trim();
  const rawValue = equalsIndex >= 0 ? choicePart.slice(equalsIndex + 1).trim() : choicePart.trim();
  const value = rawValue || keyFromLabel(rawLabel);
  const sizeMatch = value.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*mm)?$/i);
  return {
    id: randomUUID(),
    label: rawLabel.includes("x") || rawLabel.includes("×") ? labelFromValue(rawLabel) : rawLabel || labelFromValue(value),
    value: keyFromLabel(value) === "option" ? value : value.replace(/\s+/g, "_"),
    priceDelta: "0.00",
    widthMm: sizeMatch ? sizeMatch[1] : null,
    heightMm: sizeMatch ? sizeMatch[2] : null
  };
}

function quoteField(input: {
  key: string;
  label: string;
  type: string;
  defaultValue: string | null;
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
    options: splitChoiceEntries(input.optionsCsv ?? "").map(parseChoice),
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

function sellChargeComponent(input: {
  label: string;
  rate: string;
  unit: "sqm" | "each";
  triggerOptionKey?: string | null;
  triggerOptionValues?: string[];
  notes: string;
}) {
  const ruleType = input.unit === "sqm" ? "sell_sqm" : "sell_each";
  return {
    id: randomUUID(),
    kind: "material",
    role: "quote_sell_charge",
    materialId: null,
    supplierId: null,
    labourRateName: null,
    label: input.label,
    quantity: input.rate,
    unit: input.unit,
    notes: input.notes,
    ruleType,
    wastePercent: "0",
    stockUsage: {
      usageBasis: ruleType,
      dimensionSource: input.unit === "sqm" ? "finished_size" : "quantity_only",
      optionKey: input.triggerOptionKey ?? null,
      optionValues: input.triggerOptionValues ?? [],
      widthMm: null,
      heightMm: null,
      rollWidthMm: null,
      partsPerSheet: null,
      metresPerUnit: null,
      sheetsPerUnit: null,
      sellRate: input.rate,
      chargeName: input.label
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
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: null, optionsCsv: "600x900,450x600,300x450,Custom=custom", helpText: "Quote-time sign size. This allocates part of the parent sheet and drives print/laminate area." }),
      quoteField({ key: "print_method", label: "Print type", type: "select", defaultValue: null, optionsCsv: "Direct print=direct_print,Roll stock applied=roll_stock", helpText: "Direct print uses ink on the base sheet. Roll stock adds a separate roll media layer." }),
      quoteField({ key: "roll_stock_type", label: "Roll stock", type: "select", defaultValue: null, optionsCsv: "White print vinyl=white,Clear reverse print=clear_reverse", helpText: "Only used when Print type is Roll stock applied.", showWhen: { optionKey: "print_method", optionValues: ["roll_stock"] } }),
      quoteField({ key: "white_ink", label: "White ink", type: "yes_no", defaultValue: null, optionsCsv: "No=no,Yes=yes", helpText: "Adds the white ink square-metre charge when required.", showWhen: { optionKey: "print_method", optionValues: ["direct_print", "roll_stock"] } }),
      quoteField({ key: "laminate", label: "Laminate", type: "select", defaultValue: null, optionsCsv: "None=none,Gloss laminate=gloss_laminate,Matt laminate=matt_laminate", helpText: "Optional laminate. Laminate stock is only consumed when gloss or matt is selected." }),
      quoteField({ key: "finishing", label: "Finishing", type: "select", defaultValue: null, optionsCsv: "None=none,Jingwei cutting=jingwei_cutting,Router/CNC cut=cnc_cut,Drill holes=drill_holes", helpText: "Optional finishing choice for the quoted sign." }),
      quoteField({ key: "quantity", label: "Quantity", type: "quantity", defaultValue: "1", helpText: "Number of finished signs being quoted." })
    );
    components.push(
      ...makeBaseMaterialComponent(baseMaterialId, baseUsage, baseLabel),
      sellChargeComponent({ label: "CMYK Ink", rate: "10", unit: "sqm", triggerOptionKey: "print_method", triggerOptionValues: ["direct_print", "roll_stock"], notes: "Simple print charge: finished square metres × $10/m²." }),
      sellChargeComponent({ label: "White Ink", rate: "10", unit: "sqm", triggerOptionKey: "white_ink", triggerOptionValues: ["yes"], notes: "White ink extra: finished square metres × $10/m² when White ink is Yes." }),
      component({ label: "Roll stock layer", role: "quote_selected_material", ruleType: "per_linear_metre", unit: "lm", triggerOptionKey: "print_method", triggerOptionValues: ["roll_stock"], notes: "Optional roll material layer. Link white or clear roll stock material if this product needs it." }),
      component({ label: "Laminate roll", role: "quote_selected_material", ruleType: "per_linear_metre", unit: "lm", triggerOptionKey: "laminate", triggerOptionValues: ["gloss_laminate", "matt_laminate"], notes: "Optional laminate material, triggered by the Laminate quote choice." }),
      component({ label: "Jingwei / cutting labour", kind: "labour", role: "quote_finishing", ruleType: "selected_by_option", unit: "each", triggerOptionKey: "finishing", triggerOptionValues: ["jingwei_cutting", "cnc_cut"], labourRateName: "Cutting", notes: "Only applies when a cutting finish is chosen on the quote." })
    );
  }

  if (setupPreset === "banner") {
    fields.push(
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: null, optionsCsv: "900x1800,1200x2400,1500x3000,Custom=custom", helpText: "Banner size. Width/height drive roll media and finishing." }),
      quoteField({ key: "banner_finish", label: "Finishing", type: "select", defaultValue: null, optionsCsv: "Trim only=trim_only,Hem + eyelets=hem_eyelets,Pole pockets=pole_pockets,Rope track=keder", helpText: "Banner finishing method." }),
      quoteField({ key: "laminate", label: "Laminate", type: "select", defaultValue: null, optionsCsv: "None=none,Gloss laminate=gloss_laminate,Matt laminate=matt_laminate", helpText: "Usually none for banners, but available if needed." }),
      quoteField({ key: "quantity", label: "Quantity", type: "quantity", defaultValue: "1", helpText: "Number of banners." })
    );
    components.push(
      ...makeBaseMaterialComponent(baseMaterialId, baseUsage === "part_sheet" ? "roll_metres" : baseUsage, baseLabel),
      sellChargeComponent({ label: "CMYK Ink", rate: "10", unit: "sqm", notes: "Simple print charge: finished square metres × $10/m²." }),
      component({ label: "Eyelets / hem finishing", role: "quote_finishing", ruleType: "selected_by_option", unit: "each", triggerOptionKey: "banner_finish", triggerOptionValues: ["hem_eyelets", "pole_pockets", "keder"], notes: "Finishing consumables/labour triggered by banner finish." })
    );
  }

  if (setupPreset === "roll_print") {
    fields.push(
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: null, optionsCsv: "1000x1000,1200x2400,1500x3000,Custom=custom", helpText: "Finished size drives roll stock, print and laminate usage." }),
      quoteField({ key: "roll_stock_type", label: "Roll stock", type: "select", defaultValue: null, optionsCsv: "White print media=white,Clear reverse print=clear_reverse,Etch/frost=etch", helpText: "Roll media type selected while quoting." }),
      quoteField({ key: "laminate", label: "Laminate", type: "select", defaultValue: null, optionsCsv: "None=none,Gloss laminate=gloss_laminate,Matt laminate=matt_laminate,Anti-graffiti=anti_graffiti", helpText: "Optional overlaminate." }),
      quoteField({ key: "quantity", label: "Quantity", type: "quantity", defaultValue: "1", helpText: "Number of prints." })
    );
    components.push(
      ...makeBaseMaterialComponent(baseMaterialId, "roll_metres", baseLabel),
      sellChargeComponent({ label: "CMYK Ink", rate: "10", unit: "sqm", notes: "Simple print charge: finished square metres × $10/m²." }),
      component({ label: "Laminate roll", role: "quote_selected_material", ruleType: "per_linear_metre", unit: "lm", triggerOptionKey: "laminate", triggerOptionValues: ["gloss_laminate", "matt_laminate", "anti_graffiti"], notes: "Only used when a laminate is chosen." })
    );
  }

  if (["business_cards", "flyers"].includes(setupPreset)) {
    const isCards = setupPreset === "business_cards";
    fields.push(
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: null, optionsCsv: isCards ? "90x55,85x55,Custom=custom" : "A4=A4,A5=A5,DL=DL,Custom=custom", helpText: "Small format finished size." }),
      quoteField({ key: "sides", label: "Front / back", type: "select", defaultValue: null, optionsCsv: "Front only=single_sided,Front and back=double_sided", helpText: "Controls print faces." }),
      quoteField({ key: "cello", label: "Celloglaze", type: "select", defaultValue: null, optionsCsv: "None=none,Gloss cello=gloss_cello,Matt cello=matt_cello", helpText: "Optional cello. Cello stock is only allocated when selected." }),
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
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: null, optionsCsv: "A4=A4,A5=A5,DL=DL,Custom=custom", helpText: "Book/pad finished size." }),
      quoteField({ key: "page_count", label: "Pages", type: "quantity", defaultValue: "50", helpText: "Pages per book or pad." }),
      quoteField({ key: "cover_colour", label: "Cover colour", type: "color", defaultValue: null, optionsCsv: "White=white,Black=black,Blue=blue,Green=green,Red=red,Yellow=yellow", helpText: "Cover stock colour." }),
      quoteField({ key: "binding_type", label: "Binding", type: "select", defaultValue: null, optionsCsv: "Pad binding=pad_binding,Saddle stitch=saddle_stitch,Wire bind=wire_bind,Perfect bind=perfect_bind", helpText: "Binding method." }),
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
      quoteField({ key: "finished_size", label: "Size", type: "size_select", defaultValue: null, optionsCsv: "A4=A4,A5=A5,DL=DL,Custom=custom", helpText: "Carbon book finished size." }),
      quoteField({ key: "page_count", label: "Pages", type: "quantity", defaultValue: "50", helpText: "Numbered pages/sets per book." }),
      quoteField({ key: "copy_set", label: "Copies", type: "select", defaultValue: null, optionsCsv: "Duplicate=duplicate,Triplicate=triplicate,Quadruplicate=quadruplicate", helpText: "Duplicate/triplicate copy count per set." }),
      quoteField({ key: "copy_colours", label: "Copy colours", type: "select", defaultValue: null, optionsCsv: "White / Yellow=white_yellow,White / Yellow / Pink=white_yellow_pink,White / Green / Blue=white_green_blue,Custom=custom", helpText: "Carbonless copy paper colour set." }),
      quoteField({ key: "cover_colour", label: "Cover colour", type: "color", defaultValue: null, optionsCsv: "White=white,Black=black,Blue=blue,Green=green,Red=red,Yellow=yellow", helpText: "Cover colour." }),
      quoteField({ key: "tape_colour", label: "Tape colour", type: "color", defaultValue: null, optionsCsv: "Black=black,White=white,Blue=blue,Red=red,Green=green", helpText: "Binding tape colour." }),
      quoteField({ key: "sequential_numbering", label: "Numbering", type: "select", defaultValue: null, optionsCsv: "Yes=yes,No=no", helpText: "Sequential numbering." }),
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
  if (!product) redirect("/products/advanced?error=Product%20not%20found");

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

  redirect(`/products/${created.id}?tab=build&message=Product%20created.%20Choose%20the%20material,%20size%20and%20normal%20production%20options.`);
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

  if (!productId || !name) redirect("/products/advanced?error=Product%20selection%20and%20name%20are%20required");

  await updateProduct(activeTenant.tenantId, productId, {
    sku: sku || null,
    name,
    department,
    productFamily,
    status,
    defaultTemplateId: defaultTemplateId || null,
    taxCode: "GST"
  });

  redirect(`/products/advanced?selected=${productId}&message=Product%20details%20updated`);
}

export async function applyQuoteBehaviourPresetAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const starterType = readString(formData, "starterType") || "sign_acm";
  const baseMaterialId = readString(formData, "baseMaterialId") || null;
  const baseUsage = readString(formData, "baseUsage") || "part_sheet";

  if (!productId) redirect("/products/advanced?error=No%20product%20selected");

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

  redirect(`/products/advanced?selected=${productId}&message=Quote%20behaviour%20preset%20applied`);
}

export async function addProductComponentAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");

  if (!productId) redirect("/products/advanced?error=No%20product%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const nextComponent = buildComponentFromForm(formData);

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    components: [...definition.components, nextComponent]
  });

  redirect(`/products/advanced?selected=${productId}&message=Component%20added`);
}

export async function addProductOptionAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const label = readString(formData, "label") || readString(formData, "questionLabel");

  if (!productId) redirect("/products/advanced?error=No%20product%20selected");
  if (!label) redirect(`/products/advanced?selected=${productId}&error=Question%20name%20is%20required`);

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const nextField = buildFieldFromForm(formData);
  const existingIndex = definition.fields.findIndex((field: Record<string, any>) => field.key === nextField.key);
  const fields = existingIndex >= 0
    ? definition.fields.map((field: Record<string, any>, index: number) => index === existingIndex ? { ...nextField, id: field.id ?? nextField.id } : field)
    : [...definition.fields, nextField];

  const linkedComponents = componentsLinkedToOptionRows(formData, nextField);
  const components = [
    ...definition.components.filter((item: Record<string, any>) => !isLinkedToOptionKey(item, nextField.key)),
    ...linkedComponents
  ];

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    version: 3,
    fields,
    components
  });

  redirect(`/products/advanced?selected=${productId}&message=Quote%20option%20saved`);
}

export async function addQuickProductQuestionAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const presetKey = readString(formData, "presetKey");
  const fallbackMaterialId = readString(formData, "fallbackMaterialId") || null;
  const preset = quickQuestionPresetDefinitions[presetKey];

  if (!productId) redirect("/products/advanced?error=No%20product%20selected");
  if (!preset) redirect(`/products/advanced?selected=${productId}&error=Question%20preset%20not%20found`);

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const fieldKey = preset.key;
  const alreadyExists = definition.fields.some((field: Record<string, any>) => String(field.key ?? "") === fieldKey);

  if (alreadyExists) {
    redirect(`/products/advanced?selected=${productId}&message=${encodeURIComponent(`${preset.label} already added`)}`);
  }

  const options = ["select", "size_select", "multi_select", "color", "yes_no"].includes(preset.type)
    ? preset.rows.map((row) => parseChoice(row.answer))
    : [];

  const nextField = {
    id: randomUUID(),
    key: fieldKey,
    label: preset.label,
    type: preset.type,
    required: preset.required,
    defaultValue: preset.type === "quantity" ? "1" : null,
    helpText: "Shown after this product is selected on a quote.",
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

  const linkedComponents = quickQuestionComponents(preset, nextField, fallbackMaterialId);

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    version: 3,
    fields: [...definition.fields, nextField],
    components: [
      ...definition.components.filter((item: Record<string, any>) => !isLinkedToOptionKey(item, fieldKey)),
      ...linkedComponents
    ]
  });

  redirect(`/products/advanced?selected=${productId}&message=${encodeURIComponent(`${preset.label} question added`)}`);
}

function quickQuestionComponents(preset: QuickQuestionPreset, field: Record<string, any>, fallbackMaterialId: string | null): Array<Record<string, any>> {
  const fieldKey = String(field.key ?? "");
  const options = Array.isArray(field.options) ? field.options : [];

  return preset.rows.flatMap((row, index) => {
    const option = options[index] ?? parseChoice(row.answer);
    const optionValue = String(option.value ?? option.label ?? "").trim();
    const usageMode = row.mode || "none";
    const usageAmount = optionalNumberText(row.amount);
    const isChargePerSqm = usageMode === "sqm_charge";
    const isFixedCharge = usageMode === "fixed_charge";
    const isLabour = usageMode === "labour_hours";
    const labourHours = isLabour ? minutesToHoursText(usageAmount) : null;
    const isRoll = usageMode === "roll_metres";
    const isMaterialEach = usageMode === "material_each";
    const isWholeSheet = usageMode === "sheets_per_item";
    const isPartsPerSheet = usageMode === "parts_per_sheet";
    const isMaterialAuto = usageMode === "auto_sheet";
    const isMaterialMode = isMaterialAuto || isPartsPerSheet || isWholeSheet || isRoll || isMaterialEach;

    if (!fieldKey || !optionValue || usageMode === "none") return [];
    if (isMaterialMode && !fallbackMaterialId) return [];
    if ((isChargePerSqm || isFixedCharge || isLabour) && !usageAmount) return [];

    const chargeName = row.chargeName || `${preset.label}: ${String(option.label ?? row.answer)}`;
    const componentLabel = isChargePerSqm || isFixedCharge || isLabour ? chargeName : `${preset.label}: ${String(option.label ?? row.answer)}`;

    return [{
      id: randomUUID(),
      kind: isLabour ? "labour" : "material",
      role: isLabour ? "factory_labour" : (isChargePerSqm || isFixedCharge ? "quote_sell_charge" : "quote_selected_material"),
      materialId: isChargePerSqm || isFixedCharge || isLabour ? null : fallbackMaterialId,
      supplierId: null,
      labourRateName: isLabour ? "Factory" : null,
      label: componentLabel,
      quantity: isLabour ? (labourHours ?? "0") : isFixedCharge ? "1" : isMaterialEach ? (usageAmount ?? "1") : "1",
      unit: isLabour ? "hr" : isChargePerSqm ? "sqm" : isFixedCharge ? "each" : isRoll ? "lm" : isMaterialEach ? "each" : "sheet",
      notes: isLabour
        ? `Labour for ${preset.label} = ${String(option.label ?? row.answer)}. Minutes are converted internally and calculated against the hourly rate.`
        : isChargePerSqm
          ? `Sell charge for ${preset.label} = ${String(option.label ?? row.answer)}. Calculates from finished square metres.`
          : isFixedCharge
            ? `Fixed sell charge for ${preset.label} = ${String(option.label ?? row.answer)}.`
            : `Auto-cost row for ${preset.label} = ${String(option.label ?? row.answer)}.`,
      ruleType: isLabour ? "labour_hours" : isChargePerSqm ? "sell_sqm" : isFixedCharge ? "sell_each" : isRoll ? "per_linear_metre" : (isWholeSheet || isMaterialEach) ? "per_unit" : "yield_based",
      wastePercent: isChargePerSqm || isFixedCharge || isLabour ? "0" : "10",
      stockUsage: {
        usageBasis: isLabour ? "labour_hours" : isChargePerSqm ? "sell_sqm" : isFixedCharge ? "sell_each" : isRoll ? "per_linear_metre" : (isWholeSheet || isMaterialEach) ? "per_unit" : "yield_based",
        dimensionSource: isLabour || isFixedCharge || isMaterialEach ? "quantity_only" : "finished_size",
        optionKey: fieldKey,
        optionValues: [optionValue],
        widthMm: null,
        heightMm: null,
        rollWidthMm: null,
        partsPerSheet: isPartsPerSheet ? usageAmount : null,
        metresPerUnit: isRoll ? usageAmount : null,
        sheetsPerUnit: isWholeSheet ? (usageAmount ?? "1") : null,
        sellRate: isLabour ? "66" : isChargePerSqm || isFixedCharge ? usageAmount : null,
        chargeName: isChargePerSqm || isFixedCharge || isLabour ? chargeName : null
      },
      trigger: {
        optionKey: fieldKey,
        optionValue: null,
        optionValues: [optionValue]
      }
    }];
  });
}

// Backwards-compatible export for older form names used by previous zips.
export const addStarterRulesAction = applyQuoteBehaviourPresetAction;

type CostedOptionRow = {
  answerLabel: string;
  materialId: string | null;
  usageMode: string;
  usageAmount: string | null;
  wastePercent: string;
  notes: string;
  chargeName: string;
  labourRate: string;
  labourMinutes: string | null;
  labourName: string;
  quantityPrompt: string;
  quantityPresets: Array<{ id: string; label: string; value: string; qty: string }>;
  allowCustomQuantity: boolean;
  customQuantityLabel: string;
};

type QuickQuestionPresetRow = {
  answer: string;
  mode: string;
  amount?: string;
  chargeName?: string;
};

type QuickQuestionPreset = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  rows: QuickQuestionPresetRow[];
};

const quickQuestionPresetDefinitions: Record<string, QuickQuestionPreset> = {
  size: {
    key: "size",
    label: "Size",
    type: "size_select",
    required: true,
    rows: [
      { answer: "600 x 900 mm", mode: "parts_per_sheet", amount: "8" },
      { answer: "900 x 1200 mm", mode: "parts_per_sheet", amount: "4" },
      { answer: "1200 x 2400 mm", mode: "sheets_per_item", amount: "1" }
    ]
  },
  print_type: {
    key: "print_type",
    label: "Print type",
    type: "select",
    required: true,
    rows: [
      { answer: "Direct print", mode: "sqm_charge", amount: "10", chargeName: "CMYK Ink" },
      { answer: "SAV 7YR", mode: "auto_sheet", amount: "" },
      { answer: "No print", mode: "none", amount: "" }
    ]
  },
  white_ink: {
    key: "white_ink",
    label: "White ink",
    type: "yes_no",
    required: true,
    rows: [
      { answer: "No", mode: "none", amount: "" },
      { answer: "Yes", mode: "sqm_charge", amount: "10", chargeName: "White Ink" }
    ]
  },
  laminate: {
    key: "laminate",
    label: "Laminate",
    type: "select",
    required: true,
    rows: [
      { answer: "None", mode: "none", amount: "" },
      { answer: "Gloss laminate", mode: "auto_sheet", amount: "" },
      { answer: "Matt laminate", mode: "auto_sheet", amount: "" }
    ]
  },
  finishing: {
    key: "finishing",
    label: "Finishing",
    type: "multi_select",
    required: false,
    rows: [
      { answer: "Jingwei cutting", mode: "labour_hours", amount: "15", chargeName: "Jingwei cutting labour" },
      { answer: "Drill holes", mode: "labour_hours", amount: "6", chargeName: "Drill holes labour" }
    ]
  },
  quantity: {
    key: "quantity",
    label: "Quantity",
    type: "quantity",
    required: true,
    rows: []
  }
};

function optionalNumberText(value: unknown): string | null {
  const raw = String(value ?? "").replace(/,/g, "").replace(/\$/g, "").trim();
  if (!raw) return null;
  return Number.isFinite(Number(raw)) ? raw : null;
}

function minutesToHoursText(value: unknown): string | null {
  const minutesText = optionalNumberText(value);
  if (!minutesText) return null;
  const minutes = Number(minutesText);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.round((minutes / 60) * 1_000_000) / 1_000_000;
  return String(hours);
}

function parseQuantityPresets(value: string): Array<{ id: string; label: string; value: string; qty: string }> {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split("=").map((part) => part.trim());
      const label = parts[0] || "Quantity";
      const rawQty = parts[1] ?? parts[0] ?? "";
      const isCustom = rawQty.toLowerCase() === "custom" || label.toLowerCase().includes("custom");
      const qty = isCustom ? "custom" : safeNumberString(rawQty, "1");
      return {
        id: randomUUID(),
        label,
        value: isCustom ? "__custom" : keyFromLabel(label),
        qty
      };
    });
}

function quantityFollowUpPayload(row: CostedOptionRow) {
  const presets = row.quantityPresets.filter((preset) => preset.qty === "custom" || Number.isFinite(Number(preset.qty)));
  const hasFollowUp = Boolean(row.quantityPrompt || presets.length > 0 || row.allowCustomQuantity);
  return {
    quantitySource: hasFollowUp ? "follow_up" : null,
    quantityPrompt: row.quantityPrompt || null,
    quantityPresets: presets,
    allowCustomQuantity: row.allowCustomQuantity,
    customQuantityLabel: row.customQuantityLabel || "Custom quantity"
  };
}

function costedOptionRowsFromForm(formData: FormData): CostedOptionRow[] {
  const labels = readStringArray(formData, "optionAnswerLabel");
  const materialIds = readStringArray(formData, "optionMaterialId");
  const usageModes = readStringArray(formData, "optionUsageMode");
  const usageAmounts = readStringArray(formData, "optionUsageAmount");
  const wastePercents = readStringArray(formData, "optionWastePercent");
  const notes = readStringArray(formData, "optionNotes");
  const chargeNames = readStringArray(formData, "optionChargeName");
  const labourRates = readStringArray(formData, "optionLabourRate");
  const labourMinutes = readStringArray(formData, "optionLabourMinutes");
  const labourNames = readStringArray(formData, "optionLabourName");
  const quantityPrompts = readStringArray(formData, "optionQuantityPrompt");
  const quantityPresets = readStringArray(formData, "optionQuantityPresets");
  const allowCustomQuantities = readStringArray(formData, "optionAllowCustomQuantity");
  const customQuantityLabels = readStringArray(formData, "optionCustomQuantityLabel");
  const totalRows = Math.max(labels.length, materialIds.length, usageModes.length, usageAmounts.length, wastePercents.length, notes.length, chargeNames.length, labourRates.length, labourMinutes.length, labourNames.length, quantityPrompts.length, quantityPresets.length, allowCustomQuantities.length, customQuantityLabels.length);

  const rows: CostedOptionRow[] = [];
  for (let index = 0; index < totalRows; index += 1) {
    const answerLabel = String(labels[index] ?? "").trim();
    if (!answerLabel) continue;

    rows.push({
      answerLabel,
      materialId: String(materialIds[index] ?? "").trim() || null,
      usageMode: String(usageModes[index] ?? "auto_sheet").trim() || "auto_sheet",
      usageAmount: optionalNumberText(usageAmounts[index]),
      wastePercent: safeNumberString(String(wastePercents[index] ?? "10"), "10"),
      notes: String(notes[index] ?? "").trim(),
      chargeName: String(chargeNames[index] ?? "").trim(),
      labourRate: safeNumberString(String(labourRates[index] ?? "66"), "66"),
      labourMinutes: optionalNumberText(labourMinutes[index]),
      labourName: String(labourNames[index] ?? "").trim(),
      quantityPrompt: String(quantityPrompts[index] ?? "").trim(),
      quantityPresets: parseQuantityPresets(String(quantityPresets[index] ?? "")),
      allowCustomQuantity: String(allowCustomQuantities[index] ?? "no") === "yes",
      customQuantityLabel: String(customQuantityLabels[index] ?? "Custom quantity").trim() || "Custom quantity"
    });
  }

  return rows;
}

function componentsLinkedToOptionRows(formData: FormData, field: Record<string, any>): Array<Record<string, any>> {
  const fieldKey = String(field.key ?? "");
  const options = Array.isArray(field.options) ? field.options : [];
  const rows = costedOptionRowsFromForm(formData);

  return rows.flatMap((row, index) => {
    const option = options[index] ?? parseChoice(row.answerLabel);
    const optionValue = String(option.value ?? option.label ?? "").trim();
    if (!fieldKey || !optionValue) return [];

    const usageMode = row.usageMode || "none";

    const usageAmount = row.usageAmount;
    const isChargePerSqm = usageMode === "sqm_charge";
    const isFixedCharge = usageMode === "fixed_charge";
    const isLabour = usageMode === "labour_hours";
    const labourHours = isLabour ? minutesToHoursText(usageAmount) : null;
    const extraLabourHours = minutesToHoursText(row.labourMinutes);
    const isRoll = usageMode === "roll_metres";
    const isMaterialEach = usageMode === "material_each";
    const isWholeSheet = usageMode === "sheets_per_item";
    const isPartsPerSheet = usageMode === "parts_per_sheet";
    const isMaterialAuto = usageMode === "auto_sheet";
    const isMaterialMode = isMaterialAuto || isPartsPerSheet || isWholeSheet || isRoll || isMaterialEach;

    if (usageMode === "none" && !extraLabourHours) return [];

    if (usageMode === "none" && extraLabourHours) {
      const labourLabel = row.labourName || `${String(field.label ?? "Option")}: ${String(option.label ?? row.answerLabel)} labour`;
      return [{
        id: randomUUID(),
        kind: "labour",
        role: "factory_labour",
        materialId: null,
        supplierId: null,
        labourRateName: "Factory",
        label: labourLabel,
        quantity: extraLabourHours,
        unit: "hr",
        notes: `Labour for ${String(field.label ?? "option")} = ${String(option.label ?? row.answerLabel)}.`,
        ruleType: "labour_hours",
        wastePercent: "0",
        stockUsage: {
          usageBasis: "labour_hours",
          dimensionSource: "quantity_only",
          optionKey: fieldKey,
          optionValues: [optionValue],
          widthMm: null,
          heightMm: null,
          rollWidthMm: null,
          partsPerSheet: null,
          metresPerUnit: null,
          sheetsPerUnit: null,
          sellRate: row.labourRate,
          chargeName: labourLabel,
          ...quantityFollowUpPayload(row)
        },
        trigger: {
          optionKey: fieldKey,
          optionValue: null,
          optionValues: [optionValue]
        }
      }];
    }

    if (isMaterialMode && !row.materialId) return [];
    if ((isChargePerSqm || isFixedCharge || isLabour) && !usageAmount) return [];

    const chargeName = row.chargeName || `${String(field.label ?? "Charge")}: ${String(option.label ?? row.answerLabel)}`;
    const componentLabel = isChargePerSqm || isFixedCharge || isLabour
      ? chargeName
      : `${String(field.label ?? "Option")}: ${String(option.label ?? row.answerLabel)}`;
    const quantityFollowUp = quantityFollowUpPayload(row);

    const nextComponents: Array<Record<string, any>> = [{
      id: randomUUID(),
      kind: isLabour ? "labour" : "material",
      role: isLabour ? "factory_labour" : (isChargePerSqm || isFixedCharge ? "quote_sell_charge" : "quote_selected_material"),
      materialId: isChargePerSqm || isFixedCharge || isLabour ? null : row.materialId,
      supplierId: null,
      labourRateName: isLabour ? "Factory" : null,
      label: componentLabel,
      quantity: isLabour ? (labourHours ?? "0") : isFixedCharge ? "1" : isMaterialEach ? (usageAmount ?? "1") : "1",
      unit: isLabour ? "hr" : isChargePerSqm ? "sqm" : isFixedCharge ? "each" : isRoll ? "lm" : isMaterialEach ? "each" : "sheet",
      notes: row.notes || (isLabour
        ? `Labour for ${String(field.label ?? "option")} = ${String(option.label ?? row.answerLabel)}. Minutes are converted internally and calculated against the hourly rate.`
        : isChargePerSqm
          ? `Sell charge for ${String(field.label ?? "option")} = ${String(option.label ?? row.answerLabel)}. Calculates from finished square metres.`
          : isFixedCharge
            ? `Fixed sell charge for ${String(field.label ?? "option")} = ${String(option.label ?? row.answerLabel)}.`
            : `Auto-cost row for ${String(field.label ?? "option")} = ${String(option.label ?? row.answerLabel)}.`),
      ruleType: isLabour ? "labour_hours" : isChargePerSqm ? "sell_sqm" : isFixedCharge ? "sell_each" : isRoll ? "per_linear_metre" : (isWholeSheet || isMaterialEach) ? "per_unit" : "yield_based",
      wastePercent: isChargePerSqm || isFixedCharge || isLabour ? "0" : row.wastePercent,
      stockUsage: {
        usageBasis: isLabour ? "labour_hours" : isChargePerSqm ? "sell_sqm" : isFixedCharge ? "sell_each" : isRoll ? "per_linear_metre" : (isWholeSheet || isMaterialEach) ? "per_unit" : "yield_based",
        dimensionSource: isLabour || isFixedCharge || isMaterialEach ? "quantity_only" : "finished_size",
        optionKey: fieldKey,
        optionValues: [optionValue],
        widthMm: null,
        heightMm: null,
        rollWidthMm: null,
        partsPerSheet: isPartsPerSheet ? usageAmount : null,
        metresPerUnit: isRoll ? usageAmount : null,
        sheetsPerUnit: isWholeSheet ? (usageAmount ?? "1") : null,
        sellRate: isLabour ? row.labourRate : isChargePerSqm || isFixedCharge ? usageAmount : null,
        chargeName: isChargePerSqm || isFixedCharge || isLabour ? chargeName : null,
        ...quantityFollowUp
      },
      trigger: {
        optionKey: fieldKey,
        optionValue: null,
        optionValues: [optionValue]
      }
    }];

    if (!isLabour && extraLabourHours) {
      const labourLabel = row.labourName || `${String(field.label ?? "Option")}: ${String(option.label ?? row.answerLabel)} labour`;
      nextComponents.push({
        id: randomUUID(),
        kind: "labour",
        role: "factory_labour",
        materialId: null,
        supplierId: null,
        labourRateName: "Factory",
        label: labourLabel,
        quantity: extraLabourHours,
        unit: "hr",
        notes: `Labour for ${String(field.label ?? "option")} = ${String(option.label ?? row.answerLabel)}.`,
        ruleType: "labour_hours",
        wastePercent: "0",
        stockUsage: {
          usageBasis: "labour_hours",
          dimensionSource: "quantity_only",
          optionKey: fieldKey,
          optionValues: [optionValue],
          widthMm: null,
          heightMm: null,
          rollWidthMm: null,
          partsPerSheet: null,
          metresPerUnit: null,
          sheetsPerUnit: null,
          sellRate: row.labourRate,
          chargeName: labourLabel,
          ...quantityFollowUpPayload(row)
        },
        trigger: {
          optionKey: fieldKey,
          optionValue: null,
          optionValues: [optionValue]
        }
      });
    }

    return nextComponents;
  });
}

function isLinkedToOptionKey(item: Record<string, any>, optionKey: string): boolean {
  const triggerKey = String(item.trigger?.optionKey ?? "");
  const stockKey = String(item.stockUsage?.optionKey ?? "");
  const stockValues = Array.isArray(item.stockUsage?.optionValues) ? item.stockUsage.optionValues : [];
  return triggerKey === optionKey || (stockKey === optionKey && stockValues.length > 0);
}

function fieldOptionCsv(field: Record<string, any>, includeDefault: boolean): string {
  const defaultValue = String(field.defaultValue ?? "");
  const options = Array.isArray(field.options) ? field.options : [];
  return options
    .filter((option: Record<string, any>) => includeDefault || (String(option.value ?? option.label ?? "") !== defaultValue && String(option.label ?? option.value ?? "") !== defaultValue))
    .map((option: Record<string, any>) => {
      const label = String(option.label ?? option.value ?? "").trim();
      const value = String(option.value ?? label).trim();
      const choiceText = !label || label === value ? value : `${label}=${value}`;
      return choiceText;
    })
    .filter(Boolean)
    .join("\n");
}

function buildFieldFromForm(formData: FormData, existingField?: Record<string, any>) {
  const label = readString(formData, "label") || readString(formData, "questionLabel") || existingField?.label || "New quote card";
  const key = keyFromLabel(readString(formData, "key") || existingField?.key || label);
  const fieldType = readString(formData, "fieldType") || existingField?.type || "select";
  const defaultAnswer = readString(formData, "defaultAnswer");
  const defaultPrice = "0.00";
  const otherOptionsCsv = readString(formData, "otherOptionsCsv");
  const helpText = readString(formData, "helpText") || existingField?.helpText || "Shown after this product is selected on a quote.";
  const required = readString(formData, "required") !== "no";
  const showWhenKey = keyFromLabel(readString(formData, "showWhenOptionKey"));
  const showWhenValues = splitCsv(readString(formData, "showWhenOptionValuesCsv")).map((value) => keyFromLabel(value) === "option" ? value : value.replace(/\s+/g, "_"));

  let defaultValue: string | null = null;
  let options: Array<Record<string, any>> = [];

  const costedRows = costedOptionRowsFromForm(formData);

  if (["select", "size_select", "multi_select", "color", "yes_no"].includes(fieldType)) {
    if (costedRows.length > 0) {
      options = costedRows.map((row) => parseChoice(row.answerLabel));
      defaultValue = null;
    } else if (defaultAnswer) {
      const parsedDefault = { ...parseChoice(defaultAnswer), priceDelta: defaultPrice };
      defaultValue = parsedDefault.value;
      options = [parsedDefault, ...splitChoiceEntries(otherOptionsCsv).map(parseChoice)];
    } else if (existingField?.defaultValue) {
      defaultValue = String(existingField.defaultValue);
      options = Array.isArray(existingField.options) ? existingField.options : [];
    }
  } else {
    defaultValue = defaultAnswer || String(existingField?.defaultValue ?? "") || null;
    options = [];
  }

  return {
    id: existingField?.id ?? randomUUID(),
    key,
    label,
    type: fieldType,
    required,
    defaultValue,
    helpText,
    quoteOnly: true,
    showWhen: showWhenKey && showWhenKey !== "option" ? { optionKey: showWhenKey, optionValues: showWhenValues } : null,
    options,
    rule: existingField?.rule ?? {
      effectType: "none",
      effectTarget: null,
      effectValue: null,
      effectUnit: null,
      componentLinkMode: "none"
    }
  };
}

function usagePresetFromComponent(item: Record<string, any>): string {
  const ruleType = String(item.ruleType ?? item.stockUsage?.usageBasis ?? "yield_based");
  if (ruleType === "per_linear_metre") return "roll_metres";
  if (ruleType === "per_sqm") return "area";
  if (ruleType === "per_unit" && String(item.unit ?? "") === "sheet") return "whole_sheet";
  if (ruleType === "per_unit") return "each";
  if (ruleType === "yield_based" && String(item.role ?? "") !== "base_material") return "paper_yield";
  return "part_sheet";
}

function buildComponentFromForm(formData: FormData, existingComponent?: Record<string, any>) {
  const materialId = readString(formData, "materialId") || null;
  const baseUsage = readString(formData, "baseUsage") || usagePresetFromComponent(existingComponent ?? {});
  const label = readString(formData, "label") || existingComponent?.label || "Material";
  const triggerOptionKeyRaw = readString(formData, "triggerOptionKey");
  const triggerOptionKey = triggerOptionKeyRaw ? keyFromLabel(triggerOptionKeyRaw) : null;
  const triggerOptionValues = splitCsv(readString(formData, "triggerOptionValuesCsv")).map((value) => keyFromLabel(value) === "option" ? value : value.replace(/\s+/g, "_"));
  const kind = readString(formData, "kind") || existingComponent?.kind || "material";
  const isSellChargeUsage = ["sell_sqm", "sell_each"].includes(baseUsage);
  const isLabourUsage = baseUsage === "labour_hours";
  const isOutsourceUsage = baseUsage === "outsourced_each";
  const role = isSellChargeUsage
    ? "quote_sell_charge"
    : isLabourUsage
      ? "factory_labour"
      : isOutsourceUsage
        ? "outsourced_item"
        : triggerOptionKey
          ? (kind === "labour" ? "quote_finishing" : "quote_selected_material")
          : (readString(formData, "role") || existingComponent?.role || "base_material");

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

  if (baseUsage === "paper_yield") {
    ruleType = "yield_based";
    unit = "sheet";
  }

  if (baseUsage === "each") {
    ruleType = "per_unit";
    unit = readString(formData, "unit") || existingComponent?.unit || "each";
    dimensionSource = "quantity_only";
    usageOptionKey = "quantity";
  }

  if (baseUsage === "choice_only") {
    ruleType = "choice_only";
    unit = "choice";
    dimensionSource = "quantity_only";
    usageOptionKey = triggerOptionKey ?? "quantity";
  }

  if (baseUsage === "sell_sqm") {
    ruleType = "sell_sqm";
    unit = "sqm";
    dimensionSource = "finished_size";
    usageOptionKey = "finished_size";
  }

  if (baseUsage === "sell_each") {
    ruleType = "sell_each";
    unit = "each";
    dimensionSource = "quantity_only";
    usageOptionKey = "quantity";
  }

  if (baseUsage === "labour_hours") {
    ruleType = "labour_hours";
    unit = "hr";
    dimensionSource = "quantity_only";
    usageOptionKey = "quantity";
  }

  if (baseUsage === "outsourced_each") {
    ruleType = "outsourced_each";
    unit = "each";
    dimensionSource = "quantity_only";
    usageOptionKey = "quantity";
  }

  const existingStockUsage = existingComponent?.stockUsage ?? {};
  const sellRate = optionalNumberString(formData, "sellRate", existingStockUsage?.sellRate ?? null);
  const quantity = isLabourUsage
    ? (minutesToHoursText(readString(formData, "labourMinutes")) ?? String(existingComponent?.quantity ?? "0"))
    : safeNumberString(readString(formData, "quantity"), String(existingComponent?.quantity ?? "1"));

  return {
    id: existingComponent?.id ?? randomUUID(),
    kind,
    role,
    materialId: ["choice_only", "sell_sqm", "sell_each", "labour_hours", "outsourced_each"].includes(baseUsage) ? null : materialId,
    supplierId: existingComponent?.supplierId ?? null,
    labourRateName: readString(formData, "labourRateName") || existingComponent?.labourRateName || null,
    label,
    quantity,
    unit,
    notes: readString(formData, "notes") || existingComponent?.notes || "Material linked to this product.",
    ruleType,
    wastePercent: safeNumberString(readString(formData, "wastePercent"), String(existingComponent?.wastePercent ?? "10")),
    stockUsage: {
      ...existingStockUsage,
      usageBasis: ruleType,
      dimensionSource,
      optionKey: triggerOptionKey ?? usageOptionKey,
      optionValues: triggerOptionValues,
      widthMm: optionalNumberString(formData, "componentWidthMm", existingStockUsage?.widthMm ?? null),
      heightMm: optionalNumberString(formData, "componentHeightMm", existingStockUsage?.heightMm ?? null),
      rollWidthMm: optionalNumberString(formData, "componentRollWidthMm", existingStockUsage?.rollWidthMm ?? null),
      partsPerSheet: optionalNumberString(formData, "partsPerSheet", existingStockUsage?.partsPerSheet ?? null),
      metresPerUnit: optionalNumberString(formData, "metresPerUnit", existingStockUsage?.metresPerUnit ?? null),
      sheetsPerUnit: optionalNumberString(formData, "sheetsPerUnit", existingStockUsage?.sheetsPerUnit ?? null),
      sellRate,
      chargeName: ["choice_only", "sell_sqm", "sell_each", "labour_hours", "outsourced_each"].includes(baseUsage) ? label : (existingStockUsage?.chargeName ?? null)
    },
    trigger: {
      optionKey: triggerOptionKey,
      optionValue: null,
      optionValues: triggerOptionValues
    }
  };
}


function upsertWorkflowField(fields: Array<Record<string, any>>, nextField: Record<string, any>, preferredOrder: string[] = []) {
  const without = fields.filter((field) => String(field.key ?? "") !== String(nextField.key ?? ""));
  const merged = [...without, nextField];
  if (preferredOrder.length === 0) return merged;
  return merged.sort((a, b) => {
    const ai = preferredOrder.indexOf(String(a.key ?? ""));
    const bi = preferredOrder.indexOf(String(b.key ?? ""));
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
}

function removeWorkflowFields(fields: Array<Record<string, any>>, keys: string[]) {
  const keySet = new Set(keys);
  return fields.filter((field) => !keySet.has(String(field.key ?? "")));
}

function removeWorkflowComponents(components: Array<Record<string, any>>, matcher: (item: Record<string, any>) => boolean) {
  return components.filter((item) => !matcher(item));
}

function workflowOption(label: string, value: string) {
  return {
    id: randomUUID(),
    label,
    value,
    priceDelta: "0.00",
    widthMm: null,
    heightMm: null
  };
}

function workflowField(input: { key: string; label: string; type: string; required?: boolean; defaultValue: string | null; helpText: string; options?: Array<Record<string, any>>; showWhen?: Record<string, unknown> | null }) {
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
    options: input.options ?? [],
    rule: {
      effectType: "none",
      effectTarget: null,
      effectValue: null,
      effectUnit: null,
      componentLinkMode: "none"
    }
  };
}

function componentTriggerKey(item: Record<string, any>): string {
  return String(item.trigger?.optionKey ?? item.stockUsage?.optionKey ?? "");
}

function componentLabelText(item: Record<string, any>): string {
  return String(item.label ?? "").toLowerCase();
}

function isWorkflowBaseMaterial(item: Record<string, any>): boolean {
  const role = String(item.role ?? "");
  const label = componentLabelText(item);
  return role === "base_material" || label.includes("substrate") || label.includes("base material") || label.includes("main material");
}

function isWorkflowPrintMedia(item: Record<string, any>): boolean {
  const role = String(item.role ?? "");
  const label = componentLabelText(item);
  const triggerKey = componentTriggerKey(item);
  return (role === "quote_selected_material" && (triggerKey === "print_method" || triggerKey === "print_type")) || label.includes("roll stock") || label.includes("print media");
}

function isWorkflowInkCharge(item: Record<string, any>): boolean {
  const label = componentLabelText(item);
  const rule = String(item.ruleType ?? item.stockUsage?.usageBasis ?? "");
  const triggerKey = componentTriggerKey(item);
  return label.includes("ink") || (rule === "sell_sqm" && ["white_ink", "ink", "print_method", "print_type"].includes(triggerKey));
}

function isWorkflowLaminate(item: Record<string, any>): boolean {
  const label = componentLabelText(item);
  const triggerKey = componentTriggerKey(item);
  return triggerKey === "laminate" || label.includes("laminate") || label.includes("cello");
}

function isWorkflowFinishing(item: Record<string, any>): boolean {
  const label = componentLabelText(item);
  const role = String(item.role ?? "");
  const triggerKey = componentTriggerKey(item);
  return triggerKey === "finishing" || role.includes("finishing") || label.includes("jingwei") || label.includes("router") || label.includes("cnc") || label.includes("drill") || label.includes("eyelet");
}

const workflowFieldOrder = ["finished_size", "size", "print_method", "ink", "white_ink", "laminate", "finishing", "quantity"];

function redirectWorkflow(productId: string, query: string, step: string, message: string) {
  const params = new URLSearchParams();
  params.set("selected", productId);
  if (query) params.set("q", query);
  if (step) params.set("step", step);
  params.set("message", message);
  redirect(`/products/advanced?${params.toString()}`);
}

export async function saveProductWorkflowStepAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const step = readString(formData, "workflowStep");
  const nextStep = readString(formData, "nextStep");
  const query = readString(formData, "query");

  if (!productId) redirect("/products/advanced?error=No%20product%20selected");
  if (!step) redirect(`/products/advanced?selected=${productId}&error=No%20workflow%20step%20selected`);

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  let fields = Array.isArray(definition.fields) ? [...definition.fields] : [];
  let components = Array.isArray(definition.components) ? [...definition.components] : [];

  if (step === "main_material") {
    const materialId = readString(formData, "materialId");
    if (!materialId) redirectWorkflow(productId, query, "main_material", "Choose a material first");
    const label = readString(formData, "materialName") || "Main material";
    components = removeWorkflowComponents(components, isWorkflowBaseMaterial);
    components.push(component({
      label,
      materialId,
      role: "base_material",
      ruleType: "yield_based",
      unit: "sheet",
      dimensionSource: "finished_size",
      usageOptionKey: "finished_size",
      notes: "Main product material selected in the guided workflow. Quote size allocates part of the parent sheet."
    }));
    await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, { ...definition, version: 3, fields, components });
    redirectWorkflow(productId, query, nextStep || "print_types", "Main material saved");
  }

  if (step === "print_types") {
    const selected = readStringArray(formData, "printType").filter(Boolean);
    if (selected.length === 0) redirectWorkflow(productId, query, "print_types", "Choose at least one print type");
    const types = selected;
    const options = types.map((value) => value === "roll_stock" ? workflowOption("Roll stock applied", "roll_stock") : workflowOption("Direct print", "direct_print"));
    const nextField = workflowField({
      key: "print_method",
      label: "Print type",
      type: "select",
      defaultValue: null,
      helpText: "Staff choose whether this product is direct printed or uses a roll-stock layer.",
      options
    });
    fields = upsertWorkflowField(removeWorkflowFields(fields, ["print_type"]), nextField, workflowFieldOrder);
    if (!types.includes("roll_stock")) {
      components = removeWorkflowComponents(components, isWorkflowPrintMedia);
    }
    await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, { ...definition, version: 3, fields, components });
    redirectWorkflow(productId, query, types.includes("roll_stock") ? (nextStep || "roll_media") : "ink", "Print types saved");
  }

  if (step === "roll_media") {
    const materialId = readString(formData, "materialId");
    if (!materialId) redirectWorkflow(productId, query, "roll_media", "Choose one roll stock first");
    const label = readString(formData, "materialName") || "Roll stock print media";
    components = removeWorkflowComponents(components, isWorkflowPrintMedia);
    components.push(component({
      label,
      materialId,
      role: "quote_selected_material",
      ruleType: "per_linear_metre",
      unit: "lm",
      dimensionSource: "finished_size",
      triggerOptionKey: "print_method",
      triggerOptionValues: ["roll_stock"],
      notes: "Roll stock selected in the guided workflow. Only applies when Print type is Roll stock applied."
    }));
    await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, { ...definition, version: 3, fields, components });
    redirectWorkflow(productId, query, nextStep || "ink", "Roll stock saved");
  }

  if (step === "ink") {
    const selected = readStringArray(formData, "inkChoice").filter(Boolean);
    if (selected.length === 0) redirectWorkflow(productId, query, "ink", "Choose at least one ink option");
    const choices = selected;
    const optionLabels: Record<string, string> = { cmyk: "CMYK", white: "White", cmyk_white: "CMYK + White" };
    const rates: Record<string, string> = { cmyk: "10", white: "10", cmyk_white: "20" };
    const chargeLabels: Record<string, string> = { cmyk: "CMYK Ink", white: "White Ink", cmyk_white: "CMYK + White Ink" };
    const options = choices.map((value) => workflowOption(optionLabels[value] ?? labelFromValue(value), value));
    const nextField = workflowField({
      key: "ink",
      label: "Ink",
      type: "select",
      defaultValue: null,
      helpText: "Staff choose the ink mode. CMYK is $10/m², white adds another $10/m² when available.",
      options,
      showWhen: { optionKey: "print_method", optionValues: ["direct_print", "roll_stock"] }
    });
    fields = upsertWorkflowField(removeWorkflowFields(fields, ["white_ink"]), nextField, workflowFieldOrder);
    components = removeWorkflowComponents(components, isWorkflowInkCharge);
    components.push(...choices.map((value) => sellChargeComponent({
      label: chargeLabels[value] ?? `${optionLabels[value] ?? value} Ink`,
      rate: rates[value] ?? "10",
      unit: "sqm",
      triggerOptionKey: "ink",
      triggerOptionValues: [value],
      notes: `${optionLabels[value] ?? value} ink charge selected in the guided workflow.`
    })));
    await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, { ...definition, version: 3, fields, components });
    redirectWorkflow(productId, query, nextStep || "laminate", "Ink choices saved");
  }

  if (step === "laminate") {
    const packed = readStringArray(formData, "laminateMaterialPacked").filter(Boolean);
    const materialIds = packed.map((entry) => entry.split("|||")[0] ?? "").filter(Boolean);
    const names = packed.map((entry, index) => entry.split("|||")[1] || `Laminate ${index + 1}`);
    const options = [workflowOption("None", "none"), ...materialIds.map((materialId, index) => workflowOption(names[index] || `Laminate ${index + 1}`, keyFromLabel(names[index] || materialId)) )];
    const nextField = workflowField({
      key: "laminate",
      label: "Laminate",
      type: "select",
      defaultValue: null,
      helpText: "Staff choose none or one laminate material. Selected laminate is costed from roll length.",
      options
    });
    fields = upsertWorkflowField(fields, nextField, workflowFieldOrder);
    components = removeWorkflowComponents(components, isWorkflowLaminate);
    components.push(...materialIds.map((materialId, index) => component({
      label: names[index] || `Laminate ${index + 1}`,
      materialId,
      role: "quote_selected_material",
      ruleType: "per_linear_metre",
      unit: "lm",
      dimensionSource: "finished_size",
      triggerOptionKey: "laminate",
      triggerOptionValues: [keyFromLabel(names[index] || materialId)],
      notes: "Laminate selected in the guided workflow. Only applies when this laminate is chosen on a quote."
    })));
    await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, { ...definition, version: 3, fields, components });
    redirectWorkflow(productId, query, nextStep || "finishing", "Laminate choices saved");
  }

  if (step === "finishing") {
    const selected = readStringArray(formData, "finishingChoice").filter(Boolean);
    const options = selected.map((value) => workflowOption(labelFromValue(value), value));
    const nextField = workflowField({
      key: "finishing",
      label: "Finishing",
      type: "multi_select",
      required: false,
      defaultValue: null,
      helpText: "Staff can tick multiple finishing processes. Each selected item can add labour or hardware.",
      options
    });
    fields = upsertWorkflowField(fields, nextField, workflowFieldOrder);
    components = removeWorkflowComponents(components, isWorkflowFinishing);

    const labourHours: Record<string, string> = { jingwei_cutting: "0.25", router_cnc_cut: "0.50", drill_holes: "0.10" };
    const labelMap: Record<string, string> = { jingwei_cutting: "Jingwei cutting", router_cnc_cut: "Router/CNC cut", drill_holes: "Drill holes", eyelets: "Eyelets" };
    for (const value of selected) {
      if (value === "eyelets") {
        const eyeletMaterialId = readString(formData, "eyeletMaterialId") || null;
        if (eyeletMaterialId) {
          const eyeletMaterialName = readString(formData, "eyeletMaterialName") || "Eyelets";
          components.push({
            ...component({
              label: eyeletMaterialName,
              materialId: eyeletMaterialId,
              role: "quote_finishing",
              ruleType: "per_unit",
              unit: "each",
              quantity: "1",
              wastePercent: "0",
              dimensionSource: "quantity_only",
              triggerOptionKey: "finishing",
              triggerOptionValues: ["eyelets"],
              notes: "Eyelets selected in guided workflow. Quote asks placement/quantity."
            }),
            stockUsage: {
              usageBasis: "per_unit",
              dimensionSource: "quantity_only",
              optionKey: "finishing",
              optionValues: ["eyelets"],
              widthMm: null,
              heightMm: null,
              rollWidthMm: null,
              partsPerSheet: null,
              metresPerUnit: null,
              sheetsPerUnit: null,
              quantitySource: "follow_up",
              quantityPrompt: "Eyelet placement",
              quantityPresets: [
                { id: randomUUID(), label: "4 corners", value: "four_corners", qty: "4" },
                { id: randomUUID(), label: "Top corners only", value: "top_corners_only", qty: "2" },
                { id: randomUUID(), label: "Centre top + bottom", value: "centre_top_bottom", qty: "2" },
                { id: randomUUID(), label: "2 top + 2 bottom for pole fixing", value: "pole_fixing", qty: "4" },
                { id: randomUUID(), label: "Custom", value: "__custom", qty: "custom" }
              ],
              allowCustomQuantity: true,
              customQuantityLabel: "Custom eyelet quantity"
            }
          });
        }
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
          notes: "Labour per eyelet. Quote placement/quantity multiplies this row.",
          ruleType: "labour_hours",
          wastePercent: "0",
          stockUsage: {
            usageBasis: "labour_hours",
            dimensionSource: "quantity_only",
            optionKey: "finishing",
            optionValues: ["eyelets"],
            widthMm: null,
            heightMm: null,
            rollWidthMm: null,
            partsPerSheet: null,
            metresPerUnit: null,
            sheetsPerUnit: null,
            sellRate: "66",
            chargeName: "Eyelet install labour",
            quantitySource: "follow_up",
            quantityPrompt: "Eyelet placement",
            quantityPresets: [
              { id: randomUUID(), label: "4 corners", value: "four_corners", qty: "4" },
              { id: randomUUID(), label: "Top corners only", value: "top_corners_only", qty: "2" },
              { id: randomUUID(), label: "Centre top + bottom", value: "centre_top_bottom", qty: "2" },
              { id: randomUUID(), label: "2 top + 2 bottom for pole fixing", value: "pole_fixing", qty: "4" },
              { id: randomUUID(), label: "Custom", value: "__custom", qty: "custom" }
            ],
            allowCustomQuantity: true,
            customQuantityLabel: "Custom eyelet quantity"
          },
          trigger: { optionKey: "finishing", optionValue: null, optionValues: ["eyelets"] }
        });
      } else {
        components.push({
          id: randomUUID(),
          kind: "labour",
          role: "factory_labour",
          materialId: null,
          supplierId: null,
          labourRateName: "Factory",
          label: `${labelMap[value] ?? labelFromValue(value)} labour`,
          quantity: labourHours[value] ?? "0.10",
          unit: "hr",
          notes: `${labelMap[value] ?? labelFromValue(value)} labour selected in guided workflow.`,
          ruleType: "labour_hours",
          wastePercent: "0",
          stockUsage: {
            usageBasis: "labour_hours",
            dimensionSource: "quantity_only",
            optionKey: "finishing",
            optionValues: [value],
            widthMm: null,
            heightMm: null,
            rollWidthMm: null,
            partsPerSheet: null,
            metresPerUnit: null,
            sheetsPerUnit: null,
            sellRate: "66",
            chargeName: `${labelMap[value] ?? labelFromValue(value)} labour`
          },
          trigger: { optionKey: "finishing", optionValue: null, optionValues: [value] }
        });
      }
    }

    await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, { ...definition, version: 3, fields, components });
    redirectWorkflow(productId, query, nextStep || "review", "Finishing choices saved");
  }

  redirect(`/products/advanced?selected=${productId}&error=Unknown%20workflow%20step`);
}

export async function updateProductOptionAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const fieldId = readString(formData, "fieldId");
  const label = readString(formData, "label") || readString(formData, "questionLabel");

  if (!productId || !fieldId) redirect("/products/advanced?error=No%20quote%20choice%20selected");
  if (!label) redirect(`/products/advanced?selected=${productId}&editOption=${fieldId}&error=Question%20name%20is%20required`);

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const existingField = definition.fields.find((field: Record<string, any>) => String(field.id ?? "") === fieldId);

  if (!existingField) redirect(`/products/advanced?selected=${productId}&error=Quote%20choice%20not%20found`);

  const nextField = buildFieldFromForm(formData, existingField);
  const oldKey = String(existingField.key ?? "");
  const nextKey = String(nextField.key ?? "");

  const linkedComponents = componentsLinkedToOptionRows(formData, nextField);

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    version: 3,
    fields: definition.fields.map((field: Record<string, any>) => String(field.id ?? "") === fieldId ? nextField : field),
    components: [
      ...definition.components.filter((item: Record<string, any>) => !isLinkedToOptionKey(item, oldKey) && !isLinkedToOptionKey(item, nextKey)),
      ...linkedComponents
    ]
  });

  redirect(`/products/advanced?selected=${productId}&message=Quote%20choice%20updated`);
}

export async function deleteProductOptionAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const fieldId = readString(formData, "fieldId");

  if (!productId || !fieldId) redirect("/products/advanced?error=No%20quote%20choice%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const field = definition.fields.find((item: Record<string, any>) => String(item.id ?? "") === fieldId);
  const deletedKey = String(field?.key ?? "");
  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    fields: definition.fields.filter((item: Record<string, any>) => String(item.id ?? "") !== fieldId),
    components: definition.components.filter((item: Record<string, any>) => !isLinkedToOptionKey(item, deletedKey))
  });

  redirect(`/products/advanced?selected=${productId}&message=Quote%20choice%20removed`);
}

export async function moveProductOptionAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const fieldId = readString(formData, "fieldId");
  const direction = readString(formData, "direction");

  if (!productId || !fieldId) redirect("/products/advanced?error=No%20quote%20choice%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const fields = [...definition.fields];
  const index = fields.findIndex((item: Record<string, any>) => String(item.id ?? "") === fieldId);
  const target = direction === "down" ? index + 1 : index - 1;

  if (index >= 0 && target >= 0 && target < fields.length) {
    const [field] = fields.splice(index, 1);
    fields.splice(target, 0, field);
  }

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    fields
  });

  redirect(`/products/advanced?selected=${productId}&message=Quote%20choice%20moved`);
}

export async function updateProductComponentAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const componentId = readString(formData, "componentId");

  if (!productId || !componentId) redirect("/products/advanced?error=No%20material%20row%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const existingComponent = definition.components.find((item: Record<string, any>) => String(item.id ?? "") === componentId);

  if (!existingComponent) redirect(`/products/advanced?selected=${productId}&error=Material%20row%20not%20found`);

  const nextComponent = buildComponentFromForm(formData, existingComponent);

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    components: definition.components.map((item: Record<string, any>) => String(item.id ?? "") === componentId ? nextComponent : item)
  });

  redirect(`/products/advanced?selected=${productId}&message=Material%20row%20updated`);
}

export async function deleteProductComponentAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const componentId = readString(formData, "componentId");

  if (!productId || !componentId) redirect("/products/advanced?error=No%20material%20row%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    components: definition.components.filter((item: Record<string, any>) => String(item.id ?? "") !== componentId)
  });

  redirect(`/products/advanced?selected=${productId}&message=Material%20row%20removed`);
}


export async function deleteProductAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  if (!productId) redirect("/products/advanced?error=Choose%20a%20product%20to%20delete");

  await setProductStatusForTenant(activeTenant.tenantId, productId, "deleted");
  redirect("/products/advanced?message=Product%20deleted%20from%20the%20active%20list");
}

export async function restoreProductAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  if (!productId) redirect("/products/advanced?filter=deleted&error=Choose%20a%20product%20to%20restore");

  await setProductStatusForTenant(activeTenant.tenantId, productId, "draft");
  redirect(`/products/advanced?selected=${productId}&message=Product%20restored`);
}
