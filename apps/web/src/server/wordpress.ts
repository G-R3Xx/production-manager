import "server-only";

import { randomBytes } from "crypto";
import { pool } from "@production-manager/db";
import { getConfiguratorTemplateById } from "@/server/configurators";
import {
  ensureWordPressProductPublishingSchema,
  getProductById,
  listPublishedWebsiteProductsForTenant,
  type ProductRecord
} from "@/server/products";
import { previewRecipeCost } from "@/server/productionResources";
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

function displayForField(field: Record<string, unknown>, config: Record<string, unknown>): WebsiteBuilderField["display"] {
  const fieldDisplays = asObject(config.fieldDisplays);
  const configured = text(fieldDisplays[text(field.key)]);
  if (["buttons", "cards", "dropdown", "swatches", "number", "text"].includes(configured)) {
    return configured as WebsiteBuilderField["display"];
  }
  const type = text(field.type);
  if (type === "color") return "swatches";
  if (["number", "quantity"].includes(type)) return "number";
  if (type === "text") return "text";
  if (type === "select" && asArray(field.options).length > 6) return "dropdown";
  return type === "size_select" ? "cards" : "buttons";
}

function serializeFields(definition: Record<string, unknown>, websiteConfig: Record<string, unknown>): WebsiteBuilderField[] {
  return asArray(definition.fields).map((rawField) => {
    const field = asObject(rawField);
    return {
      id: text(field.id) || null,
      key: text(field.key) || safeSlug(text(field.label)),
      label: text(field.label) || "Option",
      type: text(field.type) || "select",
      required: Boolean(field.required),
      defaultValue: field.defaultValue ?? null,
      helpText: text(field.helpText) || null,
      display: displayForField(field, websiteConfig),
      options: asArray(field.options).map((rawChoice) => {
        const choice = asObject(rawChoice);
        return {
          id: text(choice.id) || null,
          label: text(choice.label) || text(choice.value) || "Option",
          value: text(choice.value) || text(choice.label),
          priceDelta: numberValue(choice.priceDelta),
          widthMm: choice.widthMm == null ? null : numberValue(choice.widthMm),
          heightMm: choice.heightMm == null ? null : numberValue(choice.heightMm)
        };
      }),
      showWhen: Object.keys(asObject(field.showWhen)).length ? asObject(field.showWhen) : null
    };
  });
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
  const definition = asObject(template?.definitionJson);
  const config = asObject(product.websiteConfigJson);
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
    version: "V26.07.28.10",
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
  return one ? [one] : [];
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

export async function priceWordPressProductForTenant(tenantId: string, body: PriceBody) {
  const product = await getProductById(tenantId, body.productId);
  if (!product || !product.websiteEnabled || product.status !== "active") return null;
  const template = product.defaultTemplateId
    ? await getConfiguratorTemplateById(tenantId, product.defaultTemplateId).catch(() => null)
    : null;
  const definition = asObject(template?.definitionJson);
  const websiteConfig = asObject(product.websiteConfigJson);
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

  const recipe = product.productionRecipeId
    ? await previewRecipeCost(tenantId, product.productionRecipeId, widthMm, heightMm, quantity).catch(() => null)
    : null;
  const baseSell = recipe?.sellPrice ?? numberValue(websiteConfig.basePrice);
  const lineTotal = Math.max(0, Math.round((baseSell + optionDelta) * 100) / 100);
  return {
    productId: product.id,
    productName: product.name,
    mode: product.websiteMode === "quote_only" || quoteTriggered ? "quote_only" : "live_checkout",
    quoteRequired: product.websiteMode === "quote_only" || quoteTriggered,
    validationErrors,
    widthMm,
    heightMm,
    quantity,
    optionDelta: Math.round(optionDelta * 100) / 100,
    lineTotal,
    unitPrice: Math.round((lineTotal / quantity) * 100) / 100,
    currency: "AUD",
    cost: recipe ? {
      material: recipe.materialCost,
      machines: recipe.machineCost,
      ink: recipe.inkCost,
      labour: recipe.labourCost,
      total: recipe.totalCost
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
