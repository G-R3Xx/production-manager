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
      version: 2,
      ...definition,
      fields: Array.isArray(definition.fields) ? [...definition.fields] : [],
      components: Array.isArray(definition.components) ? [...definition.components] : []
    }
  };
}

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  return activeTenant;
}

function presetDefaults(preset: string) {
  switch (preset) {
    case "finished_size":
      return {
        key: "finished_size",
        label: "Finished size",
        fieldType: "size_select",
        defaultValue: "600x900",
        optionsCsv: "600x900,450x600,300x450",
        helpText: "Selectable finished sizes. Size values can drive sheet, sqm, ink and laminate component rules."
      };
    case "sides":
      return {
        key: "sides",
        label: "Front / back",
        fieldType: "select",
        defaultValue: "single_sided",
        optionsCsv: "Front only=single_sided,Front and back=double_sided",
        helpText: "Business cards, flyers and signs use this to control print faces, ink, labour and laminate/cello rules."
      };
    case "laminate":
      return {
        key: "laminate",
        label: "Laminate",
        fieldType: "select",
        defaultValue: "none",
        optionsCsv: "None=none,Matte laminate=matte_laminate,Gloss laminate=gloss_laminate,Anti graffiti=anti_graffiti,Whiteboard=whiteboard",
        helpText: "Choose laminate type and trigger roll laminate usage."
      };
    case "cello":
      return {
        key: "cello",
        label: "Celloglaze",
        fieldType: "select",
        defaultValue: "none",
        optionsCsv: "None=none,Matte cello=matte_cello,Gloss cello=gloss_cello",
        helpText: "Small-format celloglaze choice. Can trigger cello meterage."
      };
    case "binding_type":
      return {
        key: "binding_type",
        label: "Binding type",
        fieldType: "binding",
        defaultValue: "none",
        optionsCsv: "None=none,Saddle stitch=saddle_stitch,Perfect bind=perfect_bind,Wire bind=wire_bind,Pad binding=pad_binding,Carbon book tape=carbon_book_tape",
        helpText: "Book and carbon book binding selection."
      };
    case "copy_set":
      return {
        key: "copy_set",
        label: "Copies per set",
        fieldType: "select",
        defaultValue: "duplicate",
        optionsCsv: "Duplicate=duplicate,Triplicate=triplicate,Quadruplicate=quadruplicate",
        helpText: "Duplicate/triplicate selection. This controls how many carbonless copy sheets are used per written set."
      };
    case "copy_colours":
      return {
        key: "copy_colours",
        label: "Copy colours",
        fieldType: "select",
        defaultValue: "white_yellow",
        optionsCsv: "White / Yellow=white_yellow,White / Yellow / Pink=white_yellow_pink,White / Green / Blue=white_green_blue,Custom=custom",
        helpText: "Carbon copy paper colour set."
      };
    case "cover_colour":
      return {
        key: "cover_colour",
        label: "Cover colour",
        fieldType: "color",
        defaultValue: "none",
        optionsCsv: "None=none,White=white,Black=black,Blue=blue,Green=green,Red=red,Yellow=yellow",
        helpText: "Cover colour for books and carbon books."
      };
    case "tape_colour":
      return {
        key: "tape_colour",
        label: "Tape colour",
        fieldType: "color",
        defaultValue: "black",
        optionsCsv: "Black=black,White=white,Blue=blue,Red=red,Green=green",
        helpText: "Binding tape colour for carbon books and pads."
      };
    case "quantity":
      return {
        key: "quantity",
        label: "Quantity",
        fieldType: "quantity",
        defaultValue: "1",
        optionsCsv: "",
        helpText: "Quoted quantity. Components can use this as per-unit usage."
      };
    case "page_count":
      return {
        key: "page_count",
        label: "Page count",
        fieldType: "quantity",
        defaultValue: "50",
        optionsCsv: "",
        helpText: "Book page count. Use this to drive paper/card usage."
      };
    case "material_choice":
      return {
        key: "material_choice",
        label: "Material choice",
        fieldType: "select",
        defaultValue: "",
        optionsCsv: "",
        helpText: "Selectable stock choice. Link components to this option when different materials are available."
      };
    default:
      return {
        key: "",
        label: "",
        fieldType: "select",
        defaultValue: "",
        optionsCsv: "",
        helpText: ""
      };
  }
}


