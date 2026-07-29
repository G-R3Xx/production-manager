import "server-only";

import { randomBytes } from "crypto";
import { pool } from "@production-manager/db";
import { calculateProductionRecipeCost } from "@production-manager/domain";
import { getConfiguratorTemplateById } from "@/server/configurators";
import {
  ensureWordPressProductPublishingSchema,
  getProductById,
  listPublishedWebsiteProductsForTenant,
  type ProductRecord
} from "@/server/products";
import type { MaterialRecord } from "@/server/materials";
import { listRecipesForTenant, previewRecipeCost } from "@/server/productionResources";
import {
  addQuoteLine,
  createQuoteDraftForTenant,
  setQuoteDraftStatusForTenant,
  updateQuoteMyobOrderSyncForTenant
} from "@/server/quotes";

export type WordPressConnectionRecord = {
  id: string;
  tenantId: string;
  siteUrl: string | null;
  apiKey: string;
  status: string;
  lastCatalogPullAt: string | null;
  lastOrderReceivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebsiteBuilderChoice = {
  id: string | null;
  label: string;
  value: string;
  priceDelta: number;
  widthMm: number | null;
  heightMm: number | null;
};

export type WebsiteBuilderField = {
  id: string | null;
  key: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue: unknown;
  helpText: string | null;
  display: "buttons" | "cards" | "dropdown" | "swatches" | "number" | "text";
  options: WebsiteBuilderChoice[];
  showWhen: Record<string, unknown> | null;
  customSize: boolean;
  minimum: number | null;
  step: number | null;
};

export type WebsiteCatalogProduct = {
  id: string;
  sku: string | null;
  name: string;
  slug: string;
  category: string | null;
  status: string;
  mode: "live_checkout" | "quote_only";
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  department: string;
  productFamily: string;
  manufacturingMethod: { id: string; name: string } | null;
  fields: WebsiteBuilderField[];
  defaults: { widthMm: number; heightMm: number; quantity: number };
  startingPrice: number | null;
  syncVersion: number;
  updatedAt: string;
};

type WebsitePricingMaterial = Pick<MaterialRecord,
  "id" | "name" | "materialType" | "stockUom" | "purchaseUom" | "stockQuantity" |
  "purchaseCost" | "widthMm" | "lengthMm" | "rollWidthMm" | "minimumBillableSheetFraction"
>;

type PriceBody = {
  productId: string;
  widthMm?: number;
  heightMm?: number;
  quantity?: number;
  answers?: Record<string, unknown>;
};

export type WordPressOrderPayload = {
  orderId?: string | number;
  orderNumber?: string | number;
  status?: string;
  currency?: string;
  total?: number | string;
  customer?: {
    company?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  lines?: Array<{
    productId?: string;
    productName?: string;
    quantity?: number;
    lineTotal?: number;
    answers?: Record<string, unknown>;
    widthMm?: number;
    heightMm?: number;
    configuration?: Record<string, unknown>;
  }>;
  raw?: Record<string, unknown>;
};

let wordPressBridgeSchemaReady = false;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "product";
}

function parseSize(value: unknown): { widthMm: number; heightMm: number } | null {
  const source = text(value);
  const match = source.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return { widthMm: numberValue(match[1]), heightMm: numberValue(match[2]) };
}

function normalisedFieldType(field: Record<string, unknown>): string {
  const raw = text(field.type).toLowerCase();
  if (["multiselect", "multi", "multiple", "checkbox", "checkboxes"].includes(raw)) return "multi_select";
  if (["boolean", "bool"].includes(raw)) return "yes_no";
  if (["dimensions", "dimension", "size"].includes(raw)) return "size_select";
  return raw || "select";
}

function displayForField(field: Record<string, unknown>, config: Record<string, unknown>): WebsiteBuilderField["display"] {
  const fieldDisplays = asObject(config.fieldDisplays);
  const configured = text(fieldDisplays[text(field.key)]);
  if (["buttons", "cards", "dropdown", "swatches", "number", "text"].includes(configured)) {
    return configured as WebsiteBuilderField["display"];
  }
  const type = normalisedFieldType(field);
  if (type === "color") return "swatches";
  if (["number", "quantity"].includes(type)) return "number";
  if (type === "text") return "text";
  if (type === "select" && asArray(field.options).length > 6) return "dropdown";
  return type === "size_select" ? "cards" : "buttons";
}

function serialisedChoices(field: Record<string, unknown>): WebsiteBuilderChoice[] {
  const type = normalisedFieldType(field);
  const source = asArray(field.options);
  const rawChoices = type === "yes_no" && source.length === 0
    ? [{ id: null, label: "Yes", value: "yes", priceDelta: 0 }, { id: null, label: "No", value: "no", priceDelta: 0 }]
    : source;
  return rawChoices.map((rawChoice) => {
    const choice = asObject(rawChoice);
    return {
      id: text(choice.id) || null,
      label: text(choice.label) || text(choice.value) || "Option",
      value: text(choice.value) || text(choice.label),
      priceDelta: numberValue(choice.priceDelta ?? choice.priceAdjustment),
      widthMm: choice.widthMm == null ? null : numberValue(choice.widthMm),
      heightMm: choice.heightMm == null ? null : numberValue(choice.heightMm)
    };
  }).filter((choice) => choice.value !== "");
}

function normalizedConditionValue(value: unknown): string {
  const raw = text(value);
  if (["roll_print", "roll_stock_applied"].includes(raw)) return "roll_stock";
  return raw;
}

function normalizedShowWhen(field: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const raw = asObject(field.showWhen);
  let optionKey = text(raw.optionKey);
  if (optionKey === "print_type") optionKey = "print_method";
  let optionValues = asArray(raw.optionValues).map(normalizedConditionValue).filter(Boolean);

  // Older signage templates described the dependency in the help text but did
  // not always persist showWhen. Keep roll media choices out of the way unless
  // the customer has actually selected Roll print.
  if (!optionKey && /^roll_stock(?:_|$)/.test(key) && key !== "print_method") {
    optionKey = "print_method";
    optionValues = ["roll_stock"];
  }

  if (!optionKey) return null;
  return { optionKey, optionValues };
}

function serializeFields(definition: Record<string, unknown>, websiteConfig: Record<string, unknown>): WebsiteBuilderField[] {
  const standardOrder = new Map(["finished_size", "quantity", "print_method", "ink", "laminate", "finishing", "eyelet_placement", "eyelet_custom_quantity", "delivery_method"].map((key, index) => [key, index]));
  const entries: Array<{ sourceIndex: number; order: number; field: WebsiteBuilderField }> = [];

  asArray(definition.fields).forEach((rawField, sourceIndex) => {
    const field = asObject(rawField);
    const meta = asObject(field.meta);
    if (meta.websiteHidden === true || meta.websiteVisible === false) return;

    const key = text(field.key) || safeSlug(text(field.label));
    const type = normalisedFieldType(field);
    let options = serialisedChoices(field);
    let label = text(field.label) || "Option";
    let helpText = text(field.helpText) || null;

    if (key === "finished_size") {
      label = "Finished size";
      helpText = "Choose the finished size. Select Custom size to enter different dimensions.";
      if (!options.some((choice) => choice.value.toLowerCase() === "custom")) {
        options = [...options, { id: null, label: "Custom size", value: "custom", priceDelta: 0, widthMm: null, heightMm: null }];
      }
    } else if (key === "quantity") {
      label = "Quantity";
      helpText = "Number of finished items required.";
    } else if (key === "print_method") {
      label = "Print method";
      helpText = "Choose how the product is normally printed.";
      options = options.map((choice) => choice.value === "roll_stock" || choice.value === "roll_print"
        ? { ...choice, label: "Roll print", value: "roll_stock" }
        : choice);
    } else if (key === "delivery_method") {
      label = "How does the customer receive it?";
      helpText = "Choose pickup, delivery or installation.";
    }

    const minimumValue = Number(meta.minimum);
    const stepValue = Number(meta.step);
    const serialisedField: WebsiteBuilderField = {
      id: text(field.id) || null,
      key,
      label,
      type,
      required: field.required !== false,
      defaultValue: field.defaultValue ?? null,
      helpText,
      display: displayForField({ ...field, type }, websiteConfig),
      options,
      showWhen: normalizedShowWhen(field, key),
      customSize: type === "size_select" && options.some((choice) => choice.value.toLowerCase() === "custom"),
      minimum: Number.isFinite(minimumValue) ? minimumValue : (type === "quantity" ? 1 : null),
      step: Number.isFinite(stepValue) ? stepValue : (type === "quantity" ? 1 : null)
    };

    entries.push({
      sourceIndex,
      order: standardOrder.get(key) ?? 1000 + sourceIndex,
      field: serialisedField
    });
  });

  return entries
    .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex)
    .map((entry) => entry.field);
}

