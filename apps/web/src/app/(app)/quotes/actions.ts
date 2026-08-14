"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  addArtworkApprovalPageForTenant,
  addQuoteLine,
  createArtworkApprovalFromQuote,
  createQuoteDraftForTenant,
  deleteQuoteLineForTenant,
  getQuoteLineForTenant,
  ensureQuotePublicIdentityForTenant,
  linkQuoteLineToProductForTenant,
  markArtworkApprovalSentForTenant,
  updateQuoteLineForTenant,
  markQuoteSentForTenant,
  markQuoteEmailPendingForTenant,
  markQuoteEmailSentForTenant,
  markQuoteEmailFailedForTenant,
  removeArtworkApprovalPageForTenant,
  setQuoteDraftStatusForTenant,
  getQuoteDraftById,
  updateQuoteMyobOrderSyncForTenant,
  updateQuoteJobNameForTenant
} from "@/server/quotes";
import { createProduct, getProductById, updateProduct } from "@/server/products";
import { ensureProductEditorTemplate, getConfiguratorTemplateById, updateConfiguratorDefinitionJson, updateConfiguratorTemplateMetadata } from "@/server/configurators";
import { createMyobCustomerFromLocalClientForTenant, pushAcceptedQuoteToMyobOrderForTenant } from "@/server/myob-sync";
import { customerMyobPriceLevel, customerMyobPriceLevelName, customerMyobPriceLevelNames, getCustomerById, updateCustomerPayloadForTenant } from "@/server/customers";
import { getCompanySettingsByTenantId } from "@/server/company";
import { sendOutboundEmail } from "@/server/outbound-email";

async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    redirect("/bootstrap?error=Create%20or%20select%20a%20tenant%20first");
  }
  return activeTenant;
}