type ComponentPresetDefaults = {
  componentKind: string;
  label: string;
  ruleType: string;
  quantity: string;
  unit: string;
  wastePercent: string;
  dimensionSource: string;
  usageOptionKey: string;
  triggerOptionKey: string;
  triggerOptionValuesCsv: string;
  labourRateName: string;
  notes: string;
};

function componentPresetDefaults(preset: string): ComponentPresetDefaults {
  switch (preset) {
    case "full_sheet_material":
      return {
        componentKind: "material",
        label: "Full sheet / board",
        ruleType: "per_unit",
        quantity: "1",
        unit: "sheet",
        wastePercent: "0",
        dimensionSource: "quantity_only",
        usageOptionKey: "quantity",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "",
        notes: "Consumes one full purchased sheet or board per unit unless changed."
      };
    case "part_sheet_material":
      return {
        componentKind: "material",
        label: "Part sheet / nested from parent sheet",
        ruleType: "yield_based",
        quantity: "1",
        unit: "sheet",
        wastePercent: "10",
        dimensionSource: "finished_size",
        usageOptionKey: "finished_size",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "",
        notes: "Consumes part of a purchased parent sheet. Set parts-per-sheet when known, or use finished size to calculate area later."
      };
    case "roll_metres_material":
      return {
        componentKind: "material",
        label: "Metres from roll",
        ruleType: "per_linear_metre",
        quantity: "1",
        unit: "lm",
        wastePercent: "10",
        dimensionSource: "finished_size",
        usageOptionKey: "finished_size",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "",
        notes: "Consumes purchased roll stock by linear metres from the finished size or entered length."
      };
    case "area_coverage_material":
      return {
        componentKind: "material",
        label: "Area coverage material",
        ruleType: "per_sqm",
        quantity: "1",
        unit: "sqm",
        wastePercent: "10",
        dimensionSource: "finished_size",
        usageOptionKey: "finished_size",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "",
        notes: "Consumes material by square metres, useful for ink, laminate, cello, application tape or coatings."
      };
    case "each_material":
      return {
        componentKind: "material",
        label: "Each / fixed material",
        ruleType: "per_unit",
        quantity: "1",
        unit: "each",
        wastePercent: "0",
        dimensionSource: "quantity_only",
        usageOptionKey: "quantity",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "",
        notes: "Consumes a simple quantity of purchased stock per quoted unit, such as eyelets, screws, bindery items or boxes."
      };
    case "sheet_substrate":
      return {
        componentKind: "material",
        label: "Sheet substrate / board",
        ruleType: "per_sheet",
        quantity: "1",
        unit: "sheet",
        wastePercent: "10",
        dimensionSource: "finished_size",
        usageOptionKey: "finished_size",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "",
        notes: "Allocates purchased parent sheet stock behind the finished product size. Use parts-per-sheet later when sheet yield is known."
      };
    case "print_area":
      return {
        componentKind: "material",
        label: "Print / ink coverage",
        ruleType: "per_sqm",
        quantity: "1",
        unit: "sqm",
        wastePercent: "5",
        dimensionSource: "finished_size",
        usageOptionKey: "finished_size",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "Print labour",
        notes: "Uses finished size to estimate printed area. Sides options can later multiply this component."
      };
    case "roll_media":
      return {
        componentKind: "material",
        label: "Roll media meterage",
        ruleType: "per_linear_metre",
        quantity: "1",
        unit: "lm",
        wastePercent: "10",
        dimensionSource: "finished_size",
        usageOptionKey: "finished_size",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "",
        notes: "Consumes purchased roll media by finished length, with allowance for waste."
      };
    case "laminate":
      return {
        componentKind: "material",
        label: "Laminate / cello coverage",
        ruleType: "per_sqm",
        quantity: "1",
        unit: "sqm",
        wastePercent: "10",
        dimensionSource: "finished_size",
        usageOptionKey: "laminate",
        triggerOptionKey: "laminate",
        triggerOptionValuesCsv: "matte_laminate,gloss_laminate,anti_graffiti,whiteboard,matte_cello,gloss_cello",
        labourRateName: "Laminating",
        notes: "Only consumes laminate or cello when the matching quote option is selected."
      };
    case "eyelets":
      return {
        componentKind: "finishing",
        label: "Eyelets / fixings",
        ruleType: "selected_by_option",
        quantity: "4",
        unit: "each",
        wastePercent: "0",
        dimensionSource: "quantity_only",
        usageOptionKey: "eyelets",
        triggerOptionKey: "eyelets",
        triggerOptionValuesCsv: "yes",
        labourRateName: "Finishing",
        notes: "Applies only when eyelets are selected. Adjust quantity for default eyelet count."
      };
    case "paper_stock":
      return {
        componentKind: "material",
        label: "Paper / card sheet usage",
        ruleType: "yield_based",
        quantity: "1",
        unit: "sheet",
        wastePercent: "5",
        dimensionSource: "finished_size",
        usageOptionKey: "finished_size",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "",
        notes: "Uses finished size and quantity to allocate paper or card parent sheets. Set parts-per-sheet when known."
      };
    case "binding":
      return {
        componentKind: "finishing",
        label: "Binding / tape consumable",
        ruleType: "selected_by_option",
        quantity: "1",
        unit: "each",
        wastePercent: "0",
        dimensionSource: "quantity_only",
        usageOptionKey: "binding_type",
        triggerOptionKey: "binding_type",
        triggerOptionValuesCsv: "saddle_stitch,perfect_bind,wire_bind,pad_binding,carbon_book_tape",
        labourRateName: "Bindery",
        notes: "Applies when a binding type is selected. Can represent wire, staples, tape, glue or bindery labour."
      };
    case "labour_time":
      return {
        componentKind: "labour",
        label: "Labour time",
        ruleType: "per_unit",
        quantity: "10",
        unit: "min",
        wastePercent: "0",
        dimensionSource: "quantity_only",
        usageOptionKey: "quantity",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "General labour",
        notes: "General production time allowance. Quantity is minutes per unit unless changed."
      };
    default:
      return {
        componentKind: "material",
        label: "Material component",
        ruleType: "fixed",
        quantity: "1",
        unit: "each",
        wastePercent: "0",
        dimensionSource: "manual",
        usageOptionKey: "",
        triggerOptionKey: "",
        triggerOptionValuesCsv: "",
        labourRateName: "",
        notes: ""
      };
  }
}

