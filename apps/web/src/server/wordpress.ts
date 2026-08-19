import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { pool } from "@production-manager/db";
import { calculateProductionRecipeCost } from "@production-manager/domain";
import { getConfiguratorTemplateById } from "@/server/configurators";
import {
  ensureWordPressProductPublishingSchema,
  getProductById,
  listPublishedWebsiteProductsForTenant,
  type ProductRecord
} from "@/server/products";
import { ensureMaterialPricingColumns, type MaterialRecord } from "@/server/materials";
import { getCompanySettingsByTenantId } from "@/server/company";
import { customerMyobPriceLevel, customerMyobPriceLevelName, getCustomerById, type CustomerRecord, type MyobPriceLevel } from "@/server/customers";
import { listRecipesForTenant, previewRecipeCost } from "@/server/productionResources";
import { createProductionJobFromWebsiteOrderForTenant, ensureProductionTables } from "@/server/production";
import { createNotificationForTenant } from "@/server/notifications";
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
  cashSaleCustomerId: string | null;
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
  quoteRequired: boolean;
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

export type WebsiteCatalogImage = {
  id: string;
  url: string;
  alt: string;
  position: number;
  featured: boolean;
  conditions: Array<{ fieldKey: string; optionValue: string }>;
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
  images: WebsiteCatalogImage[];
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
  "id" | "name" | "customerFacingName" | "materialType" | "stockUom" | "purchaseUom" | "stockQuantity" |
  "purchaseCost" | "widthMm" | "lengthMm" | "rollWidthMm" | "minimumBillableSheetFraction" | "rollBillingIncrementMetres"
>;

export type WordPressPricingCustomerContext = {
  pmClientId?: string;
  websiteUserId?: string | number;
  company?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type PriceBody = {
  productId: string;
  widthMm?: number;
  heightMm?: number;
  quantity?: number;
  answers?: Record<string, unknown>;
  customer?: WordPressPricingCustomerContext;
};

export type WordPressPublicPricingTokenPayload = {
  version: 1;
  connectionId: string;
  productId: string;
  origin: string;
  expiresAt: number;
};

export type WordPressOrderPayload = {
  orderId?: string | number;
  orderNumber?: string | number;
  status?: string;
  currency?: string;
  total?: number | string;
  purchaseOrderNumber?: string;
  customer?: {
    customerId?: string | number;
    websiteUserId?: string | number;
    pmClientId?: string;
    accountTerms?: string;
    company?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  payment?: {
    method?: string;
    title?: string;
    accountTerms?: string;
  };
  fulfilment?: {
    type?: string;
    methodId?: string;
    label?: string;
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
    display?: Record<string, unknown>;
    configuration?: Record<string, unknown>;
    selectedImage?: Record<string, unknown>;
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

function friendlyDisplayText(value: unknown): string {
  return text(value)
    .replace(/\\u00d7/gi, "×")
    .replace(/\bu00d7\b/gi, "×")
    .replace(/(\d)\s*[x×]\s*(\d)/gi, "$1 × $2")
    .replace(/\s+/g, " ")
    .trim();
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function serialisedWebsiteImages(product: ProductRecord, config: Record<string, unknown>, productName: string): WebsiteCatalogImage[] {
  const configured = asArray(config.websiteImages).flatMap((rawImage, index): WebsiteCatalogImage[] => {
    const image = asObject(rawImage);
    const url = text(image.url);
    if (!/^https?:\/\//i.test(url)) return [];
    return [{
      id: text(image.id) || `website-image-${index + 1}`,
      url,
      alt: text(image.alt) || productName,
      position: index,
      featured: false,
      conditions: asArray(image.conditions).flatMap((rawCondition) => {
        const condition = asObject(rawCondition);
        const fieldKey = text(condition.fieldKey);
        const optionValue = text(condition.optionValue);
        return fieldKey && optionValue ? [{ fieldKey, optionValue }] : [];
      })
    }];
  });

  const images = configured.length
    ? configured
    : product.websiteImageUrl
      ? [{
          id: "legacy-featured-image",
          url: product.websiteImageUrl,
          alt: productName,
          position: 0,
          featured: false,
          conditions: []
        }]
      : [];

  const configuredFeaturedId = text(config.websiteFeaturedImageId);
  const featuredIndex = Math.max(0, images.findIndex((image) => image.id === configuredFeaturedId));
  return images.map((image, index) => ({ ...image, featured: index === featuredIndex }));
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
  const source = friendlyDisplayText(value);
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

function serialisedChoices(field: Record<string, unknown>, materialDisplayNames: Map<string, string> = new Map()): WebsiteBuilderChoice[] {
  const type = normalisedFieldType(field);
  const source = asArray(field.options);
  const rawChoices = type === "yes_no" && source.length === 0
    ? [{ id: null, label: "Yes", value: "yes", priceDelta: 0 }, { id: null, label: "No", value: "no", priceDelta: 0 }]
    : source;
  return rawChoices.map((rawChoice) => {
    const choice = asObject(rawChoice);
    const value = text(choice.value) || text(choice.label);
    return {
      id: text(choice.id) || null,
      label: materialDisplayNames.get(value) || friendlyDisplayText(choice.label) || friendlyDisplayText(choice.value) || "Option",
      value,
      priceDelta: numberValue(choice.priceDelta ?? choice.priceAdjustment),
      quoteRequired: choice.quoteRequired === true || text(choice.effectType) === "quote",
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
  const numericGreaterThanRaw = Number(raw.numericGreaterThan);
  const numericGreaterThan = Number.isFinite(numericGreaterThanRaw) ? numericGreaterThanRaw : null;

  // Older signage templates described the dependency in the help text but did
  // not always persist showWhen. Keep roll media choices out of the way unless
  // the customer has actually selected Roll print.
  if (!optionKey && /^roll_stock(?:_|$)/.test(key) && key !== "print_method") {
    optionKey = "print_method";
    optionValues = ["roll_stock"];
  }

  if (!optionKey) return null;
  return numericGreaterThan == null ? { optionKey, optionValues } : { optionKey, optionValues, numericGreaterThan };
}

function serializeFields(definition: Record<string, unknown>, websiteConfig: Record<string, unknown>, materialDisplayNames: Map<string, string> = new Map()): WebsiteBuilderField[] {
  const standardOrder = new Map(["finished_size", "base_material", "print_method", "print_orientation", "ink", "vinyl_backing", "laminate", "finishing", "eyelet_placement", "eyelet_custom_quantity", "holes_drilled", "hole_location", "standoffs", "artwork", "delivery_method"].map((key, index) => [key, index]));
  const entries: Array<{ sourceIndex: number; order: number; field: WebsiteBuilderField }> = [];

  asArray(definition.fields).forEach((rawField, sourceIndex) => {
    const field = asObject(rawField);
    const meta = asObject(field.meta);
    if (meta.websiteHidden === true || meta.websiteVisible === false) return;

    const key = text(field.key) || safeSlug(text(field.label));
    // WooCommerce owns order quantity. Never publish the old generated
    // quantity question as a second customer-facing control.
    if (key === "quantity") return;
    const type = normalisedFieldType(field);
    let options = serialisedChoices(field, materialDisplayNames);
    let label = text(field.label) || "Option";
    let helpText = text(field.helpText) || null;
    let defaultValue = field.defaultValue ?? null;

    if (key === "finished_size") {
      label = "Finished size";
      helpText = "Choose the finished size. Select Custom size to enter different dimensions.";
      if (!options.some((choice) => choice.value.toLowerCase() === "custom")) {
        options = [...options, { id: null, label: "Custom size", value: "custom", priceDelta: 0, quoteRequired: false, widthMm: null, heightMm: null }];
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
      // Pickup and delivery belong to WooCommerce cart/checkout. The only
      // product-level fulfilment decision is whether a site-specific install
      // quote is required. Keep the original key so existing recipe triggers
      // for the install answer continue to work.
      const installation = options.find((choice) =>
        /install/i.test(choice.value) || /install/i.test(choice.label)
      );
      if (!installation) return;
      const configuredDefault = selectedValues(defaultValue).some((value) => /install/i.test(value));
      options = [
        {
          id: null,
          label: "No installation",
          value: "no_install",
          priceDelta: 0,
          quoteRequired: false,
          widthMm: null,
          heightMm: null
        },
        {
          ...installation,
          label: "Installation required",
          value: "install",
          priceDelta: 0,
          quoteRequired: true
        }
      ];
      defaultValue = configuredDefault ? "install" : "no_install";
      label = "Installation required?";
      helpText = "Select Installation required only when this product needs a site-specific installation quote.";
    }

    const choiceDriven = ["select", "multi_select", "size_select", "color", "yes_no"].includes(type);
    if (choiceDriven && options.length === 0) return;

    const minimumValue = Number(meta.minimum);
    const stepValue = Number(meta.step);
    const serialisedField: WebsiteBuilderField = {
      id: text(field.id) || null,
      key,
      label,
      type,
      required: field.required !== false,
      defaultValue,
      helpText,
      display: key === "delivery_method" ? "buttons" : displayForField({ ...field, type }, websiteConfig),
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
  await ensureProductionTables();
  await pool.query(`ALTER TABLE catalog.materials ADD COLUMN IF NOT EXISTS customer_facing_name varchar(200)`);
  await pool.query(`ALTER TABLE sales.quote_drafts ADD COLUMN IF NOT EXISTS client_purchase_order_number varchar(120)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration.wordpress_connections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL UNIQUE REFERENCES app.tenants(id) ON DELETE CASCADE,
      site_url text,
      api_key text NOT NULL,
      cash_sale_customer_id uuid REFERENCES app.customers(id) ON DELETE SET NULL,
      status varchar(30) NOT NULL DEFAULT 'connected',
      last_catalog_pull_at timestamptz,
      last_order_received_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE integration.wordpress_connections ADD COLUMN IF NOT EXISTS cash_sale_customer_id uuid REFERENCES app.customers(id) ON DELETE SET NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS wordpress_connections_api_key_idx ON integration.wordpress_connections(api_key)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration.wordpress_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
      external_order_id varchar(160) NOT NULL,
      quote_id uuid REFERENCES sales.quote_drafts(id) ON DELETE SET NULL,
      production_job_id uuid REFERENCES production.production_jobs(id) ON DELETE SET NULL,
      order_status varchar(60),
      order_total numeric(14,2),
      payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      received_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, external_order_id)
    )
  `);
  await pool.query(`ALTER TABLE integration.wordpress_orders ADD COLUMN IF NOT EXISTS production_job_id uuid REFERENCES production.production_jobs(id) ON DELETE SET NULL`);
  wordPressBridgeSchemaReady = true;
}

export function createWordPressApiKey(): string {
  return `pm_${randomBytes(32).toString("hex")}`;
}

export async function getWordPressConnectionForTenant(tenantId: string): Promise<WordPressConnectionRecord | null> {
  await ensureWordPressBridgeSchema();
  const result = await pool.query<WordPressConnectionRecord>(`
    SELECT id::text,tenant_id::text AS "tenantId",site_url AS "siteUrl",api_key AS "apiKey",cash_sale_customer_id::text AS "cashSaleCustomerId",status,
      last_catalog_pull_at AS "lastCatalogPullAt",last_order_received_at AS "lastOrderReceivedAt",
      created_at AS "createdAt",updated_at AS "updatedAt"
    FROM integration.wordpress_connections WHERE tenant_id=$1::uuid LIMIT 1
  `, [tenantId]);
  return result.rows[0] ?? null;
}

export async function saveWordPressConnectionForTenant(tenantId: string, input: {
  siteUrl: string | null;
  apiKey?: string | null;
  cashSaleCustomerId?: string | null;
  status?: string;
}): Promise<WordPressConnectionRecord> {
  await ensureWordPressBridgeSchema();
  const apiKey = text(input.apiKey) || createWordPressApiKey();
  const result = await pool.query<WordPressConnectionRecord>(`
    INSERT INTO integration.wordpress_connections(tenant_id,site_url,api_key,cash_sale_customer_id,status,created_at,updated_at)
    VALUES($1::uuid,$2::text,$3::text,$4::uuid,$5::varchar,now(),now())
    ON CONFLICT(tenant_id) DO UPDATE SET site_url=EXCLUDED.site_url,api_key=EXCLUDED.api_key,cash_sale_customer_id=EXCLUDED.cash_sale_customer_id,status=EXCLUDED.status,updated_at=now()
    RETURNING id::text,tenant_id::text AS "tenantId",site_url AS "siteUrl",api_key AS "apiKey",cash_sale_customer_id::text AS "cashSaleCustomerId",status,
      last_catalog_pull_at AS "lastCatalogPullAt",last_order_received_at AS "lastOrderReceivedAt",
      created_at AS "createdAt",updated_at AS "updatedAt"
  `, [tenantId, input.siteUrl, apiKey, input.cashSaleCustomerId ?? null, input.status ?? "connected"]);
  return result.rows[0];
}

export async function resolveWordPressConnectionByApiKey(apiKey: string): Promise<WordPressConnectionRecord | null> {
  await ensureWordPressBridgeSchema();
  if (!apiKey) return null;
  const result = await pool.query<WordPressConnectionRecord>(`
    SELECT id::text,tenant_id::text AS "tenantId",site_url AS "siteUrl",api_key AS "apiKey",cash_sale_customer_id::text AS "cashSaleCustomerId",status,
      last_catalog_pull_at AS "lastCatalogPullAt",last_order_received_at AS "lastOrderReceivedAt",
      created_at AS "createdAt",updated_at AS "updatedAt"
    FROM integration.wordpress_connections WHERE api_key=$1::text AND status='connected' LIMIT 1
  `, [apiKey]);
  return result.rows[0] ?? null;
}

export async function resolveWordPressConnectionById(connectionId: string): Promise<WordPressConnectionRecord | null> {
  await ensureWordPressBridgeSchema();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(connectionId)) return null;
  const result = await pool.query<WordPressConnectionRecord>(`
    SELECT id::text,tenant_id::text AS "tenantId",site_url AS "siteUrl",api_key AS "apiKey",cash_sale_customer_id::text AS "cashSaleCustomerId",status,
      last_catalog_pull_at AS "lastCatalogPullAt",last_order_received_at AS "lastOrderReceivedAt",
      created_at AS "createdAt",updated_at AS "updatedAt"
    FROM integration.wordpress_connections WHERE id=$1::uuid AND status='connected' LIMIT 1
  `, [connectionId]);
  return result.rows[0] ?? null;
}

function normalisedOrigin(value: unknown): string {
  try {
    return new URL(text(value)).origin.toLowerCase();
  } catch {
    return "";
  }
}

export async function verifyWordPressPublicPricingToken(
  token: string,
  requestedProductId: string,
  requestOrigin: string
): Promise<{ connection: WordPressConnectionRecord; payload: WordPressPublicPricingTokenPayload } | null> {
  const [encodedPayload, encodedSignature, extra] = text(token).split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  let payload: WordPressPublicPricingTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as WordPressPublicPricingTokenPayload;
  } catch {
    return null;
  }

  if (payload.version !== 1 || !payload.connectionId || !payload.productId || !payload.origin) return null;
  if (payload.productId !== requestedProductId) return null;
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Math.floor(Date.now() / 1000)) return null;

  const expectedOrigin = normalisedOrigin(payload.origin);
  const suppliedOrigin = normalisedOrigin(requestOrigin);
  if (!expectedOrigin || (suppliedOrigin && suppliedOrigin !== expectedOrigin)) return null;

  const connection = await resolveWordPressConnectionById(payload.connectionId);
  if (!connection) return null;
  const expected = createHmac("sha256", connection.apiKey).update(encodedPayload).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(encodedSignature, "base64url"); } catch { return null; }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  return { connection, payload: { ...payload, origin: expectedOrigin } };
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
  const catalogueMaterials = await pricingMaterialsForDefinition(product.tenantId, definition).catch(() => [] as WebsitePricingMaterial[]);
  const materialDisplayNames = new Map(catalogueMaterials.map((material) => [material.id, text(material.customerFacingName) || material.name]));
  const fields = serializeFields(definition, config, materialDisplayNames);
  const websiteProductName = text(config.websiteProductName) || product.name;
  const images = serialisedWebsiteImages(product, config, websiteProductName);
  const featuredImageUrl = images.find((image) => image.featured)?.url ?? images[0]?.url ?? null;
  let startingPrice: number | null = null;
  const defaultPrice = await priceWordPressProductForTenant(product.tenantId, {
    productId: product.id,
    widthMm: defaults.widthMm,
    heightMm: defaults.heightMm,
    quantity: defaults.quantity,
    answers: defaultAnswersForFields(fields)
  }).catch(() => null);
  if (defaultPrice && !defaultPrice.quoteRequired && defaultPrice.validationErrors.length === 0) {
    startingPrice = defaultPrice.unitPrice;
  } else if (product.productionRecipeId) {
    const preview = await previewRecipeCost(product.tenantId, product.productionRecipeId, defaults.widthMm, defaults.heightMm, defaults.quantity).catch(() => null);
    startingPrice = preview?.sellPrice ?? null;
  } else if (config.basePrice != null) {
    startingPrice = numberValue(config.basePrice);
  }
  return {
    id: product.id,
    sku: product.sku,
    name: websiteProductName,
    slug: product.websiteSlug || safeSlug(websiteProductName),
    category: product.websiteCategory,
    status: product.status,
    mode: product.websiteMode === "live_checkout" ? "live_checkout" : "quote_only",
    shortDescription: product.websiteShortDescription,
    description: product.websiteDescription,
    imageUrl: featuredImageUrl,
    images,
    department: product.department,
    productFamily: product.productFamily,
    manufacturingMethod: product.productionRecipeId
      ? { id: product.productionRecipeId, name: product.productionRecipeName ?? "Manufacturing method" }
      : null,
    fields,
    defaults,
    startingPrice,
    syncVersion: Number(product.websiteSyncVersion || 1),
    updatedAt: String(product.updatedAt)
  };
}

export async function getWordPressCatalogForConnection(connection: WordPressConnectionRecord): Promise<{
  version: string;
  tenantId: string;
  connectionId: string;
  generatedAt: string;
  products: WebsiteCatalogProduct[];
}> {
  const products = await listPublishedWebsiteProductsForTenant(connection.tenantId);
  const serialised = await Promise.all(products.map(catalogueProduct));
  await pool.query(`UPDATE integration.wordpress_connections SET last_catalog_pull_at=now(),updated_at=now() WHERE id=$1::uuid`, [connection.id]);
  return {
    version: "V26.08.19.22",
    tenantId: connection.tenantId,
    connectionId: connection.id,
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
  const numericGreaterThanRaw = Number(showWhen.numericGreaterThan);
  if (Number.isFinite(numericGreaterThanRaw)) return numberValue(answers[optionKey]) > numericGreaterThanRaw;
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
  const primaryMatches = requiredValues.length
    ? requiredValues.some((value) => selected.map(normalizedConditionValue).includes(value))
    : selected.length > 0;
  if (!primaryMatches) return false;

  const alsoKey = text(stockUsage.alsoRequiresOptionKey);
  if (alsoKey) {
    const alsoSelected = selectedValues(answers[alsoKey]).map(normalizedConditionValue);
    const alsoRequired = asArray(stockUsage.alsoRequiresOptionValues).map(normalizedConditionValue).filter(Boolean);
    const alsoMatches = alsoRequired.length
      ? alsoRequired.some((value) => alsoSelected.includes(value))
      : alsoSelected.length > 0;
    if (!alsoMatches) return false;
  }

  for (const rawCondition of asArray(stockUsage.additionalConditions)) {
    const condition = asObject(rawCondition);
    const key = text(condition.optionKey);
    if (!key) continue;
    const current = selectedValues(answers[key]).map(normalizedConditionValue);
    const required = asArray(condition.optionValues).map(normalizedConditionValue).filter(Boolean);
    const matches = required.length ? required.some((value) => current.includes(value)) : current.length > 0;
    if (!matches) return false;
  }
  return true;
}

async function pricingMaterialsForDefinition(
  tenantId: string,
  definition: Record<string, unknown>
): Promise<WebsitePricingMaterial[]> {
  await ensureMaterialPricingColumns();
  const materialIds = Array.from(new Set(
    asArray(definition.components).flatMap((rawComponent) => {
      const component = asObject(rawComponent);
      const stockUsage = asObject(component.stockUsage);
      return [text(component.materialId), ...asArray(stockUsage.autoMaterialIds).map(text)].filter(Boolean);
    })
  ));
  if (!materialIds.length) return [];

  const result = await pool.query<WebsitePricingMaterial>(`
    SELECT
      id::text,
      name,
      customer_facing_name AS "customerFacingName",
      COALESCE(material_type::text, type::text) AS "materialType",
      stock_uom AS "stockUom",
      purchase_uom AS "purchaseUom",
      stock_quantity::text AS "stockQuantity",
      COALESCE((cost_json ->> 'purchaseCost')::numeric, purchase_cost, 0)::text AS "purchaseCost",
      width_mm::text AS "widthMm",
      length_mm::text AS "lengthMm",
      roll_width_mm::text AS "rollWidthMm",
      minimum_billable_sheet_fraction::text AS "minimumBillableSheetFraction",
      roll_billing_increment_metres::text AS "rollBillingIncrementMetres"
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

function websiteSheetPiecesPerParent(material: WebsitePricingMaterial, widthMm: number, heightMm: number): number {
  if (materialLooksLikeRoll(material)) return 0;
  const parentWidth = numberValue(material.widthMm);
  const parentHeight = numberValue(material.lengthMm);
  if (parentWidth <= 0 || parentHeight <= 0 || widthMm <= 0 || heightMm <= 0) return 0;
  const normal = Math.floor(parentWidth / widthMm) * Math.floor(parentHeight / heightMm);
  const rotated = Math.floor(parentWidth / heightMm) * Math.floor(parentHeight / widthMm);
  return Math.max(normal, rotated);
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
    if (purchaseUom.includes("roll") && stockQuantity > 0 && materialLooksLikeRoll(material)) {
      return purchaseCost / stockQuantity;
    }
    if (materialLooksLikeRoll(material) && stockQuantity > 0 && linearUnits.includes(stockUom)) {
      return purchaseCost / stockQuantity;
    }
    return purchaseCost;
  }
  if (basis === "sqm") {
    if (["sqm", "m2", "m²", "square metre", "square meter"].includes(purchaseUom)) return purchaseCost;
    if (purchaseUom.includes("sheet") && sheetArea > 0) return purchaseCost / sheetArea;
    if (linearUnits.includes(purchaseUom) && rollWidthM > 0) return purchaseCost / rollWidthM;
    if (purchaseUom.includes("roll") && rollWidthM > 0 && stockQuantity > 0 && materialLooksLikeRoll(material)) {
      return purchaseCost / (rollWidthM * stockQuantity);
    }
    return purchaseCost;
  }
  if (basis === "each") {
    const packagedPurchaseUnits = ["box", "pack", "bag", "carton", "bundle"];
    if (packagedPurchaseUnits.some((unit) => purchaseUom.includes(unit)) && stockQuantity > 0) {
      return purchaseCost / stockQuantity;
    }
  }
  return purchaseCost;
}

function optionQuantityMultiplier(component: Record<string, unknown>, answers: Record<string, unknown>): number | null {
  const stockUsage = asObject(component.stockUsage);
  if (text(stockUsage.quantitySource) !== "option_quantity") return null;
  const optionKey = text(stockUsage.quantityOptionKey);
  if (!optionKey) return 1;
  const selected = text(answers[optionKey]);
  const quantityValueMap = asObject(stockUsage.quantityValueMap);
  const mapped = Object.prototype.hasOwnProperty.call(quantityValueMap, selected) ? quantityValueMap[selected] : selected;
  if (text(mapped).toLowerCase() === "custom") {
    return Math.max(0, numberValue(answers[text(stockUsage.quantityCustomFieldKey)]));
  }
  return Math.max(0, numberValue(mapped));
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

type AutoMaterialSelection = {
  componentId: string | null;
  componentLabel: string;
  customerChoice: string;
  materialId: string;
  materialName: string;
  rollWidthMm: number | null;
  candidateCount: number;
};

function componentAutoMaterialIds(component: Record<string, unknown>): string[] {
  const stockUsage = asObject(component.stockUsage);
  return Array.from(new Set([
    text(component.materialId),
    ...asArray(stockUsage.autoMaterialIds).map(text)
  ].filter(Boolean)));
}

function websiteMaterialCostForComponent(
  component: Record<string, unknown>,
  material: WebsitePricingMaterial,
  widthMm: number,
  heightMm: number,
  quantity: number
): number {
  const stockUsage = asObject(component.stockUsage);
  const ruleType = text(component.ruleType) || text(stockUsage.usageBasis) || "yield_based";
  const wastePercent = Math.max(0, numberValue(component.wastePercent));
  const areaTotal = Math.max(0, widthMm) * Math.max(0, heightMm) * Math.max(1, quantity) / 1_000_000;
  const wasteMultiplier = 1 + wastePercent / 100;

  if (ruleType === "per_linear_metre" || (ruleType === "yield_based" && materialLooksLikeRoll(material))) {
    const autoIds = componentAutoMaterialIds(component);
    const rollWidthOverride = autoIds.length > 1 ? 0 : numberValue(stockUsage.rollWidthMm);
    return calculateProductionRecipeCost({
      finishedWidthMm: widthMm,
      finishedHeightMm: heightMm,
      quantity,
      material: {
        type: "roll",
        widthMm: numberValue(material.widthMm),
        heightMm: numberValue(material.lengthMm),
        rollWidthMm: rollWidthOverride > 0 ? rollWidthOverride : numberValue(material.rollWidthMm),
        unitCost: materialRate(material, "lm"),
        rollBillingIncrementMetres: material.rollBillingIncrementMetres == null ? null : numberValue(material.rollBillingIncrementMetres),
        allowRotation: true
      },
      machine: null,
      labour: [],
      wastePercent,
      markupMultiplier: 1,
      profitMultiplier: 1
    }).materialCost;
  }

  if (ruleType === "per_sqm") return areaTotal * materialRate(material, "sqm") * wasteMultiplier;
  if (["per_unit", "selected_by_option"].includes(ruleType)) return materialRate(material, "each") * Math.max(1, quantity) * wasteMultiplier;

  return calculateProductionRecipeCost({
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
      rollBillingIncrementMetres: material.rollBillingIncrementMetres == null ? null : numberValue(material.rollBillingIncrementMetres),
      allowRotation: true
    },
    machine: null,
    labour: [],
    wastePercent,
    markupMultiplier: 1,
    profitMultiplier: 1
  }).materialCost;
}

function resolveWebsiteMaterialForComponent(
  component: Record<string, unknown>,
  materialMap: Map<string, WebsitePricingMaterial>,
  widthMm: number,
  heightMm: number,
  quantity: number
): { material: WebsitePricingMaterial | null; selection: AutoMaterialSelection | null } {
  const candidateIds = componentAutoMaterialIds(component);
  const candidates = candidateIds.map((id) => materialMap.get(id)).filter((material): material is WebsitePricingMaterial => Boolean(material));
  if (!candidates.length) return { material: null, selection: null };
  if (candidates.length === 1) return { material: candidates[0], selection: null };

  const compatible = candidates.filter((material) => {
    if (materialLooksLikeRoll(material)) {
      const rollWidth = numberValue(material.rollWidthMm);
      if (rollWidth <= 0) return true;
      return widthMm <= rollWidth || heightMm <= rollWidth;
    }
    // Sheet candidates stay valid when the finished item is larger than one
    // parent sheet because the costing path can panelise across multiple sheets.
    // Materials without saved dimensions retain the legacy fallback behaviour.
    return true;
  });
  const candidatePool = compatible.length ? compatible : candidates;
  const selected = [...candidatePool].sort((left, right) => {
    const costDifference = websiteMaterialCostForComponent(component, left, widthMm, heightMm, quantity)
      - websiteMaterialCostForComponent(component, right, widthMm, heightMm, quantity);
    if (Math.abs(costDifference) > 0.000001) return costDifference;
    const rollWidthDifference = numberValue(left.rollWidthMm) - numberValue(right.rollWidthMm);
    if (Math.abs(rollWidthDifference) > 0.000001) return rollWidthDifference;
    const leftSheetArea = numberValue(left.widthMm) * numberValue(left.lengthMm);
    const rightSheetArea = numberValue(right.widthMm) * numberValue(right.lengthMm);
    return leftSheetArea - rightSheetArea;
  })[0] ?? candidates[0];
  const stockUsage = asObject(component.stockUsage);
  const customerChoice = text(stockUsage.autoMaterialLabel) || text(component.label) || text(selected.customerFacingName) || selected.name;
  return {
    material: selected,
    selection: {
      componentId: text(component.id) || null,
      componentLabel: text(component.label) || customerChoice,
      customerChoice,
      materialId: selected.id,
      materialName: selected.name,
      rollWidthMm: numberValue(selected.rollWidthMm) > 0 ? numberValue(selected.rollWidthMm) : null,
      candidateCount: candidates.length
    }
  };
}

function optionalComponentCostTotal(
  definition: Record<string, unknown>,
  materials: WebsitePricingMaterial[],
  answers: Record<string, unknown>,
  widthMm: number,
  heightMm: number,
  quantity: number,
  selectionSink?: AutoMaterialSelection[],
  inkBillingIncrementSqm = 0.5
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
    const answerMultiplier = optionQuantityMultiplier(component, answers) ?? followUpMultiplier(component, answers);

    if (ruleType === "choice_only") continue;
    if (ruleType === "sell_sqm") {
      const rate = Math.max(0, numberValue(stockUsage.sellRate, numberValue(component.quantity)));
      const looksLikeInk = /\bink\b/i.test(`${text(component.label)} ${text(component.notes)} ${text(stockUsage.chargeName)}`);
      const increment = looksLikeInk ? Math.max(0, inkBillingIncrementSqm) : 0;
      const billableArea = increment > 0 && areaTotal > 0
        ? Math.ceil((areaTotal - 0.0000001) / increment) * increment
        : areaTotal;
      total += billableArea * rate * answerMultiplier;
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

    const resolvedMaterial = resolveWebsiteMaterialForComponent(component, materialMap, widthMm, heightMm, quantity);
    const material = resolvedMaterial.material;
    if (!material) continue;
    if (resolvedMaterial.selection && selectionSink && !selectionSink.some((item) => item.componentId === resolvedMaterial.selection?.componentId && item.materialId === resolvedMaterial.selection?.materialId)) {
      selectionSink.push(resolvedMaterial.selection);
    }

    if (ruleType === "per_linear_metre" || (ruleType === "yield_based" && materialLooksLikeRoll(material))) {
      const cost = calculateProductionRecipeCost({
        finishedWidthMm: widthMm,
        finishedHeightMm: heightMm,
        quantity,
        material: {
          type: "roll",
          widthMm: numberValue(material.widthMm),
          heightMm: numberValue(material.lengthMm),
          rollWidthMm: componentAutoMaterialIds(component).length > 1 ? numberValue(material.rollWidthMm) : numberValue(stockUsage.rollWidthMm, numberValue(material.rollWidthMm)),
          unitCost: materialRate(material, "lm"),
          rollBillingIncrementMetres: material.rollBillingIncrementMetres == null ? null : numberValue(material.rollBillingIncrementMetres),
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


type WebsitePricingContext = {
  customerId: string | null;
  customerName: string | null;
  priceLevelCode: MyobPriceLevel;
  priceLevelName: string;
  priceLevelFactor: number;
  source: "public_level_a" | "pm_client";
};

type WebsiteMyobPricingData = {
  myobUid: string | null;
  myobPriceMatrix: Record<string, unknown> | null;
};

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolvePricingCustomerForTenant(
  tenantId: string,
  context: WordPressPricingCustomerContext | null | undefined
): Promise<CustomerRecord | null> {
  if (!context) return null;
  const pmClientId = text(context.pmClientId);
  if (validUuid(pmClientId)) {
    const linked = await getCustomerById(tenantId, pmClientId).catch(() => null);
    if (linked?.isActive && !linked.payloadJson?.deletedAt) return linked;
  }

  const email = text(context.email).toLowerCase();
  const company = text(context.company).toLowerCase();
  if (!email && !company) return null;
  const result = await pool.query<Omit<CustomerRecord, "payloadJson"> & { payloadJson: unknown }>(`
    SELECT
      id::text,
      tenant_id::text AS "tenantId",
      myob_uid AS "myobUid",
      display_name AS "displayName",
      company_name AS "companyName",
      first_name AS "firstName",
      last_name AS "lastName",
      email,
      phone,
      is_active AS "isActive",
      payload_json AS "payloadJson",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM app.customers
    WHERE tenant_id=$1::uuid
      AND is_active=true
      AND COALESCE(payload_json->>'deletedAt','')=''
      AND (($2::text<>'' AND lower(COALESCE(email,''))=$2::text)
        OR ($3::text<>'' AND lower(COALESCE(company_name,display_name,''))=$3::text))
    ORDER BY CASE WHEN lower(COALESCE(email,''))=$2::text THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(myob_uid,'')<>'' THEN 0 ELSE 1 END
    LIMIT 1
  `, [tenantId, email, company]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    payloadJson: row.payloadJson && typeof row.payloadJson === "object" && !Array.isArray(row.payloadJson)
      ? row.payloadJson as CustomerRecord["payloadJson"]
      : {}
  };
}

async function websiteMyobPricingData(tenantId: string, productId: string): Promise<WebsiteMyobPricingData> {
  const result = await pool.query<{ myobUid: string | null; payloadJson: unknown }>(`
    SELECT myob_uid AS "myobUid", payload_json AS "payloadJson"
    FROM catalog.products
    WHERE tenant_id=$1::uuid AND id=$2::uuid
    LIMIT 1
  `, [tenantId, productId]);
  const row = result.rows[0];
  const payload = row?.payloadJson && typeof row.payloadJson === "object" && !Array.isArray(row.payloadJson)
    ? row.payloadJson as Record<string, unknown>
    : {};
  const matrix = payload.myobPriceMatrix;
  return {
    myobUid: row?.myobUid ?? null,
    myobPriceMatrix: matrix && typeof matrix === "object" && !Array.isArray(matrix)
      ? matrix as Record<string, unknown>
      : null
  };
}

function myobWebsiteMatrixPrice(
  matrix: Record<string, unknown> | null,
  priceLevelCode: MyobPriceLevel,
  quantity: number
): { unitPrice: number; quantityOver: number; levelKey: string } | null {
  if (!matrix) return null;
  const levelMatch = priceLevelCode.match(/^Level\s+([A-F])$/i);
  const levelKey = `Level${(levelMatch?.[1] ?? "A").toUpperCase()}`;
  const sellingPrices = Array.isArray(matrix.SellingPrices) ? matrix.SellingPrices : [];
  const eligible = sellingPrices
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
    .map((row) => ({ row, quantityOver: Math.max(0, numberValue(row.QuantityOver, 0)) }))
    .filter(({ quantityOver }) => quantityOver === 0 || Math.max(0, quantity) > quantityOver)
    .sort((a, b) => b.quantityOver - a.quantityOver);
  for (const candidate of eligible) {
    const levels = candidate.row.Levels;
    if (!levels || typeof levels !== "object" || Array.isArray(levels)) continue;
    const parsed = Number((levels as Record<string, unknown>)[levelKey]);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return { unitPrice: parsed, quantityOver: candidate.quantityOver, levelKey };
    }
  }
  return null;
}

function websitePricingContext(
  customer: CustomerRecord | null,
  companySettings: Awaited<ReturnType<typeof getCompanySettingsByTenantId>>
): WebsitePricingContext {
  const priceLevelCode = customerMyobPriceLevel(customer) ?? "Level A";
  const rawFactor = Number(companySettings?.myobPriceLevelFactors?.[priceLevelCode] ?? 1);
  const priceLevelFactor = Number.isFinite(rawFactor) && rawFactor >= 0 ? rawFactor : 1;
  return {
    customerId: customer?.id ?? null,
    customerName: customer?.displayName ?? null,
    priceLevelCode,
    priceLevelName: customer ? (customerMyobPriceLevelName(customer) || priceLevelCode) : priceLevelCode,
    priceLevelFactor,
    source: customer ? "pm_client" : "public_level_a"
  };
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
  const components = asArray(definition.components);
  const materials = components.length ? await pricingMaterialsForDefinition(tenantId, definition).catch(() => [] as WebsitePricingMaterial[]) : [];
  const materialDisplayNames = new Map(materials.map((material) => [material.id, text(material.customerFacingName) || material.name]));
  const fields = serializeFields(definition, websiteConfig, materialDisplayNames);
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
    if (field.key === "quantity") {
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
      if (choice.quoteRequired) quoteTriggered = true;
      if (choice.widthMm && choice.heightMm) {
        widthMm = choice.widthMm;
        heightMm = choice.heightMm;
      } else if (field.type === "size_select" || field.key.toLowerCase().includes("size")) {
        const parsed = parseSize(choice.label) ?? parseSize(choice.value);
        if (parsed) ({ widthMm, heightMm } = parsed);
      }
      const rawField = asArray(definition.fields).map(asObject).find((item) => text(item.key) === field.key);
      const rule = asObject(rawField?.rule);
      if (text(rule.effectType) === "quote" && (field.key !== "delivery_method" || selected === "install")) {
        quoteTriggered = true;
      }
    }
  }

  const [recipe, recipes, companySettings, pricingCustomer, myobPricingData] = await Promise.all([
    product.productionRecipeId
      ? previewRecipeCost(tenantId, product.productionRecipeId, widthMm, heightMm, quantity).catch(() => null)
      : Promise.resolve(null),
    product.productionRecipeId ? listRecipesForTenant(tenantId).catch(() => []) : Promise.resolve([]),
    getCompanySettingsByTenantId(tenantId).catch(() => null),
    resolvePricingCustomerForTenant(tenantId, body.customer).catch(() => null),
    websiteMyobPricingData(tenantId, product.id).catch(() => ({ myobUid: product.myobUid ?? null, myobPriceMatrix: null }))
  ]);
  const recipeSettings = recipes.find((item) => item.id === product.productionRecipeId);
  const markupMultiplier = Math.max(0, numberValue(recipeSettings?.markupMultiplier, numberValue(websiteConfig.markupMultiplier, 1.5)));
  const profitMultiplier = Math.max(0, numberValue(recipeSettings?.profitMultiplier, numberValue(websiteConfig.profitMultiplier, 1.2)));
  const autoMaterialSelections: AutoMaterialSelection[] = [];
  const inkBillingIncrementSqm = Math.max(0, numberValue(companySettings?.quoteInkBillingIncrementSqm, 0.5));
  const optionalCost = optionalComponentCostTotal(definition, materials, answers, widthMm, heightMm, quantity, autoMaterialSelections, inkBillingIncrementSqm);
  const defaultOptionalCost = optionalComponentCostTotal(
    definition,
    materials,
    defaultAnswersForFields(fields),
    widthMm,
    heightMm,
    quantity,
    undefined,
    inkBillingIncrementSqm
  );
  // The recipe preview is the saved/default configuration. Add only the
  // difference created by the customer's current option answers so default ink
  // or media is not counted twice.
  const optionalCostDelta = optionalCost - defaultOptionalCost;
  const optionalSell = optionalCostDelta * markupMultiplier * profitMultiplier;
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  let baseAutoCostDelta = 0;
  for (const rawComponent of components) {
    const component = asObject(rawComponent);
    if (text(component.role) !== "base_material" || componentAutoMaterialIds(component).length < 2) continue;
    const resolved = resolveWebsiteMaterialForComponent(component, materialMap, widthMm, heightMm, quantity);
    const representative = materialMap.get(text(component.materialId));
    if (!resolved.material || !representative) continue;
    baseAutoCostDelta += websiteMaterialCostForComponent(component, resolved.material, widthMm, heightMm, quantity)
      - websiteMaterialCostForComponent(component, representative, widthMm, heightMm, quantity);
    if (resolved.selection && !autoMaterialSelections.some((item) => item.componentId === resolved.selection?.componentId && item.materialId === resolved.selection?.materialId)) {
      autoMaterialSelections.push(resolved.selection);
    }
  }
  const baseAutoSellDelta = baseAutoCostDelta * markupMultiplier * profitMultiplier;
  const baseSell = (recipe?.sellPrice ?? numberValue(websiteConfig.basePrice)) + baseAutoSellDelta;
  const pricingContext = websitePricingContext(pricingCustomer, companySettings);
  const myobMatrix = myobPricingData.myobUid
    ? myobWebsiteMatrixPrice(myobPricingData.myobPriceMatrix, pricingContext.priceLevelCode, quantity)
    : null;
  const pmCalculatedLineTotal = Math.max(0, baseSell + optionalSell + optionDelta);
  const lineTotal = Math.max(0, Math.round((myobMatrix
    ? myobMatrix.unitPrice * quantity
    : pmCalculatedLineTotal * pricingContext.priceLevelFactor) * 100) / 100);
  const pricingSource = myobMatrix ? "myob_item_matrix" : "pm_calculated";
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
    pricing: {
      source: pricingSource,
      customerId: pricingContext.customerId,
      customerName: pricingContext.customerName,
      priceLevelCode: pricingContext.priceLevelCode,
      priceLevelName: pricingContext.priceLevelName,
      priceLevelFactor: pricingContext.priceLevelFactor,
      myobItemUid: myobPricingData.myobUid,
      myobMatrixQuantityOver: myobMatrix?.quantityOver ?? null,
      myobMatrixLevelKey: myobMatrix?.levelKey ?? null
    },
    cost: recipe ? {
      material: recipe.materialCost,
      machines: recipe.machineCost,
      ink: recipe.inkCost,
      labour: recipe.labourCost,
      total: Math.round((recipe.totalCost + optionalCostDelta) * 100) / 100
    } : null,
    materialUsage: recipe?.materialUsage ?? null,
    manufacturingMethodId: product.productionRecipeId,
    autoMaterialSelections,
    answers,
    displayAnswers: displayAnswersForFields(fields, answers)
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

function displayAnswersForFields(fields: WebsiteBuilderField[], answers: Record<string, unknown>): Record<string, unknown> {
  const display: Record<string, unknown> = {};
  for (const field of fields) {
    const values = selectedValues(answers[field.key]);
    if (!values.length) continue;
    const labels = values.map((value) => {
      const choice = field.options.find((option) => option.value === value || option.id === value);
      return friendlyDisplayText(choice?.label || value);
    }).filter(Boolean);
    if (labels.length) display[field.label] = labels.length === 1 ? labels[0] : labels;
  }
  return display;
}

type ResolvedWebsiteCustomer = { id: string | null; displayName: string; match: string };

async function resolveWebsiteCustomer(connection: WordPressConnectionRecord, customer: WordPressOrderPayload["customer"]): Promise<ResolvedWebsiteCustomer> {
  const pmClientId = text(customer?.pmClientId);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pmClientId)) {
    const linked = await pool.query<{ id: string; displayName: string }>(`
      SELECT id::text,display_name AS "displayName"
      FROM app.customers
      WHERE tenant_id=$1::uuid AND id=$2::uuid AND is_active=true
        AND COALESCE(payload_json->>'deletedAt','')=''
      LIMIT 1
    `, [connection.tenantId, pmClientId]);
    if (linked.rows[0]) return { ...linked.rows[0], match: "wordpress_client_link" };
  }

  const email = text(customer?.email).toLowerCase();
  const company = text(customer?.company).toLowerCase();
  if (email || company) {
    const matched = await pool.query<{ id: string; displayName: string; match: string }>(`
      SELECT id::text,display_name AS "displayName",
        CASE WHEN lower(COALESCE(email,''))=$2::text THEN 'email' ELSE 'company' END AS match
      FROM app.customers
      WHERE tenant_id=$1::uuid
        AND is_active=true
        AND COALESCE(payload_json->>'deletedAt','')=''
        AND (($2::text<>'' AND lower(COALESCE(email,''))=$2::text)
          OR ($3::text<>'' AND lower(COALESCE(company_name,display_name,''))=$3::text))
      ORDER BY CASE WHEN lower(COALESCE(email,''))=$2::text THEN 0 ELSE 1 END,
        CASE WHEN COALESCE(myob_uid,'')<>'' THEN 0 ELSE 1 END
      LIMIT 1
    `, [connection.tenantId, email, company]);
    if (matched.rows[0]) return matched.rows[0];
  }

  const fallback = await pool.query<{ id: string; displayName: string }>(`
    SELECT id::text,display_name AS "displayName"
    FROM app.customers
    WHERE tenant_id=$1::uuid AND is_active=true AND COALESCE(payload_json->>'deletedAt','')=''
      AND (id=$2::uuid OR lower(display_name)='cash sale' OR lower(COALESCE(company_name,''))='cash sale')
    ORDER BY CASE WHEN id=$2::uuid THEN 0 ELSE 1 END,
      CASE WHEN COALESCE(myob_uid,'')<>'' THEN 0 ELSE 1 END
    LIMIT 1
  `, [connection.tenantId, connection.cashSaleCustomerId]);
  return fallback.rows[0]
    ? { ...fallback.rows[0], match: connection.cashSaleCustomerId ? "configured_cash_sale" : "automatic_cash_sale" }
    : { id: null, displayName: "Cash Sale", match: "cash_sale_not_configured" };
}

function websitePaymentSnapshot(payload: WordPressOrderPayload): Record<string, unknown> {
  const payment = payload.payment ?? {};
  return {
    method: text(payment.method),
    title: text(payment.title),
    accountTerms: text(payment.accountTerms)
  };
}

function websiteFulfilmentSnapshot(payload: WordPressOrderPayload): { type: "pickup" | "delivery" | "install"; methodId: string; label: string; address: string } {
  const fulfilment = payload.fulfilment ?? {};
  const rawType = text(fulfilment.type).toLowerCase();
  const type = rawType === "delivery" || rawType === "install" ? rawType : "pickup";
  return {
    type,
    methodId: text(fulfilment.methodId),
    label: text(fulfilment.label),
    address: type === "delivery" ? text(fulfilment.address) : ""
  };
}

async function refreshExistingWebsiteQuoteLines(
  connection: WordPressConnectionRecord,
  quoteId: string,
  externalOrderId: string,
  payload: WordPressOrderPayload
): Promise<void> {
  const existingLines = await pool.query<{ id: string }>(`
    SELECT id::text FROM sales.quote_lines
    WHERE quote_id=$1::uuid
    ORDER BY created_at ASC,id ASC
  `, [quoteId]);
  const incomingLines = (payload.lines ?? []).filter((line) => text(line.productId));
  const lineCount = Math.min(existingLines.rows.length, incomingLines.length);

  for (let index = 0; index < lineCount; index += 1) {
    const line = incomingLines[index];
    const productId = text(line.productId);
    const answers = asObject(line.answers ?? asObject(line.configuration).answers);
    const calculated = await priceWordPressProductForTenant(connection.tenantId, {
      productId,
      widthMm: line.widthMm,
      heightMm: line.heightMm,
      quantity: numberValue(line.quantity, 1),
      answers,
      customer: payload.customer
    });
    if (!calculated) continue;
    const quantity = Math.max(1, calculated.quantity);
    const lineTotal = line.lineTotal == null
      ? calculated.lineTotal
      : Math.max(0, numberValue(line.lineTotal, calculated.lineTotal));
    const displayAnswers = Object.keys(calculated.displayAnswers).length
      ? calculated.displayAnswers
      : asObject(line.display);
    const selectedImage = asObject(line.selectedImage ?? asObject(line.configuration).selectedImage);
    const snapshot = {
      source: "wordpress_woocommerce",
      externalOrderId,
      websiteStatus: payload.status ?? null,
      widthMm: calculated.widthMm,
      heightMm: calculated.heightMm,
      quantity,
      answers,
      displayAnswers,
      payment: websitePaymentSnapshot(payload),
      fulfilment: websiteFulfilmentSnapshot(payload),
      purchaseOrderNumber: text(payload.purchaseOrderNumber) || null,
      selectedImage,
      productionCost: calculated.cost,
      websitePricing: calculated.pricing,
      calculatedWebsiteLineTotal: calculated.lineTotal,
      chargedWebsiteLineTotal: lineTotal,
      materialUsage: calculated.materialUsage,
      autoMaterialSelections: calculated.autoMaterialSelections,
      manufacturingMethodId: calculated.manufacturingMethodId,
      rawConfiguration: line.configuration ?? {}
    };
    await pool.query(`
      UPDATE sales.quote_lines
      SET product_id=$3::uuid,
          product_name=$4::varchar,
          option_summary=$5::text,
          quantity=$6::numeric,
          unit_price=$7::numeric,
          line_total=$8::numeric,
          configuration_snapshot=$9::jsonb,
          updated_at=now()
      WHERE quote_id=$1::uuid AND id=$2::uuid
    `, [
      quoteId,
      existingLines.rows[index].id,
      productId,
      calculated.productName || text(line.productName) || "Website product",
      answerSummary(displayAnswers),
      quantity,
      Math.round((lineTotal / quantity) * 100) / 100,
      lineTotal,
      JSON.stringify(snapshot)
    ]);
  }
}

export async function ingestWordPressOrder(connection: WordPressConnectionRecord, payload: WordPressOrderPayload) {
  await ensureWordPressBridgeSchema();
  const externalOrderId = text(payload.orderId || payload.orderNumber);
  if (!externalOrderId) throw new Error("WooCommerce order ID is required");

  const existing = await pool.query<{ quoteId: string | null; productionJobId: string | null }>(`
    SELECT quote_id::text AS "quoteId",production_job_id::text AS "productionJobId" FROM integration.wordpress_orders
    WHERE tenant_id=$1::uuid AND external_order_id=$2::varchar LIMIT 1
  `, [connection.tenantId, externalOrderId]);
  if (!existing.rows[0]) {
    const orphaned = await pool.query<{ quoteId: string; productionJobId: string | null }>(`
      SELECT qd.id::text AS "quoteId",
        (SELECT pj.id::text FROM production.production_jobs pj
          WHERE pj.tenant_id=qd.tenant_id
            AND pj.source_type='wordpress_woocommerce'
            AND pj.external_order_id=$2::varchar
          ORDER BY pj.created_at DESC LIMIT 1) AS "productionJobId"
      FROM sales.quote_drafts qd
      WHERE qd.tenant_id=$1::uuid
        AND EXISTS (
          SELECT 1 FROM sales.quote_lines ql
          WHERE ql.quote_id=qd.id
            AND ql.configuration_snapshot->>'externalOrderId'=$2::varchar
        )
      ORDER BY qd.created_at DESC
      LIMIT 1
    `, [connection.tenantId, externalOrderId]);
    if (orphaned.rows[0]) existing.rows.push(orphaned.rows[0]);
  }
  const paidStatuses = new Set(["processing", "completed", "on-hold"]);
  const quoteStatus = paidStatuses.has(text(payload.status)) ? "accepted" : "draft";
  if (existing.rows[0]) {
    const quoteId = existing.rows[0].quoteId;
    let productionJobId = existing.rows[0].productionJobId;
    const customer = payload.customer ?? {};
    const resolved = await resolveWebsiteCustomer(connection, customer);
    const fulfilment = websiteFulfilmentSnapshot(payload);
    const purchaseOrderNumber = text(payload.purchaseOrderNumber) || null;
    if (quoteId) {
      await refreshExistingWebsiteQuoteLines(connection, quoteId, externalOrderId, payload);
      await pool.query(`
        UPDATE sales.quote_drafts
        SET linked_customer_id=$3::uuid,client_name=$4::varchar,
          contact_name=$5::varchar,email=$6::varchar,phone=$7::varchar,
          client_purchase_order_number=$8::varchar,updated_at=now()
        WHERE tenant_id=$1::uuid AND id=$2::uuid
      `, [
        connection.tenantId,
        quoteId,
        resolved.id,
        resolved.displayName,
        [text(customer.firstName), text(customer.lastName)].filter(Boolean).join(" ") || null,
        text(customer.email) || null,
        text(customer.phone) || null,
        purchaseOrderNumber
      ]);
      if (productionJobId) {
        await pool.query(`
          UPDATE production.production_jobs
          SET linked_customer_id=$3::uuid,client_name=$4::varchar,contact_name=$5::varchar,
            dispatch_type=$6::varchar,
            internal_notes=concat_ws(E'\n',
              NULLIF(btrim(regexp_replace(COALESCE(internal_notes,''), E'(^|\\n)Delivery address:[^\\n]*', '', 'g')), ''),
              CASE WHEN $6::text='delivery' AND NULLIF($7::text,'') IS NOT NULL THEN 'Delivery address: ' || $7::text ELSE NULL END),
            payload_json=COALESCE(payload_json,'{}'::jsonb) || $8::jsonb,updated_at=now()
          WHERE tenant_id=$1::uuid AND id=$2::uuid
        `, [
          connection.tenantId,
          productionJobId,
          resolved.id,
          resolved.displayName,
          [text(customer.firstName), text(customer.lastName)].filter(Boolean).join(" ") || null,
          fulfilment.type,
          fulfilment.address || null,
          JSON.stringify({ customer, customerMatch: resolved.match, websiteStatus: payload.status ?? null, payment: websitePaymentSnapshot(payload), fulfilment, purchaseOrderNumber })
        ]);
      }
      await setQuoteDraftStatusForTenant(connection.tenantId, quoteId, quoteStatus);
      if (quoteStatus === "accepted") {
        await updateQuoteMyobOrderSyncForTenant(connection.tenantId, quoteId, {
          status: "ready_to_sync",
          payloadJson: { source: "wordpress", externalOrderId, websiteStatus: payload.status ?? null }
        });
        if (!productionJobId) {
          const job = await createProductionJobFromWebsiteOrderForTenant(connection.tenantId, {
            quoteId,
            externalOrderId,
            orderNumber: text(payload.orderNumber) || externalOrderId,
            linkedCustomerId: resolved.id,
            clientName: resolved.displayName,
            contactName: [text(customer.firstName), text(customer.lastName)].filter(Boolean).join(" ") || null,
            dispatchType: fulfilment.type,
            address: fulfilment.address || null,
            payloadJson: { customer, customerMatch: resolved.match, websiteStatus: payload.status ?? null, payment: websitePaymentSnapshot(payload), fulfilment, purchaseOrderNumber }
          });
          productionJobId = job.id;
          await createNotificationForTenant(connection.tenantId, {
            eventType: "new_job", title: `New website job #${text(payload.orderNumber) || externalOrderId}`,
            message: `${resolved.displayName} · ${job.artworkFileCount} artwork file${job.artworkFileCount === 1 ? "" : "s"}`,
            href: `/production/${job.id}`, payloadJson: { jobId: job.id, externalOrderId }
          });
        }
      }
    }
    await pool.query(`
      INSERT INTO integration.wordpress_orders(
        tenant_id,external_order_id,quote_id,production_job_id,order_status,order_total,payload_json,received_at,updated_at
      ) VALUES($1::uuid,$2::varchar,$3::uuid,$4::uuid,$5::varchar,$6::numeric,$7::jsonb,now(),now())
      ON CONFLICT(tenant_id,external_order_id) DO UPDATE SET
        quote_id=EXCLUDED.quote_id,
        production_job_id=COALESCE(EXCLUDED.production_job_id,integration.wordpress_orders.production_job_id),
        order_status=EXCLUDED.order_status,
        order_total=EXCLUDED.order_total,
        payload_json=EXCLUDED.payload_json,
        updated_at=now()
    `, [connection.tenantId, externalOrderId, quoteId, productionJobId, text(payload.status) || null, numberValue(payload.total), JSON.stringify(payload)]);
    await pool.query(`UPDATE integration.wordpress_connections SET last_order_received_at=now(),updated_at=now() WHERE id=$1::uuid`, [connection.id]);
    return { created: false, updated: true, quoteId, productionJobId, status: quoteStatus };
  }

  const customer = payload.customer ?? {};
  const resolvedCustomer = await resolveWebsiteCustomer(connection, customer);
  const fulfilment = websiteFulfilmentSnapshot(payload);
  const purchaseOrderNumber = text(payload.purchaseOrderNumber) || null;
  const quote = await createQuoteDraftForTenant(connection.tenantId, {
    linkedCustomerId: resolvedCustomer.id,
    clientPurchaseOrderNumber: purchaseOrderNumber,
    clientName: resolvedCustomer.displayName,
    contactName: [text(customer.firstName), text(customer.lastName)].filter(Boolean).join(" ") || null,
    email: text(customer.email) || null,
    phone: text(customer.phone) || null,
    notes: `WooCommerce order ${text(payload.orderNumber) || externalOrderId} · ${text(payload.status) || "received"}\nWebsite buyer: ${orderCustomerName(customer)}\nCustomer match: ${resolvedCustomer.match}\nFulfilment: ${fulfilment.label || fulfilment.type}${purchaseOrderNumber ? `\nClient PO: ${purchaseOrderNumber}` : ""}${text(customer.address) ? `\nBilling address: ${text(customer.address)}` : ""}`
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
      answers,
      customer: payload.customer
    });
    if (!calculated) continue;
    const quantity = Math.max(1, calculated.quantity);
    const lineTotal = line.lineTotal == null
      ? calculated.lineTotal
      : Math.max(0, numberValue(line.lineTotal, calculated.lineTotal));
    const selectedImage = asObject(line.selectedImage ?? asObject(line.configuration).selectedImage);
    await addQuoteLine(quote.id, {
      productId,
      productName: calculated.productName || text(line.productName) || "Website product",
      optionSummary: answerSummary(Object.keys(calculated.displayAnswers).length ? calculated.displayAnswers : answers),
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
        displayAnswers: calculated.displayAnswers,
        payment: websitePaymentSnapshot(payload),
        fulfilment,
        purchaseOrderNumber,
        selectedImage,
        productionCost: calculated.cost,
        websitePricing: calculated.pricing,
        calculatedWebsiteLineTotal: calculated.lineTotal,
        chargedWebsiteLineTotal: lineTotal,
        materialUsage: calculated.materialUsage,
        autoMaterialSelections: calculated.autoMaterialSelections,
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
    INSERT INTO integration.wordpress_orders(
      tenant_id,external_order_id,quote_id,production_job_id,order_status,order_total,payload_json,received_at,updated_at
    ) VALUES($1::uuid,$2::varchar,$3::uuid,NULL,$4::varchar,$5::numeric,$6::jsonb,now(),now())
    ON CONFLICT(tenant_id,external_order_id) DO UPDATE SET
      quote_id=EXCLUDED.quote_id,
      order_status=EXCLUDED.order_status,
      order_total=EXCLUDED.order_total,
      payload_json=EXCLUDED.payload_json,
      updated_at=now()
  `, [connection.tenantId, externalOrderId, quote.id, text(payload.status) || null, numberValue(payload.total), JSON.stringify(payload)]);

  let productionJobId: string | null = null;
  if (quoteStatus === "accepted") {
    const job = await createProductionJobFromWebsiteOrderForTenant(connection.tenantId, {
      quoteId: quote.id,
      externalOrderId,
      orderNumber: text(payload.orderNumber) || externalOrderId,
      linkedCustomerId: resolvedCustomer.id,
      clientName: resolvedCustomer.displayName,
      contactName: [text(customer.firstName), text(customer.lastName)].filter(Boolean).join(" ") || null,
      dispatchType: fulfilment.type,
      address: fulfilment.address || null,
      payloadJson: { customer, customerMatch: resolvedCustomer.match, websiteStatus: payload.status ?? null, payment: websitePaymentSnapshot(payload), fulfilment, purchaseOrderNumber }
    });
    productionJobId = job.id;
    await createNotificationForTenant(connection.tenantId, {
      eventType: "new_job",
      title: `New website job #${text(payload.orderNumber) || externalOrderId}`,
      message: `${resolvedCustomer.displayName} · ${job.artworkFileCount} artwork file${job.artworkFileCount === 1 ? "" : "s"}`,
      href: `/production/${job.id}`,
      payloadJson: { jobId: job.id, externalOrderId }
    });
  }

  await pool.query(`
    INSERT INTO integration.wordpress_orders(tenant_id,external_order_id,quote_id,production_job_id,order_status,order_total,payload_json,received_at,updated_at)
    VALUES($1::uuid,$2::varchar,$3::uuid,$4::uuid,$5::varchar,$6::numeric,$7::jsonb,now(),now())
    ON CONFLICT(tenant_id,external_order_id) DO UPDATE SET
      quote_id=EXCLUDED.quote_id,
      production_job_id=COALESCE(EXCLUDED.production_job_id,integration.wordpress_orders.production_job_id),
      order_status=EXCLUDED.order_status,
      order_total=EXCLUDED.order_total,
      payload_json=EXCLUDED.payload_json,
      updated_at=now()
  `, [
    connection.tenantId,
    externalOrderId,
    quote.id,
    productionJobId,
    text(payload.status) || null,
    numberValue(payload.total),
    JSON.stringify(payload)
  ]);
  await pool.query(`UPDATE integration.wordpress_connections SET last_order_received_at=now(),updated_at=now() WHERE id=$1::uuid`, [connection.id]);
  return { created: true, quoteId: quote.id, productionJobId, status: quoteStatus };
}