function nullable(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function jsonObject(value: FormDataEntryValue | null): Record<string, unknown> {
  const raw = String(value ?? "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function snapshotText(snapshot: Record<string, unknown>, key: string): string {
  const value = snapshot[key];
  return typeof value === "string" ? value.trim() : "";
}

function buildEditableOptionSummary(formData: FormData): string | null {
  const labels = formData.getAll("optionDetailLabel");
  const values = formData.getAll("optionDetailValue");

  if (labels.length === 0 && values.length === 0) {
    return nullable(formData.get("optionSummary"));
  }

  const parts = values
    .map((rawValue, index) => {
      const value = String(rawValue ?? "").trim();
      const label = String(labels[index] ?? "").trim();
      if (!value) return "";
      if (!label || label.toLowerCase() === "detail") return value;
      return `${label}: ${value}`;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}


function normaliseKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "option";
}

function numberValue(value: FormDataEntryValue | string | number | null | undefined, fallback = 0): number {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normaliseProductDepartment(value: string): string {
  const department = value.trim().toLowerCase();
  if (department === "install") return "installation";
  if (department === "outsourced") return "general";
  if (["signage", "small_format", "plan_printing", "poster_printing", "installation", "general"].includes(department)) return department;
  return "signage";
}

function productFamilyForDepartment(department: string): string {
  switch (department) {
    case "small_format":
    case "plan_printing":
      return "small_format_print";
    case "poster_printing":
      return "roll_media";
    case "installation":
    case "general":
      return "display_products";
    default:
      return "rigid_signage";
  }
}

function optionAnswerMap(formData: FormData): Map<string, string> {
  const keys = formData.getAll("productOptionKey");
  const values = formData.getAll("productOptionValue");
  const pairs: Array<[string, string]> = keys
    .map((key, index): [string, string] => [String(key ?? "").trim(), String(values[index] ?? "").trim()])
    .filter(([key]) => Boolean(key));
  return new Map(pairs);
}

function optionDetailRows(formData: FormData): Array<{ label: string; value: string }> {
  const labels = formData.getAll("optionDetailLabel");
  const values = formData.getAll("optionDetailValue");
  return values
    .map((rawValue, index) => ({ label: String(labels[index] ?? "Detail").trim() || "Detail", value: String(rawValue ?? "").trim() }))
    .filter((row) => Boolean(row.value));
}

function dimensionParts(value: string): { widthMm: string | null; heightMm: string | null } {
  const standardSizes: Record<string, [number, number]> = {
    a0: [841, 1189], a1: [594, 841], a2: [420, 594], a3: [297, 420],
    a4: [210, 297], a5: [148, 210], a6: [105, 148], dl: [99, 210]
  };
  const standard = standardSizes[value.toLowerCase().replace(/[^a-z0-9]/g, "")];
  if (standard) return { widthMm: String(standard[0]), heightMm: String(standard[1]) };
  const match = value.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  return match ? { widthMm: match[1] ?? null, heightMm: match[2] ?? null } : { widthMm: null, heightMm: null };
}

function quoteChoice(label: string, value?: string) {
  const rawValue = value ?? normaliseKey(label);
  const dimensions = dimensionParts(label);
  return {
    id: randomUUID(),
    label,
    value: rawValue,
    priceDelta: "0.00",
    widthMm: dimensions.widthMm,
    heightMm: dimensions.heightMm
  };
}

function inferredChoices(label: string, currentValue: string): Array<Record<string, unknown>> {
  const key = normaliseKey(label);
  const currentKey = normaliseKey(currentValue);

  if (key === "copies" || key === "copy_set" || key === "copy_count") {
    return [quoteChoice("Duplicate", "duplicate"), quoteChoice("Triplicate", "triplicate"), quoteChoice("Quadruplicate", "quadruplicate")];
  }
  if (["copy_colours", "copy_colors", "copy_colour", "copy_color"].includes(key)) {
    return [
      "White / Yellow", "White / Pink", "White / Green", "White / Blue",
      "White / Yellow / Pink", "White / Green / Blue", "White / Yellow / Blue",
      "White / Yellow / Pink / Blue", "White / Yellow / Green / Blue", "Custom"
    ].map((choice) => quoteChoice(choice));
  }
  if (key.includes("numbering") || ["yes", "no"].includes(currentKey)) {
    return [quoteChoice("Yes", "yes"), quoteChoice("No", "no")];
  }
  if (key === "size" || key === "finished_size") {
    const labels = ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "DL"];
    if (!labels.some((item) => item.toLowerCase() === currentValue.toLowerCase())) labels.push(currentValue);
    return labels.map((choice) => quoteChoice(choice));
  }
  if (key.includes("colour") || key.includes("color")) {
    const labels = [currentValue, "White", "Black", "Blue", "Red", "Green", "Yellow", "Pink"].filter(Boolean);
    return Array.from(new Set(labels.map((item) => item.trim()))).map((choice) => quoteChoice(choice));
  }
  return [quoteChoice(currentValue)];
}

function inferredField(label: string, currentValue: string, usedKeys: Set<string>): Record<string, unknown> {
  const baseKey = normaliseKey(label === "Detail" ? "option" : label);
  let key = baseKey;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${baseKey}_${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);

  const choices = inferredChoices(label, currentValue);
  const matchingChoice = choices.find((choice) => {
    const candidate = choice as { label?: string; value?: string };
    return String(candidate.label ?? "").toLowerCase() === currentValue.toLowerCase() || String(candidate.value ?? "").toLowerCase() === currentValue.toLowerCase();
  }) as { value?: string } | undefined;
  const isYesNo = choices.length === 2 && choices.some((choice) => (choice as { value?: string }).value === "yes") && choices.some((choice) => (choice as { value?: string }).value === "no");

  return {
    id: randomUUID(),
    key,
    label,
    type: isYesNo ? "yes_no" : key.includes("size") ? "size_select" : "select",
    required: true,
    defaultValue: matchingChoice?.value ?? normaliseKey(currentValue),
    helpText: "Saved from a quote line. Add or remove available choices on the Products page.",
    quoteOnly: true,
    showWhen: null,
    options: choices,
    rule: { effectType: "none", effectTarget: null, effectValue: null, effectUnit: null, componentLinkMode: "none" }
  };
}

function copyCountValue(value: string): number {
  const normalized = value.toLowerCase();
  if (normalized.includes("quadruplicate") || normalized === "4" || normalized.includes("4 part")) return 4;
  if (normalized.includes("triplicate") || normalized === "3" || normalized.includes("3 part")) return 3;
  if (normalized.includes("duplicate") || normalized === "2" || normalized.includes("2 part")) return 2;
  return Math.max(1, numberValue(value, 1));
}

function savedPriceComponent(formData: FormData, unitPrice: string, markupMultiplier: string, profitMultiplier: string): Record<string, unknown> {
  const markup = Math.max(0.0001, numberValue(markupMultiplier, 1.5));
  const profit = Math.max(0.0001, numberValue(profitMultiplier, 1.2));
  const sellPrice = Math.max(0, numberValue(unitPrice, 0));
  const baseCost = sellPrice / (markup * profit);
  const details = new Map(optionDetailRows(formData).map((row): [string, string] => [normaliseKey(row.label), row.value]));
  const sizeValue = details.get("size") ?? details.get("finished_size") ?? "";
  const pageValue = details.get("pages") ?? details.get("page_count") ?? details.get("sets_per_book") ?? "";
  const copiesValue = details.get("copies") ?? details.get("copy_set") ?? details.get("copy_count") ?? "";
  const dimensions = dimensionParts(sizeValue);
  const widthMm = numberValue(dimensions.widthMm, 0);
  const heightMm = numberValue(dimensions.heightMm, 0);
  const pages = Math.max(1, numberValue(pageValue, 1));
  const copies = copyCountValue(copiesValue);
  const areaSqm = widthMm > 0 && heightMm > 0 ? (widthMm / 1000) * (heightMm / 1000) : 0;
  const lineName = String(formData.get("productName") ?? formData.get("productSaveName") ?? "").toLowerCase();
  const looksLikeCarbonBook = details.has("copy_colours") || details.has("copy_colors") || lineName.includes("carbon") || lineName.includes("ncr") || lineName.includes("duplicate book") || lineName.includes("triplicate book");
  const carbonScale = looksLikeCarbonBook && areaSqm > 0 && Boolean(pageValue) && Boolean(copiesValue);
  const rate = carbonScale ? baseCost / (areaSqm * pages * copies) : baseCost;
  const rateText = rate.toFixed(6);
  const ruleType = carbonScale ? "sell_sqm" : "sell_each";
  const label = carbonScale ? "Saved carbon-book price basis" : "Saved quote-line price";

  return {
    id: randomUUID(),
    kind: "material",
    role: "quote_sell_charge",
    materialId: null,
    supplierId: null,
    labourRateName: null,
    label,
    quantity: rateText,
    unit: carbonScale ? "sqm" : "each",
    notes: carbonScale
      ? `Saved from a quote line at $${sellPrice.toFixed(2)} and calibrated to size × pages × copies using markup ×${markup} and profit ×${profit}.`
      : `Saved from a quote line at $${sellPrice.toFixed(2)} using markup ×${markup} and profit ×${profit}.`,
    ruleType,
    wastePercent: "0",
    stockUsage: {
      usageBasis: ruleType,
      dimensionSource: carbonScale ? "finished_size" : "quantity_only",
      optionKey: carbonScale ? "copy_set" : null,
      optionValues: [],
      widthMm: null,
      heightMm: null,
      rollWidthMm: null,
      partsPerSheet: null,
      metresPerUnit: null,
      sheetsPerUnit: null,
      sellRate: rateText,
      chargeName: label
    },
    trigger: { optionKey: null, optionValue: null, optionValues: [] }
  };
}

function cloneDefinition(definition: Record<string, any>): Record<string, any> {
  const fields = Array.isArray(definition.fields) ? definition.fields.map((field: Record<string, any>) => ({
    ...field,
    id: randomUUID(),
    options: Array.isArray(field.options) ? field.options.map((option: Record<string, any>) => ({ ...option, id: randomUUID() })) : []
  })) : [];
  const components = Array.isArray(definition.components) ? definition.components.map((component: Record<string, any>) => ({
    ...component,
    id: randomUUID(),
    stockUsage: component.stockUsage ? {
      ...component.stockUsage,
      quantityPresets: Array.isArray(component.stockUsage.quantityPresets)
        ? component.stockUsage.quantityPresets.map((preset: Record<string, any>) => ({ ...preset, id: randomUUID() }))
        : component.stockUsage.quantityPresets
    } : component.stockUsage
  })) : [];
  return { ...definition, fields, components };
}

function applyCurrentDefaults(definition: Record<string, any>, formData: FormData): Record<string, any> {
  const rawAnswers = optionAnswerMap(formData);
  const detailsByLabel = new Map(optionDetailRows(formData).map((row) => [row.label.toLowerCase(), row.value]));
  const fields = Array.isArray(definition.fields) ? definition.fields.map((field: Record<string, any>) => {
    const rawAnswer = rawAnswers.get(String(field.key ?? ""));
    const displayedAnswer = detailsByLabel.get(String(field.label ?? "").toLowerCase());
    let defaultValue = rawAnswer ?? String(field.defaultValue ?? "");
    if (!rawAnswer && displayedAnswer && Array.isArray(field.options)) {
      const match = field.options.find((option: Record<string, any>) => [option.value, option.label].some((candidate) => String(candidate ?? "").toLowerCase() === displayedAnswer.toLowerCase()));
      defaultValue = String(match?.value ?? displayedAnswer);
    } else if (!rawAnswer && displayedAnswer) {
      defaultValue = displayedAnswer;
    }
    return { ...field, defaultValue };
  }) : [];
  return { ...definition, fields };
}

function quoteLineDefinition(formData: FormData, createEditableOptions: boolean): Record<string, any> {
  const usedKeys = new Set<string>();
  const fields = createEditableOptions
    ? optionDetailRows(formData).map((row) => inferredField(row.label, row.value, usedKeys))
    : [];
  return {
    version: 3,
    setupMode: "saved_from_quote_line",
    setupPreset: "quote_line",
    productKindLabel: "Saved quote-line product",
    fields,
    components: []
  };
}

export async function createQuoteDraftAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const jobName = String(formData.get("jobName") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();

  if (!jobName) {
    redirect("/quotes?error=Job%20name%20is%20required");
  }

  if (!clientName) {
    redirect("/quotes?error=Client%20name%20is%20required");
  }

  const linkedCustomerId = nullable(formData.get("linkedCustomerId"));
  if (linkedCustomerId) {
    const linkedCustomer = await getCustomerById(activeTenant.tenantId, linkedCustomerId);
    if (!linkedCustomer) {
      redirect("/quotes?error=The%20selected%20client%20could%20not%20be%20found");
    }
  }

  const created = await createQuoteDraftForTenant(activeTenant.tenantId, {
    enquiryId: nullable(formData.get("enquiryId")),
    surveyRequestId: nullable(formData.get("surveyRequestId")),
    linkedCustomerId,
    jobName,
    clientName,
    contactName: nullable(formData.get("contactName")),
    email: nullable(formData.get("email")),
    phone: nullable(formData.get("phone")),
    discountPercent: nullable(formData.get("discountPercent")) ?? "0",
    notes: nullable(formData.get("notes"))
  });

  redirect(`/quotes?selected=${created.id}&message=Quote%20draft%20created`);
}

export async function updateQuoteJobNameAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const jobName = String(formData.get("jobName") ?? "").trim();

  if (!quoteId) {
    redirect("/quotes?error=Select%20a%20quote%20first");
  }
  if (!jobName) {
    redirect(`/quotes?selected=${quoteId}&error=Job%20name%20is%20required`);
  }

  await updateQuoteJobNameForTenant(activeTenant.tenantId, quoteId, jobName);
  revalidatePath("/quotes");
  redirect(`/quotes?selected=${quoteId}&message=Job%20name%20updated`);
}

export async function addQuoteLineAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const editingLineId = String(formData.get("editingLineId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const formProductName = String(formData.get("productName") ?? "").trim();
  const quantity = String(formData.get("quantity") ?? "1").trim();
  const unitPrice = String(formData.get("unitPrice") ?? "0").trim();
  const configurationSnapshot = jsonObject(formData.get("configurationSnapshot"));

  if (!quoteId) {
    redirect("/quotes?error=Select%20a%20quote%20first");
  }

  let productName = formProductName || "Custom material quote line";
  let savedProductId: string | null = null;

  if (productId) {
    const product = await getProductById(activeTenant.tenantId, productId);
    if (!product) {
      redirect(`/quotes?selected=${quoteId}&error=Selected%20product%20was%20not%20found`);
    }
    savedProductId = product.id;
    productName = product.name;
  }

  const serviceLineProductName = String(formData.get("serviceLineProductName") ?? "").trim();
  const serviceLineUnitPrice = String(formData.get("serviceLineUnitPrice") ?? "").trim();
  const serviceLineQuantity = String(formData.get("serviceLineQuantity") ?? "1").trim() || "1";
  const serviceLineSnapshot = jsonObject(formData.get("serviceLineConfigurationSnapshot"));

  if (editingLineId) {
    const existingLine = await getQuoteLineForTenant(activeTenant.tenantId, quoteId, editingLineId);
    if (!existingLine) {
      redirect(`/quotes?selected=${quoteId}&error=The%20quote%20line%20could%20not%20be%20found`);
    }

    const existingSnapshot = existingLine.configurationSnapshot ?? {};
    const existingDispatchLineId = snapshotText(existingSnapshot, "linkedDispatchLineId");
    let linkedDispatchLineId = existingDispatchLineId;

    if (serviceLineProductName && serviceLineUnitPrice) {
      const dispatchSnapshot = { ...serviceLineSnapshot, parentLineId: editingLineId };
      if (existingDispatchLineId) {
        const existingDispatch = await getQuoteLineForTenant(activeTenant.tenantId, quoteId, existingDispatchLineId);
        if (existingDispatch) {
          await updateQuoteLineForTenant(activeTenant.tenantId, quoteId, existingDispatchLineId, {
            productName: serviceLineProductName,
            optionSummary: nullable(formData.get("serviceLineOptionSummary")),
            quantity: serviceLineQuantity,
            unitPrice: serviceLineUnitPrice,
            notes: nullable(formData.get("serviceLineNotes")),
            configurationSnapshot: dispatchSnapshot
          });
        } else {
          const createdDispatch = await addQuoteLine(quoteId, {
            productId: null,
            productName: serviceLineProductName,
            optionSummary: nullable(formData.get("serviceLineOptionSummary")),
            quantity: serviceLineQuantity,
            unitPrice: serviceLineUnitPrice,
            notes: nullable(formData.get("serviceLineNotes")),
            configurationSnapshot: dispatchSnapshot
          });
          linkedDispatchLineId = createdDispatch.id;
        }
      } else {
        const createdDispatch = await addQuoteLine(quoteId, {
          productId: null,
          productName: serviceLineProductName,
          optionSummary: nullable(formData.get("serviceLineOptionSummary")),
          quantity: serviceLineQuantity,
          unitPrice: serviceLineUnitPrice,
          notes: nullable(formData.get("serviceLineNotes")),
          configurationSnapshot: dispatchSnapshot
        });
        linkedDispatchLineId = createdDispatch.id;
      }
    } else if (existingDispatchLineId) {
      await deleteQuoteLineForTenant(activeTenant.tenantId, quoteId, existingDispatchLineId);
      linkedDispatchLineId = "";
    }

    await updateQuoteLineForTenant(activeTenant.tenantId, quoteId, editingLineId, {
      productName,
      optionSummary: nullable(formData.get("optionSummary")),
      quantity,
      unitPrice,
      notes: nullable(formData.get("notes")),
      configurationSnapshot: { ...configurationSnapshot, linkedDispatchLineId: linkedDispatchLineId || null }
    });

    redirect(`/quotes?selected=${quoteId}&message=Quote%20line%20updated#saved-lines`);
  }

  const createdMain = await addQuoteLine(quoteId, {
    productId: savedProductId,
    productName,
    optionSummary: nullable(formData.get("optionSummary")),
    quantity,
    unitPrice,
    notes: nullable(formData.get("notes")),
    configurationSnapshot
  });

  let linkedDispatchLineId = "";
  if (serviceLineProductName && serviceLineUnitPrice) {
    const createdDispatch = await addQuoteLine(quoteId, {
      productId: null,
      productName: serviceLineProductName,
      optionSummary: nullable(formData.get("serviceLineOptionSummary")),
      quantity: serviceLineQuantity,
      unitPrice: serviceLineUnitPrice,
      notes: nullable(formData.get("serviceLineNotes")),
      configurationSnapshot: { ...serviceLineSnapshot, parentLineId: createdMain.id }
    });
    linkedDispatchLineId = createdDispatch.id;
  }

  if (linkedDispatchLineId) {
    await updateQuoteLineForTenant(activeTenant.tenantId, quoteId, createdMain.id, {
      productName,
      optionSummary: nullable(formData.get("optionSummary")),
      quantity,
      unitPrice,
      notes: nullable(formData.get("notes")),
      configurationSnapshot: { ...configurationSnapshot, linkedDispatchLineId }
    });
  }

  redirect(`/quotes?selected=${quoteId}&message=Quote%20line%20added`);
}

export async function deleteQuoteLineAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const lineId = String(formData.get("lineId") ?? "").trim();

  if (!quoteId || !lineId) {
    redirect("/quotes?error=Select%20a%20saved%20quote%20line%20to%20remove");
  }

  const line = await getQuoteLineForTenant(activeTenant.tenantId, quoteId, lineId);
  const linkedDispatchLineId = snapshotText(line?.configurationSnapshot ?? {}, "linkedDispatchLineId");
  if (linkedDispatchLineId) {
    await deleteQuoteLineForTenant(activeTenant.tenantId, quoteId, linkedDispatchLineId);
  }
  await deleteQuoteLineForTenant(activeTenant.tenantId, quoteId, lineId);

  redirect(`/quotes?selected=${quoteId}&message=Saved%20quote%20line%20removed`);
}

export async function updateQuoteLineAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const lineId = String(formData.get("lineId") ?? "").trim();
  const productName = String(formData.get("productName") ?? "").trim();
  const quantity = String(formData.get("quantity") ?? "1").trim();
  const unitPrice = String(formData.get("unitPrice") ?? "0").trim();

  if (!quoteId || !lineId) {
    redirect("/quotes?error=Select%20a%20saved%20quote%20line%20to%20edit");
  }

  if (!productName) {
    redirect(`/quotes?selected=${quoteId}&error=Quote%20line%20title%20is%20required`);
  }

  await updateQuoteLineForTenant(activeTenant.tenantId, quoteId, lineId, {
    productName,
    optionSummary: buildEditableOptionSummary(formData),
    quantity: quantity || "1",
    unitPrice: unitPrice || "0",
    notes: nullable(formData.get("notes"))
  });

  redirect(`/quotes?selected=${quoteId}&message=Saved%20quote%20line%20updated`);
}


export async function saveQuoteLineAsProductAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const lineId = String(formData.get("lineId") ?? "").trim();
  const linkedProductId = String(formData.get("linkedProductId") ?? "").trim();
  const saveMode = String(formData.get("productSaveMode") ?? "new").trim();
  const productName = String(formData.get("productSaveName") ?? formData.get("productName") ?? "").trim();
  const lineTitle = String(formData.get("productName") ?? productName).trim() || productName;
  const department = normaliseProductDepartment(String(formData.get("productDepartment") ?? "signage"));
  const requestedProductFamily = String(formData.get("productFamily") ?? "").trim();
  const productFamily = requestedProductFamily || productFamilyForDepartment(department);
  const pricingMode = String(formData.get("productPricingMode") ?? (linkedProductId ? "recipe" : "current_price")).trim();
  const createEditableOptions = String(formData.get("productCreateEditableOptions") ?? "yes") !== "no";
  const quantity = String(formData.get("quantity") ?? "1").trim() || "1";
  const unitPrice = String(formData.get("unitPrice") ?? "0").trim() || "0";
  const markupMultiplier = String(formData.get("productSaveMarkupMultiplier") ?? "1.5").trim() || "1.5";
  const profitMultiplier = String(formData.get("productSaveProfitMultiplier") ?? "1.2").trim() || "1.2";

  if (!quoteId || !lineId || !productName) {
    redirect(`/quotes?selected=${quoteId}&error=Quote%20line%20and%20product%20name%20are%20required`);
  }

  const sourceProduct = linkedProductId ? await getProductById(activeTenant.tenantId, linkedProductId) : null;
  if (saveMode === "update" && !sourceProduct) {
    redirect(`/quotes?selected=${quoteId}&error=The%20linked%20saved%20product%20could%20not%20be%20found`);
  }

  const sourceTemplate = sourceProduct?.defaultTemplateId
    ? await getConfiguratorTemplateById(activeTenant.tenantId, sourceProduct.defaultTemplateId)
    : null;

  await updateQuoteLineForTenant(activeTenant.tenantId, quoteId, lineId, {
    productName: lineTitle,
    optionSummary: buildEditableOptionSummary(formData),
    quantity,
    unitPrice,
    notes: nullable(formData.get("notes"))
  });

  let targetProductId = sourceProduct?.id ?? "";
  let targetCurrentTemplateId = sourceProduct?.defaultTemplateId ?? null;
  let targetSku = sourceProduct?.sku ?? null;
  let targetTaxCode = sourceProduct?.taxCode ?? "GST";

  if (saveMode !== "update") {
    const created = await createProduct({
      tenantId: activeTenant.tenantId,
      sku: null,
      name: productName,
      department,
      productFamily,
      status: "active",
      calculatorType: "configurator_template",
      defaultTemplateId: null,
      taxCode: "GST"
    });
    targetProductId = created.id;
    targetCurrentTemplateId = null;
    targetSku = null;
    targetTaxCode = "GST";
  } else if (sourceProduct) {
    await updateProduct(activeTenant.tenantId, sourceProduct.id, {
      sku: targetSku,
      name: productName,
      department,
      productFamily,
      status: "active",
      defaultTemplateId: targetCurrentTemplateId,
      taxCode: targetTaxCode
    });
  }

  if (!targetProductId) {
    redirect(`/quotes?selected=${quoteId}&error=The%20reusable%20product%20could%20not%20be%20created`);
  }

  const template = await ensureProductEditorTemplate({
    tenantId: activeTenant.tenantId,
    productId: targetProductId,
    currentTemplateId: targetCurrentTemplateId,
    productName,
    department,
    productFamily
  });

  const hasSourceRecipe = Boolean(sourceTemplate && (Array.isArray(sourceTemplate.definitionJson.fields) || Array.isArray(sourceTemplate.definitionJson.components)));
  let definition = hasSourceRecipe
    ? (saveMode === "update" ? { ...sourceTemplate!.definitionJson } : cloneDefinition(sourceTemplate!.definitionJson))
    : quoteLineDefinition(formData, createEditableOptions);

  definition = applyCurrentDefaults(definition, formData);
  const useCurrentPrice = pricingMode === "current_price" || !hasSourceRecipe;
  if (useCurrentPrice) {
    definition = { ...definition, components: [savedPriceComponent(formData, unitPrice, markupMultiplier, profitMultiplier)] };
  }
  definition = {
    ...definition,
    version: 3,
    savedFromQuoteLine: {
      quoteLineId: lineId,
      sourceProductId: sourceProduct?.id ?? null,
      pricingMode: useCurrentPrice ? "current_price" : "product_recipe",
      savedUnitPrice: Number(numberValue(unitPrice, 0)).toFixed(2),
      markupMultiplier,
      profitMultiplier,
      currentSelectionsAreDefaults: true,
      savedAt: new Date().toISOString()
    }
  };

  await updateConfiguratorDefinitionJson(activeTenant.tenantId, template.id, definition);
  await updateConfiguratorTemplateMetadata(activeTenant.tenantId, template.id, {
    name: `${productName} setup`,
    department,
    productFamily,
    status: "active"
  });
  await linkQuoteLineToProductForTenant(activeTenant.tenantId, quoteId, lineId, targetProductId, productName);

  const message = saveMode === "update" ? "Saved%20product%20updated%20from%20quote%20line" : "Quote%20line%20saved%20as%20a%20reusable%20product";
  redirect(`/quotes?selected=${quoteId}&message=${message}`);
}