function starterField(key: string, label: string, type: string, defaultValue: string, optionsCsv: string, helpText: string) {
  return {
    id: randomUUID(),
    key,
    label,
    type,
    required: true,
    defaultValue,
    helpText,
    options: splitCsv(optionsCsv).map(parseChoice),
    rule: {
      effectType: "none",
      effectTarget: null,
      effectValue: null,
      effectUnit: null,
      componentLinkMode: "none"
    }
  };
}

function starterComponent(label: string, ruleType: string, unit: string, quantity: string, notes: string, overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    kind: "material",
    materialId: null,
    supplierId: null,
    labourRateName: null,
    label,
    quantity,
    unit,
    notes,
    ruleType,
    wastePercent: "10",
    stockUsage: {
      usageBasis: ruleType,
      dimensionSource: "finished_size",
      optionKey: null,
      optionValues: [],
      widthMm: null,
      heightMm: null,
      rollWidthMm: null,
      partsPerSheet: null,
      metresPerUnit: null,
      sheetsPerUnit: null
    },
    trigger: {
      optionKey: null,
      optionValue: null,
      optionValues: []
    },
    ...overrides
  };
}

function mergeByKey(existingFields: Array<Record<string, any>>, incomingFields: Array<Record<string, any>>) {
  const existingKeys = new Set(existingFields.map((field) => field.key));
  return [...existingFields, ...incomingFields.filter((field) => !existingKeys.has(field.key))];
}

function mergeByLabel(existingComponents: Array<Record<string, any>>, incomingComponents: Array<Record<string, any>>) {
  const existingLabels = new Set(existingComponents.map((component) => component.label));
  return [...existingComponents, ...incomingComponents.filter((component) => !existingLabels.has(component.label))];
}

export async function createProductAction(formData: FormData) {
  const activeTenant = await requireTenant();

  const name = readString(formData, "name");
  const sku = readString(formData, "sku");
  const department = readString(formData, "department") || "signage";
  const productFamily = readString(formData, "productFamily") || "rigid_signage";
  const status = readString(formData, "status") || "draft";

  if (!name) redirect("/products?error=Product%20name%20is%20required");

  const created = await createProduct({
    tenantId: activeTenant.tenantId,
    sku: sku || null,
    name,
    department,
    productFamily,
    status,
    calculatorType: "configurator_template",
    defaultTemplateId: null,
    taxCode: "GST"
  });

  redirect(`/products?selected=${created.id}&message=Product%20created`);
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

  redirect(`/products?selected=${productId}&message=Product%20updated`);
}