export async function ensureWordPressBridgeSchema(): Promise<void> {
  if (!process.env.DATABASE_URL || wordPressBridgeSchemaReady) return;
  await ensureWordPressProductPublishingSchema();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration.wordpress_connections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL UNIQUE REFERENCES app.tenants(id) ON DELETE CASCADE,
      site_url text,
      api_key text NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'connected',
      last_catalog_pull_at timestamptz,
      last_order_received_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS wordpress_connections_api_key_idx ON integration.wordpress_connections(api_key)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration.wordpress_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
      external_order_id varchar(160) NOT NULL,
      quote_id uuid REFERENCES sales.quote_drafts(id) ON DELETE SET NULL,
      order_status varchar(60),
      order_total numeric(14,2),
      payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      received_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, external_order_id)
    )
  `);
  wordPressBridgeSchemaReady = true;
}

export function createWordPressApiKey(): string {
  return `pm_${randomBytes(32).toString("hex")}`;
}

export async function getWordPressConnectionForTenant(tenantId: string): Promise<WordPressConnectionRecord | null> {
  await ensureWordPressBridgeSchema();
  const result = await pool.query<WordPressConnectionRecord>(`
    SELECT id::text,tenant_id::text AS "tenantId",site_url AS "siteUrl",api_key AS "apiKey",status,
      last_catalog_pull_at AS "lastCatalogPullAt",last_order_received_at AS "lastOrderReceivedAt",
      created_at AS "createdAt",updated_at AS "updatedAt"
    FROM integration.wordpress_connections WHERE tenant_id=$1::uuid LIMIT 1
  `, [tenantId]);
  return result.rows[0] ?? null;
}

export async function saveWordPressConnectionForTenant(tenantId: string, input: {
  siteUrl: string | null;
  apiKey?: string | null;
  status?: string;
}): Promise<WordPressConnectionRecord> {
  await ensureWordPressBridgeSchema();
  const apiKey = text(input.apiKey) || createWordPressApiKey();
  const result = await pool.query<WordPressConnectionRecord>(`
    INSERT INTO integration.wordpress_connections(tenant_id,site_url,api_key,status,created_at,updated_at)
    VALUES($1::uuid,$2::text,$3::text,$4::varchar,now(),now())
    ON CONFLICT(tenant_id) DO UPDATE SET site_url=EXCLUDED.site_url,api_key=EXCLUDED.api_key,status=EXCLUDED.status,updated_at=now()
    RETURNING id::text,tenant_id::text AS "tenantId",site_url AS "siteUrl",api_key AS "apiKey",status,
      last_catalog_pull_at AS "lastCatalogPullAt",last_order_received_at AS "lastOrderReceivedAt",
      created_at AS "createdAt",updated_at AS "updatedAt"
  `, [tenantId, input.siteUrl, apiKey, input.status ?? "connected"]);
  return result.rows[0];
}

export async function resolveWordPressConnectionByApiKey(apiKey: string): Promise<WordPressConnectionRecord | null> {
  await ensureWordPressBridgeSchema();
  if (!apiKey) return null;
  const result = await pool.query<WordPressConnectionRecord>(`
    SELECT id::text,tenant_id::text AS "tenantId",site_url AS "siteUrl",api_key AS "apiKey",status,
      last_catalog_pull_at AS "lastCatalogPullAt",last_order_received_at AS "lastOrderReceivedAt",
      created_at AS "createdAt",updated_at AS "updatedAt"
    FROM integration.wordpress_connections WHERE api_key=$1::text AND status='connected' LIMIT 1
  `, [apiKey]);
  return result.rows[0] ?? null;
}

export function apiKeyFromRequest(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-pm-api-key")?.trim() ?? "";
}

async function catalogueProduct(product: ProductRecord): Promise<WebsiteCatalogProduct> {
  const template = product.defaultTemplateId
    ? await getConfiguratorTemplateById(product.tenantId, product.defaultTemplateId).catch(() => null)
    : null;
  const templateDefinition = asObject(template?.definitionJson);
  const config = asObject(product.websiteConfigJson);
  const templateFields = asArray(templateDefinition.fields);
  const templateComponents = asArray(templateDefinition.components);
  const guidedFields = asArray(config.guidedFields);
  const guidedComponents = asArray(config.guidedComponents);
  // Guided Builder fields and answer-linked costing rows are mirrored onto the
  // product record when saved. The template remains primary, while the product
  // copy prevents a stale relationship from dropping either the builder or its
  // live option pricing.
  const definition = {
    ...templateDefinition,
    fields: templateFields.length ? templateFields : guidedFields,
    components: templateComponents.length ? templateComponents : guidedComponents
  };
  const defaults = {
    widthMm: Math.max(1, numberValue(config.defaultWidthMm, 600)),
    heightMm: Math.max(1, numberValue(config.defaultHeightMm, 450)),
    quantity: Math.max(1, Math.round(numberValue(config.defaultQuantity, 1)))
  };
  let startingPrice: number | null = null;
  if (product.productionRecipeId) {
    const preview = await previewRecipeCost(product.tenantId, product.productionRecipeId, defaults.widthMm, defaults.heightMm, defaults.quantity).catch(() => null);
    startingPrice = preview?.sellPrice ?? null;
  } else if (config.basePrice != null) {
    startingPrice = numberValue(config.basePrice);
  }
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.websiteSlug || safeSlug(product.name),
    category: product.websiteCategory,
    status: product.status,
    mode: product.websiteMode === "live_checkout" ? "live_checkout" : "quote_only",
    shortDescription: product.websiteShortDescription,
    description: product.websiteDescription,
    imageUrl: product.websiteImageUrl,
    department: product.department,
    productFamily: product.productFamily,
    manufacturingMethod: product.productionRecipeId
      ? { id: product.productionRecipeId, name: product.productionRecipeName ?? "Manufacturing method" }
      : null,
    fields: serializeFields(definition, config),
    defaults,
    startingPrice,
    syncVersion: Number(product.websiteSyncVersion || 1),
    updatedAt: String(product.updatedAt)
  };
}

export async function getWordPressCatalogForConnection(connection: WordPressConnectionRecord): Promise<{
  version: string;
  tenantId: string;
  generatedAt: string;
  products: WebsiteCatalogProduct[];
}> {
  const products = await listPublishedWebsiteProductsForTenant(connection.tenantId);
  const serialised = await Promise.all(products.map(catalogueProduct));
  await pool.query(`UPDATE integration.wordpress_connections SET last_catalog_pull_at=now(),updated_at=now() WHERE id=$1::uuid`, [connection.id]);
  return {
    version: "V26.07.29.06",
    tenantId: connection.tenantId,
    generatedAt: new Date().toISOString(),
    products: serialised
  };
}

export async function getWordPressProductForConnection(connection: WordPressConnectionRecord, productId: string): Promise<WebsiteCatalogProduct | null> {
  const product = await getProductById(connection.tenantId, productId);
  if (!product || !product.websiteEnabled || product.status !== "active") return null;
  return catalogueProduct(product);
}

function selectedValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const one = text(value);
  if (!one) return [];
  return one.includes(",") ? one.split(",").map(text).filter(Boolean) : [one];
}

function fieldConditionMatches(showWhen: Record<string, unknown> | null, answers: Record<string, unknown>): boolean {
  if (!showWhen) return true;
  const optionKey = text(showWhen.optionKey);
  if (!optionKey) return true;
  const selected = selectedValues(answers[optionKey]);
  const requiredValues = asArray(showWhen.optionValues).map(text).filter(Boolean);
  return requiredValues.length
    ? requiredValues.some((value) => selected.includes(value))
    : selected.length > 0;
}

function defaultAnswersForFields(fields: WebsiteBuilderField[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.defaultValue == null || field.defaultValue === "") continue;
    defaults[field.key] = field.defaultValue;
  }
  return defaults;
}

function componentConditionMatches(component: Record<string, unknown>, answers: Record<string, unknown>): boolean {
  const trigger = asObject(component.trigger);
  const stockUsage = asObject(component.stockUsage);
  const optionKey = text(trigger.optionKey) || text(stockUsage.optionKey);
  if (!optionKey) return false;
  const selected = selectedValues(answers[optionKey]);
  const sourceValues = asArray(trigger.optionValues).length
    ? asArray(trigger.optionValues)
    : asArray(stockUsage.optionValues);
  const requiredValues = sourceValues.map(normalizedConditionValue).filter(Boolean);
  return requiredValues.length
    ? requiredValues.some((value) => selected.map(normalizedConditionValue).includes(value))
    : selected.length > 0;
}

async function pricingMaterialsForDefinition(
  tenantId: string,
  definition: Record<string, unknown>
): Promise<WebsitePricingMaterial[]> {
  const materialIds = Array.from(new Set(
    asArray(definition.components)
      .map((rawComponent) => text(asObject(rawComponent).materialId))
      .filter(Boolean)
  ));
  if (!materialIds.length) return [];

  const result = await pool.query<WebsitePricingMaterial>(`
    SELECT
      id::text,
      name,
      COALESCE(material_type::text, type::text) AS "materialType",
      stock_uom AS "stockUom",
      purchase_uom AS "purchaseUom",
      stock_quantity::text AS "stockQuantity",
      COALESCE((cost_json ->> 'purchaseCost')::numeric, purchase_cost, 0)::text AS "purchaseCost",
      width_mm::text AS "widthMm",
      length_mm::text AS "lengthMm",
      roll_width_mm::text AS "rollWidthMm",
      minimum_billable_sheet_fraction::text AS "minimumBillableSheetFraction"
    FROM catalog.materials
    WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])
  `, [tenantId, materialIds]);
  return result.rows;
}

function materialLooksLikeRoll(material: WebsitePricingMaterial): boolean {
  const source = [material.materialType, material.purchaseUom, material.stockUom, material.name]
    .map((value) => text(value).toLowerCase())
    .join(" ");
  return numberValue(material.rollWidthMm) > 0 || /\b(roll|vinyl|sav|laminat|cello|banner|linear metre|linear meter|\blm\b)\b/.test(source);
}

function materialRate(material: WebsitePricingMaterial, basis: "lm" | "sqm" | "sheet" | "each"): number {
  const purchaseCost = Math.max(0, numberValue(material.purchaseCost));
  const purchaseUom = text(material.purchaseUom).toLowerCase();
  const stockUom = text(material.stockUom).toLowerCase();
  const stockQuantity = Math.max(0, numberValue(material.stockQuantity));
  const rollWidthM = Math.max(0, numberValue(material.rollWidthMm)) / 1000;
  const sheetArea = Math.max(0, numberValue(material.widthMm)) * Math.max(0, numberValue(material.lengthMm)) / 1_000_000;
  const linearUnits = ["lm", "m", "metre", "meter", "linear metre", "linear meter"];

  if (basis === "lm") {
    if (linearUnits.includes(purchaseUom)) return purchaseCost;
    if ((purchaseUom.includes("roll") || materialLooksLikeRoll(material)) && stockQuantity > 0 && linearUnits.includes(stockUom)) {
      return purchaseCost / stockQuantity;
    }
    return purchaseCost;
  }
  if (basis === "sqm") {
    if (["sqm", "m2", "m²", "square metre", "square meter"].includes(purchaseUom)) return purchaseCost;
    if (purchaseUom.includes("sheet") && sheetArea > 0) return purchaseCost / sheetArea;
    if (linearUnits.includes(purchaseUom) && rollWidthM > 0) return purchaseCost / rollWidthM;
    if (purchaseUom.includes("roll") && rollWidthM > 0 && stockQuantity > 0 && linearUnits.includes(stockUom)) {
      return purchaseCost / (rollWidthM * stockQuantity);
    }
    return purchaseCost;
  }
  return purchaseCost;
}

function followUpMultiplier(component: Record<string, unknown>, answers: Record<string, unknown>): number {
  const stockUsage = asObject(component.stockUsage);
  const label = `${text(component.label)} ${text(component.notes)} ${text(stockUsage.quantityPrompt)}`.toLowerCase();
  if (text(stockUsage.quantitySource) !== "follow_up" && !label.includes("eyelet") && !label.includes("grommet")) return 1;
  const placement = text(answers.eyelet_placement);
  if (placement === "four_corners" || placement === "pole_fixing") return 4;
  if (placement === "top_corners_only" || placement === "centre_top_bottom") return 2;
  if (placement === "__custom") return Math.max(0, numberValue(answers.eyelet_custom_quantity));
  return 1;
}

function optionalComponentCostTotal(
  definition: Record<string, unknown>,
  materials: WebsitePricingMaterial[],
  answers: Record<string, unknown>,
  widthMm: number,
  heightMm: number,
  quantity: number
): number {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const areaTotal = Math.max(0, widthMm) * Math.max(0, heightMm) * Math.max(1, quantity) / 1_000_000;
  let total = 0;

  for (const rawComponent of asArray(definition.components)) {
    const component = asObject(rawComponent);
    if (!componentConditionMatches(component, answers)) continue;
    const stockUsage = asObject(component.stockUsage);
    const ruleType = text(component.ruleType) || text(stockUsage.usageBasis) || "yield_based";
    const allowance = Math.max(0, numberValue(component.quantity, 1));
    const wastePercent = Math.max(0, numberValue(component.wastePercent));
    const wasteMultiplier = 1 + wastePercent / 100;
    const answerMultiplier = followUpMultiplier(component, answers);

    if (ruleType === "choice_only") continue;
    if (ruleType === "sell_sqm") {
      const rate = Math.max(0, numberValue(stockUsage.sellRate, numberValue(component.quantity)));
      total += areaTotal * rate * answerMultiplier;
      continue;
    }
    if (ruleType === "sell_each") {
      const rate = Math.max(0, numberValue(stockUsage.sellRate, numberValue(component.quantity)));
      total += Math.max(1, quantity) * rate * answerMultiplier;
      continue;
    }
    if (ruleType === "labour_hours") {
      const hourlyRate = Math.max(0, numberValue(stockUsage.sellRate, 66));
      total += allowance * Math.max(1, quantity) * answerMultiplier * hourlyRate;
      continue;
    }
    if (ruleType === "outsourced_each") {
      const rate = Math.max(0, numberValue(stockUsage.sellRate));
      total += allowance * Math.max(1, quantity) * answerMultiplier * rate;
      continue;
    }

    const material = materialMap.get(text(component.materialId));
    if (!material) continue;

    if (ruleType === "per_linear_metre" || (ruleType === "yield_based" && materialLooksLikeRoll(material))) {
      const cost = calculateProductionRecipeCost({
        finishedWidthMm: widthMm,
        finishedHeightMm: heightMm,
        quantity,
        material: {
          type: "roll",
          widthMm: numberValue(material.widthMm),
          heightMm: numberValue(material.lengthMm),
          rollWidthMm: numberValue(stockUsage.rollWidthMm, numberValue(material.rollWidthMm)),
          unitCost: materialRate(material, "lm"),
          allowRotation: true
        },
        machine: null,
        labour: [],
        wastePercent,
        markupMultiplier: 1,
        profitMultiplier: 1
      });
      total += cost.materialCost * allowance * answerMultiplier;
      continue;
    }

    if (ruleType === "per_sqm") {
      total += areaTotal * materialRate(material, "sqm") * allowance * answerMultiplier * wasteMultiplier;
      continue;
    }

    if (["per_unit", "selected_by_option"].includes(ruleType)) {
      total += materialRate(material, "each") * allowance * Math.max(1, quantity) * answerMultiplier * wasteMultiplier;
      continue;
    }

    const calculated = calculateProductionRecipeCost({
      finishedWidthMm: widthMm,
      finishedHeightMm: heightMm,
      quantity,
      material: {
        type: material.materialType,
        widthMm: numberValue(material.widthMm),
        heightMm: numberValue(material.lengthMm),
        rollWidthMm: numberValue(material.rollWidthMm),
        unitCost: materialLooksLikeRoll(material) ? materialRate(material, "lm") : materialRate(material, "sheet"),
        minimumBillableSheetFraction: numberValue(material.minimumBillableSheetFraction),
        allowRotation: true
      },
      machine: null,
      labour: [],
      wastePercent,
      markupMultiplier: 1,
      profitMultiplier: 1
    });
    total += calculated.materialCost * allowance * answerMultiplier;
  }

  return Math.round(total * 100) / 100;
}

export async function priceWordPressProductForTenant(tenantId: string, body: PriceBody) {
  const product = await getProductById(tenantId, body.productId);
  if (!product || !product.websiteEnabled || product.status !== "active") return null;
  const template = product.defaultTemplateId
    ? await getConfiguratorTemplateById(tenantId, product.defaultTemplateId).catch(() => null)
    : null;
  const templateDefinition = asObject(template?.definitionJson);
  const websiteConfig = asObject(product.websiteConfigJson);
  const templateFields = asArray(templateDefinition.fields);
  const templateComponents = asArray(templateDefinition.components);
  const definition = {
    ...templateDefinition,
    fields: templateFields.length ? templateFields : asArray(websiteConfig.guidedFields),
    components: templateComponents.length ? templateComponents : asArray(websiteConfig.guidedComponents)
  };
  const fields = serializeFields(definition, websiteConfig);
  const answers = asObject(body.answers);

  let widthMm = numberValue(body.widthMm, numberValue(websiteConfig.defaultWidthMm, 600));
  let heightMm = numberValue(body.heightMm, numberValue(websiteConfig.defaultHeightMm, 450));
  let quantity = Math.max(1, Math.round(numberValue(body.quantity, numberValue(websiteConfig.defaultQuantity, 1))));
  let optionDelta = 0;
  let quoteTriggered = false;
  const validationErrors: string[] = [];

  for (const field of fields) {
    if (!fieldConditionMatches(field.showWhen, answers)) continue;
    const values = selectedValues(answers[field.key]);
    if (field.required && !values.length) validationErrors.push(`${field.label} is required`);
    if (!values.length) continue;
    if (field.type === "quantity" || field.key.toLowerCase().includes("quantity")) {
      quantity = Math.max(1, Math.round(numberValue(values[0], quantity)));
    }
    for (const selected of values) {
      const choice = field.options.find((item) => item.value === selected || item.label === selected);
      if (!choice) {
        if (field.type === "size_select" || field.key.toLowerCase().includes("size")) {
          const parsed = parseSize(selected);
          if (parsed) ({ widthMm, heightMm } = parsed);
        }
        continue;
      }
      optionDelta += choice.priceDelta;
      if (choice.widthMm && choice.heightMm) {
        widthMm = choice.widthMm;
        heightMm = choice.heightMm;
      } else if (field.type === "size_select" || field.key.toLowerCase().includes("size")) {
        const parsed = parseSize(choice.label) ?? parseSize(choice.value);
        if (parsed) ({ widthMm, heightMm } = parsed);
      }
      const rawField = asArray(definition.fields).map(asObject).find((item) => text(item.key) === field.key);
      const rule = asObject(rawField?.rule);
      if (text(rule.effectType) === "quote") quoteTriggered = true;
    }
  }

  const components = asArray(definition.components);
  const [recipe, materials, recipes] = await Promise.all([
    product.productionRecipeId
      ? previewRecipeCost(tenantId, product.productionRecipeId, widthMm, heightMm, quantity).catch(() => null)
      : Promise.resolve(null),
    components.length ? pricingMaterialsForDefinition(tenantId, definition).catch(() => [] as WebsitePricingMaterial[]) : Promise.resolve([] as WebsitePricingMaterial[]),
    product.productionRecipeId ? listRecipesForTenant(tenantId).catch(() => []) : Promise.resolve([])
  ]);
  const recipeSettings = recipes.find((item) => item.id === product.productionRecipeId);
  const markupMultiplier = Math.max(0, numberValue(recipeSettings?.markupMultiplier, numberValue(websiteConfig.markupMultiplier, 1.5)));
  const profitMultiplier = Math.max(0, numberValue(recipeSettings?.profitMultiplier, numberValue(websiteConfig.profitMultiplier, 1.2)));
  const optionalCost = optionalComponentCostTotal(definition, materials, answers, widthMm, heightMm, quantity);
  const defaultOptionalCost = optionalComponentCostTotal(
    definition,
    materials,
    defaultAnswersForFields(fields),
    widthMm,
    heightMm,
    quantity
  );
  // The recipe preview is the saved/default configuration. Add only the
  // difference created by the customer's current option answers so default ink
  // or media is not counted twice.
  const optionalCostDelta = optionalCost - defaultOptionalCost;
  const optionalSell = optionalCostDelta * markupMultiplier * profitMultiplier;
  const baseSell = recipe?.sellPrice ?? numberValue(websiteConfig.basePrice);
  const lineTotal = Math.max(0, Math.round((baseSell + optionalSell + optionDelta) * 100) / 100);
  return {
    productId: product.id,
    productName: product.name,
    mode: product.websiteMode === "quote_only" || quoteTriggered ? "quote_only" : "live_checkout",
    quoteRequired: product.websiteMode === "quote_only" || quoteTriggered,
    validationErrors,
    widthMm,
    heightMm,
    quantity,
    optionDelta: Math.round((optionDelta + optionalSell) * 100) / 100,
    optionMaterialCost: Math.round(optionalCostDelta * 100) / 100,
    optionSellPrice: Math.round(optionalSell * 100) / 100,
    lineTotal,
    unitPrice: Math.round((lineTotal / quantity) * 100) / 100,
    currency: "AUD",
    cost: recipe ? {
      material: recipe.materialCost,
      machines: recipe.machineCost,
      ink: recipe.inkCost,
      labour: recipe.labourCost,
      total: Math.round((recipe.totalCost + optionalCostDelta) * 100) / 100
    } : null,
    materialUsage: recipe?.materialUsage ?? null,
    manufacturingMethodId: product.productionRecipeId,
    answers
  };
}

export async function priceWordPressProductForConnection(connection: WordPressConnectionRecord, body: PriceBody) {
  return priceWordPressProductForTenant(connection.tenantId, body);
}

function orderCustomerName(customer: WordPressOrderPayload["customer"]): string {
  const company = text(customer?.company);
  if (company) return company;
  return [text(customer?.firstName), text(customer?.lastName)].filter(Boolean).join(" ") || "Website customer";
}

function answerSummary(answers: Record<string, unknown>): string {
  return Object.entries(answers)
    .filter(([, value]) => selectedValues(value).length)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${selectedValues(value).join(", ")}`)
    .join(" · ");
}