export async function markQuoteSentAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) redirect("/quotes?error=Select%20a%20quote%20first");

  await markQuoteSentForTenant(activeTenant.tenantId, quoteId);
  redirect(`/quotes?selected=${quoteId}&message=Quote%20marked%20as%20sent`);
}

function quoteEmailPublicUrl(token: string): string {
  const explicit = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  const base = explicit || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!base) throw new Error("Production Manager public URL is not configured. Add NEXT_PUBLIC_APP_URL to the deployment.");
  return `${base}/public/quotes/${encodeURIComponent(token)}`;
}

function quoteEmailEscape(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function emailQuoteAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) redirect("/quotes?error=Select%20a%20quote%20first");

  const initialQuote = await getQuoteDraftById(activeTenant.tenantId, quoteId);
  if (!initialQuote) redirect(`/quotes?selected=${quoteId}&error=Quote%20not%20found`);

  const recipient = String(initialQuote.email ?? "").trim();
  if (!recipient || !recipient.includes("@")) {
    await markQuoteEmailFailedForTenant(activeTenant.tenantId, quoteId, { recipient, error: "Quote has no valid client email address." });
    redirect(`/quotes?selected=${quoteId}&error=${encodeURIComponent("Quote has no valid client email address.")}`);
  }

  // Ensure a public identity without changing lifecycle state. The quote only
  // becomes "sent" after Gmail accepts the message successfully.
  await ensureQuotePublicIdentityForTenant(activeTenant.tenantId, quoteId);
  const quote = await getQuoteDraftById(activeTenant.tenantId, quoteId);
  if (!quote?.publicToken) {
    await markQuoteEmailFailedForTenant(activeTenant.tenantId, quoteId, { recipient, error: "Quote public link could not be generated." });
    redirect(`/quotes?selected=${quoteId}&error=${encodeURIComponent("Quote public link could not be generated.")}`);
  }

  await markQuoteEmailPendingForTenant(activeTenant.tenantId, quoteId, recipient);

  let successMessage = "";
  let failureMessage = "";
  try {
    const company = await getCompanySettingsByTenantId(activeTenant.tenantId);
    const publicUrl = quoteEmailPublicUrl(quote.publicToken);
    const companyName = company?.tradingName || company?.companyLegalName || activeTenant.tenantName || "Tender Edge";
    const contactName = quote.contactName || quote.clientName || "there";
    const title = quote.jobName || quote.quoteNumber || "Your quote";
    const quoteNumber = quote.quoteNumber || "Quote";
    const subject = `${quoteNumber} — ${title}`;
    const companyLogo = company?.companyLogoUrl
      ? `<img src="${quoteEmailEscape(company.companyLogoUrl)}" alt="${quoteEmailEscape(companyName)}" style="display:block;max-width:220px;max-height:84px;width:auto;height:auto;border:0;outline:none;text-decoration:none" />`
      : `<div style="font-size:24px;line-height:1.1;font-weight:800;color:#ffffff">${quoteEmailEscape(companyName)}</div>`;
    const companyDetails = [company?.companyLegalName, company?.abn ? `ABN ${company.abn}` : null, company?.phone, company?.email, company?.address]
      .filter(Boolean)
      .map((value) => quoteEmailEscape(String(value)))
      .join(" &nbsp;·&nbsp; ");
    const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033;line-height:1.5">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f5f9;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #dfe7f2;border-radius:20px;overflow:hidden">
          <tr>
            <td style="padding:24px 28px;background:#123a63">
              ${companyLogo}
            </td>
          </tr>
          <tr>
            <td style="padding:30px 32px 12px">
              <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#18a7b5;margin-bottom:8px">Quote ready for review</div>
              <h1 style="margin:0;font-size:28px;line-height:1.2;color:#0f172a">${quoteEmailEscape(title)}</h1>
              <div style="margin-top:10px;font-size:15px;color:#64748b">${quoteEmailEscape(quoteNumber)} &nbsp;·&nbsp; ${quoteEmailEscape(quote.clientName || recipient)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 32px 30px">
              <p style="margin:0 0 14px">Hi ${quoteEmailEscape(contactName)},</p>
              <p style="margin:0 0 22px;color:#475569">Your ${quoteEmailEscape(companyName)} quote is ready. You can review each item and approve it, cancel it, or request changes directly from the quote page.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px">
                <tr><td style="border-radius:12px;background:#0f766e">
                  <a href="${quoteEmailEscape(publicUrl)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800">View and respond to quote</a>
                </td></tr>
              </table>
              <div style="padding:14px 16px;border:1px solid #dbe4f0;border-radius:12px;background:#f8fbff;color:#64748b;font-size:12px;word-break:break-all">
                If the button does not open, use this link:<br><a href="${quoteEmailEscape(publicUrl)}" style="color:#0f766e">${quoteEmailEscape(publicUrl)}</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">
              <strong style="color:#334155">${quoteEmailEscape(companyName)}</strong>${companyDetails ? `<br>${companyDetails}` : ""}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

    const sent = await sendOutboundEmail({
      fromName: `${companyName} Quotes`,
      to: recipient,
      subject,
      html,
      replyTo: company?.email || undefined,
      idempotencyKey: `quote-${quoteId}-${Date.now()}`,
      tags: [{ name: "Type", value: "Quote" }, { name: "Quote", value: quoteNumber }]
    });
    await markQuoteSentForTenant(activeTenant.tenantId, quoteId);
    await markQuoteEmailSentForTenant(activeTenant.tenantId, quoteId, { recipient, messageId: sent.messageId });
    successMessage = `Quote emailed to ${recipient}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markQuoteEmailFailedForTenant(activeTenant.tenantId, quoteId, { recipient, error: message });
    failureMessage = `Quote email failed: ${message}`;
  }

  revalidatePath("/quotes");
  if (failureMessage) redirect(`/quotes?selected=${quoteId}&error=${encodeURIComponent(failureMessage)}`);
  redirect(`/quotes?selected=${quoteId}&message=${encodeURIComponent(successMessage)}`);
}

export async function createArtworkApprovalAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) redirect("/quotes?error=Select%20a%20quote%20first");

  const approval = await createArtworkApprovalFromQuote(activeTenant.tenantId, quoteId);
  redirect(`/artwork-approvals?selected=${approval.id}&message=Artwork%20approval%20created`);
}

export async function sendArtworkApprovalAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  if (!quoteId || !approvalId) redirect("/quotes?error=Select%20an%20artwork%20approval%20first");

  await markArtworkApprovalSentForTenant(activeTenant.tenantId, approvalId);
  redirect(`/quotes?selected=${quoteId}&message=Artwork%20approval%20marked%20as%20sent`);
}

export async function addArtworkApprovalPageAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const notes = nullable(formData.get("notes"));

  if (!quoteId || !approvalId) redirect("/quotes?error=Select%20an%20artwork%20approval%20first");
  if (!title || !imageUrl) redirect(`/quotes?selected=${quoteId}&error=Artwork%20title%20and%20image%20URL%20are%20required`);

  await addArtworkApprovalPageForTenant(activeTenant.tenantId, approvalId, { title, imageUrl, notes });
  redirect(`/quotes?selected=${quoteId}&message=Artwork%20page%20added`);
}

export async function removeArtworkApprovalPageAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  const pageId = String(formData.get("pageId") ?? "").trim();

  if (!quoteId || !approvalId || !pageId) redirect("/quotes?error=Select%20an%20artwork%20page%20to%20remove");

  await removeArtworkApprovalPageForTenant(activeTenant.tenantId, approvalId, pageId);
  redirect(`/quotes?selected=${quoteId}&message=Artwork%20page%20removed`);
}


export async function deleteQuoteDraftAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) redirect("/quotes?error=Select%20a%20quote%20to%20delete");

  await setQuoteDraftStatusForTenant(activeTenant.tenantId, quoteId, "deleted");
  redirect("/quotes?message=Quote%20deleted%20from%20the%20active%20list");
}

export async function restoreQuoteDraftAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) redirect("/quotes?filter=deleted&error=Select%20a%20quote%20to%20restore");

  await setQuoteDraftStatusForTenant(activeTenant.tenantId, quoteId, "draft");
  redirect(`/quotes?selected=${quoteId}&message=Quote%20restored`);
}


export async function linkQuoteClientToMyobAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const myobCustomerId = String(formData.get("myobCustomerId") ?? "").trim();
  const sendNow = String(formData.get("sendNow") ?? "") === "1";

  if (!quoteId) redirect("/quotes?error=Select%20a%20quote%20first");
  if (!myobCustomerId) redirect(`/quotes?selected=${quoteId}&myobLink=required`);

  const quote = await getQuoteDraftById(activeTenant.tenantId, quoteId);
  if (!quote?.linkedCustomerId) {
    redirect(`/quotes?selected=${quoteId}&error=${encodeURIComponent("This quote is not linked to a Production Manager client.")}`);
  }

  const [localClient, myobCustomer] = await Promise.all([
    getCustomerById(activeTenant.tenantId, quote.linkedCustomerId),
    getCustomerById(activeTenant.tenantId, myobCustomerId)
  ]);

  if (!localClient) {
    redirect(`/quotes?selected=${quoteId}&error=${encodeURIComponent("The linked client could not be found.")}`);
  }
  if (!myobCustomer || !myobCustomer.myobUid || myobCustomer.myobUid.startsWith("manual-")) {
    redirect(`/quotes?selected=${quoteId}&myobLink=required&error=${encodeURIComponent("Choose a customer imported from MYOB.")}`);
  }

  const linkedPriceLevel = customerMyobPriceLevel(myobCustomer) ?? "Level A";
  await updateCustomerPayloadForTenant(activeTenant.tenantId, localClient.id, {
    myobUid: myobCustomer.myobUid,
    myobDisplayName: myobCustomer.displayName,
    myobMatch: "quote_manual_selection",
    myobItemPriceLevel: linkedPriceLevel,
    myobPriceLevelName: customerMyobPriceLevelName(myobCustomer) || linkedPriceLevel,
    myobPriceLevelNames: customerMyobPriceLevelNames(myobCustomer)
  }, true);

  await updateQuoteMyobOrderSyncForTenant(activeTenant.tenantId, quoteId, {
    status: quote.status === "accepted" ? "ready_to_sync" : "not_synced",
    error: null,
    payloadJson: {
      customerLinkedAt: new Date().toISOString(),
      linkedCustomerId: localClient.id,
      myobCustomerUid: myobCustomer.myobUid,
      myobCustomerName: myobCustomer.displayName
    }
  });

  if (sendNow && quote.status === "accepted") {
    let sendError = "";
    try {
      await pushAcceptedQuoteToMyobOrderForTenant(activeTenant.tenantId, quoteId);
    } catch (error) {
      sendError = error instanceof Error ? error.message : String(error);
    }
    if (sendError) {
      redirect(`/quotes?selected=${quoteId}&error=${encodeURIComponent(sendError)}`);
    }
    redirect(`/quotes?selected=${quoteId}&message=${encodeURIComponent(`Linked ${localClient.displayName} to ${myobCustomer.displayName} and sent the accepted quote to MYOB.`)}`);
  }

  redirect(`/quotes?selected=${quoteId}&message=${encodeURIComponent(`MYOB customer linked: ${myobCustomer.displayName}`)}`);
}


export async function createQuoteClientInMyobAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  const sendNow = String(formData.get("sendNow") ?? "") === "1";
  if (!quoteId) redirect("/quotes?error=Select%20a%20quote%20first");

  const quote = await getQuoteDraftById(activeTenant.tenantId, quoteId);
  if (!quote?.linkedCustomerId) {
    redirect(`/quotes?selected=${quoteId}&error=${encodeURIComponent("This quote is not linked to a Production Manager client.")}`);
  }

  let result: Awaited<ReturnType<typeof createMyobCustomerFromLocalClientForTenant>> | null = null;
  let actionError = "";
  try {
    result = await createMyobCustomerFromLocalClientForTenant(activeTenant.tenantId, quote.linkedCustomerId);

    await updateQuoteMyobOrderSyncForTenant(activeTenant.tenantId, quoteId, {
      status: quote.status === "accepted" ? "ready_to_sync" : "not_synced",
      error: null,
      payloadJson: {
        customerLinkedAt: new Date().toISOString(),
        linkedCustomerId: quote.linkedCustomerId,
        myobCustomerUid: result.uid,
        myobCustomerName: result.displayName,
        myobCustomerDisplayId: result.displayId,
        customerCreatedInMyob: result.created
      }
    });

    if (sendNow && quote.status === "accepted") {
      await pushAcceptedQuoteToMyobOrderForTenant(activeTenant.tenantId, quoteId);
    }
  } catch (error) {
    // Surface MYOB/API/database failures on the quote page instead of leaving a failed Server Action with no useful UI feedback.
    actionError = error instanceof Error ? error.message : String(error);
  }

  revalidatePath("/quotes");
  if (actionError || !result) {
    redirect(`/quotes?selected=${quoteId}&myobLink=required&error=${encodeURIComponent(actionError || "Could not create or link the MYOB customer.")}`);
  }

  if (sendNow && quote.status === "accepted") {
    const verb = result.created ? "Created" : "Found and linked";
    redirect(`/quotes?selected=${quoteId}&message=${encodeURIComponent(`${verb} MYOB customer ${result.displayName} and sent the accepted quote to MYOB.`)}`);
  }

  const message = result.created
    ? `MYOB customer created and linked: ${result.displayName}`
    : `Matching MYOB customer found and linked: ${result.displayName}. No duplicate was created.`;
  redirect(`/quotes?selected=${quoteId}&message=${encodeURIComponent(message)}`);
}


export async function pushAcceptedQuoteToMyobOrderAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "").trim();
  if (!quoteId) redirect("/quotes?error=Select%20a%20quote%20to%20send%20to%20MYOB");

  let pushError = "";
  try {
    await pushAcceptedQuoteToMyobOrderForTenant(activeTenant.tenantId, quoteId);
  } catch (error) {
    pushError = error instanceof Error ? error.message : String(error);
  }

  if (pushError) {
    const needsCustomerLink = pushError.includes("not mapped to a MYOB customer");
    if (needsCustomerLink) {
      redirect(`/quotes?selected=${quoteId}`);
    }
    redirect(`/quotes?selected=${quoteId}&error=${encodeURIComponent(pushError)}`);
  }

  redirect(`/quotes?selected=${quoteId}&message=Accepted%20quote%20sent%20to%20MYOB%20Order`);
}