export async function addProductComponentAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");

  if (!productId) redirect("/products?error=No%20product%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const componentPreset = readString(formData, "componentPreset") || "custom";
  const defaults = componentPresetDefaults(componentPreset);

  const componentKind = readString(formData, "componentKind") || defaults.componentKind || "material";
  const label = readString(formData, "label") || defaults.label || (componentKind === "material" ? "Material component" : "Labour component");
  const triggerOptionKey = readString(formData, "triggerOptionKey") || defaults.triggerOptionKey || null;
  const triggerOptionValue = readString(formData, "triggerOptionValue") || null;
  const optionValues = splitCsv(readString(formData, "triggerOptionValuesCsv") || defaults.triggerOptionValuesCsv);
  const ruleType = readString(formData, "ruleType") || defaults.ruleType || "fixed";
  const usageOptionKey = readString(formData, "usageOptionKey") || defaults.usageOptionKey || null;

  const components = [
    ...definition.components,
    {
      id: randomUUID(),
      preset: componentPreset,
      kind: componentKind,
      materialId: readString(formData, "materialId") || null,
      supplierId: readString(formData, "supplierId") || null,
      labourRateName: readString(formData, "labourRateName") || defaults.labourRateName || null,
      label,
      quantity: safeNumberString(readString(formData, "quantity") || defaults.quantity, "1"),
      unit: readString(formData, "unit") || defaults.unit || "each",
      notes: readString(formData, "notes") || defaults.notes || null,
      ruleType,
      wastePercent: safeNumberString(readString(formData, "wastePercent") || defaults.wastePercent, "0"),
      stockUsage: {
        usageBasis: ruleType,
        dimensionSource: readString(formData, "dimensionSource") || defaults.dimensionSource || "manual",
        optionKey: usageOptionKey,
        optionValues,
        widthMm: readString(formData, "widthMm") || null,
        heightMm: readString(formData, "heightMm") || null,
        rollWidthMm: readString(formData, "rollWidthMm") || null,
        partsPerSheet: readString(formData, "partsPerSheet") || null,
        metresPerUnit: readString(formData, "metresPerUnit") || null,
        sheetsPerUnit: readString(formData, "sheetsPerUnit") || null
      },
      trigger: {
        optionKey: triggerOptionKey,
        optionValue: triggerOptionValue,
        optionValues
      }
    }
  ];

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    components
  });

  redirect(`/products?selected=${productId}&message=Material%20row%20added`);
}

export async function addProductOptionAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");

  if (!productId) redirect("/products?error=No%20product%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });
  const preset = readString(formData, "optionPreset") || "custom";
  const defaults = presetDefaults(preset);

  const questionLabel = readString(formData, "questionLabel");
  const defaultAnswer = readString(formData, "defaultAnswer");
  const otherOptionsCsv = readString(formData, "otherOptionsCsv");
  const label = questionLabel || readString(formData, "label") || defaults.label || "Question";
  const key = readString(formData, "key") || defaults.key || keyFromLabel(label);
  const fieldType = readString(formData, "fieldType") || defaults.fieldType || "select";
  const required = readString(formData, "required") !== "no";
  let optionsCsv = readString(formData, "optionsCsv") || defaults.optionsCsv;
  let defaultValue: string | null = readString(formData, "defaultValue") || defaults.defaultValue || null;

  if (defaultAnswer) {
    const parsedDefault = parseChoice(defaultAnswer);
    defaultValue = parsedDefault.value;

    const otherAnswers = splitCsv(otherOptionsCsv);
    if (otherAnswers.length > 0 || ["select", "size_select", "yes_no", "color", "binding"].includes(fieldType)) {
      optionsCsv = [defaultAnswer, ...otherAnswers].join(",");
    }
  }

  const helpText = readString(formData, "helpText") || defaults.helpText || null;

  const normalizedKey = keyFromLabel(key);
  const nextField = {
    id: randomUUID(),
    key: normalizedKey,
    label,
    type: fieldType,
    required,
    defaultValue,
    helpText,
    preset,
    options: splitCsv(optionsCsv).map(parseChoice),
    rule: {
      effectType: readString(formData, "effectType") || "none",
      effectTarget: readString(formData, "effectTarget") || null,
      effectValue: readString(formData, "effectValue") || null,
      effectUnit: readString(formData, "effectUnit") || null,
      componentLinkMode: readString(formData, "componentLinkMode") || "none",
      appliesWhenValues: splitCsv(readString(formData, "appliesWhenValuesCsv"))
    }
  };

  const existingIndex = definition.fields.findIndex((field: Record<string, any>) => field.key === normalizedKey);
  const fields = existingIndex >= 0
    ? definition.fields.map((field: Record<string, any>, index: number) => index === existingIndex ? { ...nextField, id: field.id ?? nextField.id } : field)
    : [...definition.fields, nextField];

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    fields
  });

  redirect(`/products?selected=${productId}&message=Quoting%20question%20saved`);
}