export async function ingestWordPressOrder(connection: WordPressConnectionRecord, payload: WordPressOrderPayload) {
  await ensureWordPressBridgeSchema();
  const externalOrderId = text(payload.orderId || payload.orderNumber);
  if (!externalOrderId) throw new Error("WooCommerce order ID is required");

  const existing = await pool.query<{ quoteId: string | null }>(`
    SELECT quote_id::text AS "quoteId" FROM integration.wordpress_orders
    WHERE tenant_id=$1::uuid AND external_order_id=$2::varchar LIMIT 1
  `, [connection.tenantId, externalOrderId]);
  const paidStatuses = new Set(["processing", "completed", "on-hold"]);
  const quoteStatus = paidStatuses.has(text(payload.status)) ? "accepted" : "draft";
  if (existing.rows[0]) {
    const quoteId = existing.rows[0].quoteId;
    if (quoteId) {
      await setQuoteDraftStatusForTenant(connection.tenantId, quoteId, quoteStatus);
      if (quoteStatus === "accepted") {
        await updateQuoteMyobOrderSyncForTenant(connection.tenantId, quoteId, {
          status: "ready_to_sync",
          payloadJson: { source: "wordpress", externalOrderId, websiteStatus: payload.status ?? null }
        });
      }
    }
    await pool.query(`
      UPDATE integration.wordpress_orders
      SET order_status=$3::varchar,order_total=$4::numeric,payload_json=$5::jsonb,updated_at=now()
      WHERE tenant_id=$1::uuid AND external_order_id=$2::varchar
    `, [connection.tenantId, externalOrderId, text(payload.status) || null, numberValue(payload.total), JSON.stringify(payload)]);
    await pool.query(`UPDATE integration.wordpress_connections SET last_order_received_at=now(),updated_at=now() WHERE id=$1::uuid`, [connection.id]);
    return { created: false, updated: true, quoteId, status: quoteStatus };
  }

  const customer = payload.customer ?? {};
  const quote = await createQuoteDraftForTenant(connection.tenantId, {
    clientName: orderCustomerName(customer),
    contactName: [text(customer.firstName), text(customer.lastName)].filter(Boolean).join(" ") || null,
    email: text(customer.email) || null,
    phone: text(customer.phone) || null,
    notes: `WooCommerce order ${text(payload.orderNumber) || externalOrderId} · ${text(payload.status) || "received"}`
  });

  let addedLines = 0;
  for (const line of payload.lines ?? []) {
    const productId = text(line.productId);
    if (!productId) continue;
    const answers = asObject(line.answers ?? asObject(line.configuration).answers);
    const calculated = await priceWordPressProductForTenant(connection.tenantId, {
      productId,
      widthMm: line.widthMm,
      heightMm: line.heightMm,
      quantity: numberValue(line.quantity, 1),
      answers
    });
    if (!calculated) continue;
    const quantity = Math.max(1, calculated.quantity);
    const lineTotal = line.lineTotal == null
      ? calculated.lineTotal
      : Math.max(0, numberValue(line.lineTotal, calculated.lineTotal));
    await addQuoteLine(quote.id, {
      productId,
      productName: calculated.productName || text(line.productName) || "Website product",
      optionSummary: answerSummary(answers),
      quantity: String(quantity),
      unitPrice: String(Math.round((lineTotal / quantity) * 100) / 100),
      notes: `Imported from WooCommerce order ${text(payload.orderNumber) || externalOrderId}`,
      configurationSnapshot: {
        source: "wordpress_woocommerce",
        externalOrderId,
        websiteStatus: payload.status ?? null,
        widthMm: calculated.widthMm,
        heightMm: calculated.heightMm,
        quantity,
        answers,
        productionCost: calculated.cost,
        calculatedWebsiteLineTotal: calculated.lineTotal,
        chargedWebsiteLineTotal: lineTotal,
        materialUsage: calculated.materialUsage,
        manufacturingMethodId: calculated.manufacturingMethodId,
        rawConfiguration: line.configuration ?? {}
      }
    });
    addedLines += 1;
  }

  if (addedLines === 0) {
    await pool.query(`DELETE FROM sales.quote_drafts WHERE tenant_id=$1::uuid AND id=$2::uuid`, [connection.tenantId, quote.id]);
    throw new Error("WooCommerce order contained no valid Production Manager products");
  }

  await setQuoteDraftStatusForTenant(connection.tenantId, quote.id, quoteStatus);
  if (quoteStatus === "accepted") {
    await updateQuoteMyobOrderSyncForTenant(connection.tenantId, quote.id, {
      status: "ready_to_sync",
      payloadJson: { source: "wordpress", externalOrderId }
    });
  }

  await pool.query(`
    INSERT INTO integration.wordpress_orders(tenant_id,external_order_id,quote_id,order_status,order_total,payload_json,received_at,updated_at)
    VALUES($1::uuid,$2::varchar,$3::uuid,$4::varchar,$5::numeric,$6::jsonb,now(),now())
    ON CONFLICT(tenant_id,external_order_id) DO NOTHING
  `, [
    connection.tenantId,
    externalOrderId,
    quote.id,
    text(payload.status) || null,
    numberValue(payload.total),
    JSON.stringify(payload)
  ]);
  await pool.query(`UPDATE integration.wordpress_connections SET last_order_received_at=now(),updated_at=now() WHERE id=$1::uuid`, [connection.id]);
  return { created: true, quoteId: quote.id, status: quoteStatus };
}