export async function addStarterRulesAction(formData: FormData) {
  const activeTenant = await requireTenant();
  const productId = readString(formData, "productId");
  const starterType = readString(formData, "starterType") || "rigid_signage";

  if (!productId) redirect("/products?error=No%20product%20selected");

  const { template, definition } = await getEditableDefinition({ tenantId: activeTenant.tenantId, productId });

  let starterFields: Array<Record<string, any>> = [];
  let starterComponents: Array<Record<string, any>> = [];

  if (starterType === "rigid_signage") {
    starterFields = [
      starterField("finished_size", "Finished size", "size_select", "600x900", "600x900,450x600,300x450", "Finished sign size used for sheet, print, ink and laminate calculations."),
      starterField("sides", "Front / back", "select", "single_sided", "Front only=single_sided,Front and back=double_sided", "Controls print faces and finishing for single or double-sided work."),
      starterField("laminate", "Laminate", "select", "none", "None=none,Matte laminate=matte_laminate,Gloss laminate=gloss_laminate", "Trigger roll laminate only when selected."),
      starterField("eyelets", "Eyelets", "yes_no", "no", "No=no,Yes=yes", "Optional hardware/finishing component."),
      starterField("quantity", "Quantity", "quantity", "1", "", "Quoted quantity.")
    ];
    starterComponents = [
      starterComponent("Parent sheet substrate", "per_sheet", "sheet", "1", "Allocate purchased parent sheet stock. Set parts-per-sheet once nesting/yield is known."),
      starterComponent("Print face / ink coverage", "per_sqm", "sqm", "1", "Uses finished size and sides to estimate print area."),
      starterComponent("Roll laminate coverage", "per_sqm", "sqm", "1", "Triggered only when laminate is selected.", {
        trigger: { optionKey: "laminate", optionValue: null, optionValues: ["matte_laminate", "gloss_laminate"] },
        stockUsage: { usageBasis: "per_sqm", dimensionSource: "finished_size", optionKey: "laminate", optionValues: ["matte_laminate", "gloss_laminate"], widthMm: null, heightMm: null, rollWidthMm: null, partsPerSheet: null, metresPerUnit: null, sheetsPerUnit: null }
      }),
      starterComponent("Eyelets / fixings", "selected_by_option", "each", "4", "Only applies when eyelets are selected.", {
        trigger: { optionKey: "eyelets", optionValue: "yes", optionValues: ["yes"] },
        stockUsage: { usageBasis: "selected_by_option", dimensionSource: "manual", optionKey: "eyelets", optionValues: ["yes"], widthMm: null, heightMm: null, rollWidthMm: null, partsPerSheet: null, metresPerUnit: null, sheetsPerUnit: null }
      })
    ];
  }

  if (starterType === "roll_print") {
    starterFields = [
      starterField("finished_size", "Finished size", "size_select", "1000x1000", "1000x1000,1200x2400,1500x3000", "Finished width × length used for roll media and laminate meterage."),
      starterField("laminate", "Laminate", "select", "none", "None=none,Matte laminate=matte_laminate,Gloss laminate=gloss_laminate", "Optional overlaminate."),
      starterField("quantity", "Quantity", "quantity", "1", "", "Quoted quantity.")
    ];
    starterComponents = [
      starterComponent("Print media roll meterage", "per_linear_metre", "lm", "1", "Uses finished length and roll width to consume purchased roll media."),
      starterComponent("Ink coverage", "per_sqm", "sqm", "1", "Uses finished size for ink/print area."),
      starterComponent("Laminate roll meterage", "per_linear_metre", "lm", "1", "Triggered only when laminate is selected.", {
        trigger: { optionKey: "laminate", optionValue: null, optionValues: ["matte_laminate", "gloss_laminate"] }
      })
    ];
  }

  if (starterType === "cards") {
    starterFields = [
      starterField("finished_size", "Finished size", "size_select", "90x55", "90x55,85x55,100x150,105x148", "Card or flyer finished size."),
      starterField("sides", "Front / back", "select", "double_sided", "Front only=single_sided,Front and back=double_sided", "Controls whether the job prints front only or front and back."),
      starterField("cello", "Celloglaze", "select", "none", "None=none,Matte cello=matte_cello,Gloss cello=gloss_cello", "Optional cello meterage."),
      starterField("gsm", "GSM", "select", "350", "250gsm=250,300gsm=300,350gsm=350,420gsm=420", "Paper/card stock weight."),
      starterField("quantity", "Quantity", "quantity", "250", "", "Quoted quantity.")
    ];
    starterComponents = [
      starterComponent("Card / paper sheet usage", "yield_based", "sheet", "1", "Use parts-per-sheet to calculate parent sheet usage from finished size and quantity."),
      starterComponent("Print faces", "per_unit", "face", "2", "Multiply by sides and quantity."),
      starterComponent("Celloglaze meterage", "per_linear_metre", "lm", "1", "Triggered when matte or gloss cello is selected.", {
        trigger: { optionKey: "cello", optionValue: null, optionValues: ["matte_cello", "gloss_cello"] }
      })
    ];
  }

  if (starterType === "books") {
    starterFields = [
      starterField("finished_size", "Finished size", "size_select", "A4", "A4=A4,A5=A5,DL=DL", "Book finished size."),
      starterField("page_count", "Page count", "quantity", "50", "", "Internal page count."),
      starterField("cover_colour", "Cover colour", "color", "white", "White=white,Black=black,Blue=blue,Green=green,Red=red", "Cover stock colour."),
      starterField("binding_type", "Binding type", "binding", "saddle_stitch", "Saddle stitch=saddle_stitch,Perfect bind=perfect_bind,Wire bind=wire_bind,Pad binding=pad_binding", "Binding method."),
      starterField("quantity", "Quantity", "quantity", "25", "", "Quoted quantity.")
    ];
    starterComponents = [
      starterComponent("Internal paper stock", "yield_based", "sheet", "1", "Use page count and finished size to estimate paper sheet usage."),
      starterComponent("Cover stock", "per_unit", "cover", "1", "One cover set per book."),
      starterComponent("Binding labour / consumable", "selected_by_option", "each", "1", "Triggered by binding type.", {
        trigger: { optionKey: "binding_type", optionValue: null, optionValues: ["saddle_stitch", "perfect_bind", "wire_bind", "pad_binding"] }
      })
    ];
  }

  if (starterType === "carbon_books") {
    starterFields = [
      starterField("finished_size", "Finished size", "size_select", "A5", "A4=A4,A5=A5,DL=DL", "Carbon book finished size."),
      starterField("page_count", "Pages per book", "quantity", "50", "", "Number of numbered sets/pages in each carbon book."),
      starterField("copy_set", "Copies per set", "select", "duplicate", "Duplicate=duplicate,Triplicate=triplicate,Quadruplicate=quadruplicate", "Duplicate/triplicate copy count per written set."),
      starterField("copy_colours", "Copy colours", "select", "white_yellow", "White / Yellow=white_yellow,White / Yellow / Pink=white_yellow_pink,White / Green / Blue=white_green_blue", "Copy paper colour set."),
      starterField("cover_colour", "Cover colour", "color", "blue", "White=white,Black=black,Blue=blue,Green=green,Red=red,Yellow=yellow", "Cover stock colour."),
      starterField("tape_colour", "Tape colour", "color", "black", "Black=black,White=white,Blue=blue,Red=red,Green=green", "Binding tape colour."),
      starterField("sequential_numbering", "Sequential numbering", "yes_no", "yes", "No=no,Yes=yes", "Numbered carbon books."),
      starterField("quantity", "Quantity", "quantity", "10", "", "Book quantity.")
    ];
    starterComponents = [
      starterComponent("Carbonless paper stock", "yield_based", "sheet", "1", "Uses finished size, copy set and quantity."),
      starterComponent("Cover card", "per_unit", "cover", "1", "Cover stock per book."),
      starterComponent("Binding tape", "per_linear_metre", "lm", "1", "Tape meterage by book spine length."),
      starterComponent("Sequential numbering labour", "selected_by_option", "each", "1", "Applies when numbering is selected.", {
        kind: "labour",
        trigger: { optionKey: "sequential_numbering", optionValue: "yes", optionValues: ["yes"] }
      })
    ];
  }

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, {
    ...definition,
    version: 2,
    fields: mergeByKey(definition.fields, starterFields),
    components: mergeByLabel(definition.components, starterComponents),
    setupPreset: starterType
  });

  redirect(`/products?selected=${productId}&message=Product%20starting%20point%20added`);
}
