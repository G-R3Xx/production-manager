import "server-only";

import { pool } from "@production-manager/db";

export type ProductRecord = {
  id: string;
  tenantId: string;
  sku: string | null;
  name: string;
  department: string;
  productFamily: string;
  status: string;
  calculatorType: string;
  defaultTemplateId: string | null;
  taxCode: string | null;
  createdAt: string;
  updatedAt: string;
  templateName: string | null;
  myobUid: string | null;
  productionRecipeId: string | null;
  productionRecipeName: string | null;
  websiteEnabled: boolean;
  websiteMode: string;
  websiteSlug: string | null;
  websiteCategory: string | null;
  websiteShortDescription: string | null;
  websiteDescription: string | null;
  websiteImageUrl: string | null;
  websiteConfigJson: Record<string, unknown>;
  websiteSyncVersion: number;
  websitePublishedAt: string | null;
};

export type ProductSummaryRecord = Pick<
  ProductRecord,
  | "id"
  | "sku"
  | "name"
  | "department"
  | "productFamily"
  | "status"
  | "defaultTemplateId"
  | "templateName"
  | "productionRecipeId"
  | "productionRecipeName"
  | "websiteEnabled"
  | "websiteCategory"
>;

export type QuoteProductRecord = Pick<
  ProductRecord,
  "id" | "sku" | "name" | "department" | "productFamily" | "status" | "defaultTemplateId"
> & {
  definitionJson: Record<string, unknown>;
};

export type ProductCreateInput = {
  tenantId: string;
  sku: string | null;
  name: string;
  department: string;
  productFamily: string;
  status: string;
  calculatorType: string;
  defaultTemplateId: string | null;
  taxCode: string | null;
};

const extendedDepartmentValues = new Set(["plan_printing", "poster_printing"]);
let wordPressProductPublishingSchemaReady = false;

export async function ensureWordPressProductPublishingSchema(): Promise<void> {
  if (!process.env.DATABASE_URL || wordPressProductPublishingSchemaReady) return;
  await pool.query(`
    ALTER TABLE catalog.products
      ADD COLUMN IF NOT EXISTS production_recipe_id uuid REFERENCES catalog.production_recipes(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS website_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS website_mode varchar(30) NOT NULL DEFAULT 'quote_only',
      ADD COLUMN IF NOT EXISTS website_slug varchar(200),
      ADD COLUMN IF NOT EXISTS website_category varchar(200),
      ADD COLUMN IF NOT EXISTS website_short_description text,
      ADD COLUMN IF NOT EXISTS website_description text,
      ADD COLUMN IF NOT EXISTS website_image_url text,
      ADD COLUMN IF NOT EXISTS website_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS website_sync_version integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS website_published_at timestamptz
  `);
  wordPressProductPublishingSchemaReady = true;
}

async function ensureDepartmentEnumValue(department: string): Promise<void> {
  if (!extendedDepartmentValues.has(department)) return;
  const safeValue = department === "plan_printing" ? "plan_printing" : "poster_printing";
  await pool.query(`ALTER TYPE department ADD VALUE IF NOT EXISTS '${safeValue}'`);
}

export async function listProductsForTenant(tenantId: string, options?: { includeDeleted?: boolean }): Promise<ProductRecord[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  const result = await pool.query<ProductRecord>(
    `
      SELECT
        p.id,
        p.tenant_id AS "tenantId",
        p.sku,
        p.name,
        p.department,
        p.product_family AS "productFamily",
        p.status::text AS status,
        p.calculator_type AS "calculatorType",
        p.default_template_id AS "defaultTemplateId",
        p.tax_code AS "taxCode",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        ct.name AS "templateName",
        p.myob_uid AS "myobUid",
        p.production_recipe_id AS "productionRecipeId",
        pr.name AS "productionRecipeName",
        p.website_enabled AS "websiteEnabled",
        p.website_mode AS "websiteMode",
        p.website_slug AS "websiteSlug",
        p.website_category AS "websiteCategory",
        p.website_short_description AS "websiteShortDescription",
        p.website_description AS "websiteDescription",
        p.website_image_url AS "websiteImageUrl",
        p.website_config_json AS "websiteConfigJson",
        p.website_sync_version AS "websiteSyncVersion",
        p.website_published_at AS "websitePublishedAt"
      FROM catalog.products p
      LEFT JOIN catalog.configurator_templates ct ON ct.id = p.default_template_id
      LEFT JOIN catalog.production_recipes pr ON pr.id = p.production_recipe_id
      WHERE p.tenant_id = $1
        AND ($2::boolean OR p.status::text <> 'deleted')
      ORDER BY p.name ASC, p.created_at DESC
    `,
    [tenantId, Boolean(options?.includeDeleted)]
  );

  return result.rows;
}

/**
 * Lightweight product list for the Product Library. The full product record
 * includes website descriptions and gallery/configuration JSON which can be
 * large and are not rendered by the library cards.
 */
export async function listProductSummariesForTenant(
  tenantId: string,
  options?: { includeDeleted?: boolean }
): Promise<ProductSummaryRecord[]> {
  if (!process.env.DATABASE_URL) return [];

  const result = await pool.query<ProductSummaryRecord>(
    `
      SELECT
        p.id,
        p.sku,
        p.name,
        p.department,
        p.product_family AS "productFamily",
        p.status::text AS status,
        p.default_template_id AS "defaultTemplateId",
        ct.name AS "templateName",
        p.production_recipe_id AS "productionRecipeId",
        pr.name AS "productionRecipeName",
        p.website_enabled AS "websiteEnabled",
        p.website_category AS "websiteCategory"
      FROM catalog.products p
      LEFT JOIN catalog.configurator_templates ct ON ct.id = p.default_template_id
      LEFT JOIN catalog.production_recipes pr ON pr.id = p.production_recipe_id
      WHERE p.tenant_id = $1
        AND ($2::boolean OR p.status::text <> 'deleted')
      ORDER BY p.name ASC, p.created_at DESC
    `,
    [tenantId, Boolean(options?.includeDeleted)]
  );

  return result.rows;
}

/**
 * Quote builder product payload. Joining the template here avoids loading all
 * product website metadata plus a second complete template catalogue.
 */
export async function listQuoteProductsForTenant(tenantId: string): Promise<QuoteProductRecord[]> {
  if (!process.env.DATABASE_URL) return [];

  const result = await pool.query<QuoteProductRecord>(
    `
      SELECT
        p.id,
        p.sku,
        p.name,
        p.department,
        p.product_family AS "productFamily",
        p.status::text AS status,
        p.default_template_id AS "defaultTemplateId",
        COALESCE(ct.definition_json, '{}'::jsonb) AS "definitionJson"
      FROM catalog.products p
      LEFT JOIN catalog.configurator_templates ct
        ON ct.id = p.default_template_id
       AND ct.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1
        AND p.status::text <> 'deleted'
      ORDER BY p.name ASC, p.created_at DESC
    `,
    [tenantId]
  );

  return result.rows;
}

export async function createProduct(input: ProductCreateInput): Promise<{ id: string }> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  await ensureWordPressProductPublishingSchema();
  await ensureDepartmentEnumValue(input.department);

  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.products (
        tenant_id,
        sku,
        name,
        department,
        product_family,
        status,
        calculator_type,
        default_template_id,
        tax_code
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
    `,
    [
      input.tenantId,
      input.sku,
      input.name,
      input.department,
      input.productFamily,
      input.status,
      input.calculatorType,
      input.defaultTemplateId,
      input.taxCode
    ]
  );

  return result.rows[0] ?? { id: '' };
}

export async function upsertImportedProduct(tenantId: string, input: {
  myobUid: string;
  sku?: string | null;
  name: string;
  taxCode?: string | null;
  status?: string;
  department?: string;
  productFamily?: string;
  calculatorType?: string;
  payloadJson?: Record<string, unknown>;
}): Promise<{ id: string }> {
  await ensureWordPressProductPublishingSchema();
  await ensureDepartmentEnumValue(input.department ?? "general");
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.products (
        tenant_id,
        myob_uid,
        sku,
        name,
        department,
        product_family,
        status,
        calculator_type,
        default_template_id,
        tax_code,
        payload_json,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::varchar,
        $3::varchar,
        $4::varchar,
        $5::varchar,
        $6::varchar,
        $7::varchar,
        $8::varchar,
        null,
        $9::varchar,
        $10::jsonb,
        now(),
        now()
      )
      ON CONFLICT (tenant_id, myob_uid)
      DO UPDATE SET
        sku = EXCLUDED.sku,
        name = EXCLUDED.name,
        department = EXCLUDED.department,
        product_family = EXCLUDED.product_family,
        status = EXCLUDED.status,
        calculator_type = EXCLUDED.calculator_type,
        tax_code = EXCLUDED.tax_code,
        payload_json = EXCLUDED.payload_json,
        updated_at = now()
      RETURNING id
    `,
    [
      tenantId,
      input.myobUid,
      input.sku ?? null,
      input.name,
      input.department ?? "general",
      input.productFamily ?? "display_products",
      input.status ?? "active",
      input.calculatorType ?? "configurator_template",
      input.taxCode ?? null,
      JSON.stringify(input.payloadJson ?? {})
    ]
  );

  return result.rows[0] ?? { id: "" };
}

export async function getProductById(tenantId: string, productId: string): Promise<ProductRecord | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const result = await pool.query<ProductRecord>(
    `
      SELECT
        p.id,
        p.tenant_id AS "tenantId",
        p.sku,
        p.name,
        p.department,
        p.product_family AS "productFamily",
        p.status::text AS status,
        p.calculator_type AS "calculatorType",
        p.default_template_id AS "defaultTemplateId",
        p.tax_code AS "taxCode",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        ct.name AS "templateName",
        p.myob_uid AS "myobUid",
        p.production_recipe_id AS "productionRecipeId",
        pr.name AS "productionRecipeName",
        p.website_enabled AS "websiteEnabled",
        p.website_mode AS "websiteMode",
        p.website_slug AS "websiteSlug",
        p.website_category AS "websiteCategory",
        p.website_short_description AS "websiteShortDescription",
        p.website_description AS "websiteDescription",
        p.website_image_url AS "websiteImageUrl",
        p.website_config_json AS "websiteConfigJson",
        p.website_sync_version AS "websiteSyncVersion",
        p.website_published_at AS "websitePublishedAt"
      FROM catalog.products p
      LEFT JOIN catalog.configurator_templates ct ON ct.id = p.default_template_id
      LEFT JOIN catalog.production_recipes pr ON pr.id = p.production_recipe_id
      WHERE p.tenant_id = $1 AND p.id = $2
      LIMIT 1
    `,
    [tenantId, productId]
  );

  return result.rows[0] ?? null;
}

export async function updateProduct(tenantId: string, productId: string, input: {
  sku: string | null;
  name: string;
  department: string;
  productFamily: string;
  status: string;
  defaultTemplateId: string | null;
  taxCode: string | null;
}): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await ensureWordPressProductPublishingSchema();
  await ensureDepartmentEnumValue(input.department);

  await pool.query(
    `
      UPDATE catalog.products
      SET
        sku = $3,
        name = $4,
        department = $5,
        product_family = $6,
        status = $7,
        default_template_id = $8,
        tax_code = $9,
        website_sync_version = website_sync_version + 1,
        updated_at = now()
      WHERE tenant_id = $1 AND id = $2
    `,
    [
      tenantId,
      productId,
      input.sku,
      input.name,
      input.department,
      input.productFamily,
      input.status,
      input.defaultTemplateId,
      input.taxCode
    ]
  );
}

function looksLikeMissingDeletedStatus(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  const message = String(candidate?.message ?? "").toLowerCase();
  return (
    candidate?.code === "22P02" ||
    message.includes("invalid input value for enum product_status") ||
    message.includes("unsafe use of new value")
  );
}

async function ensureDeletedProductStatusValue(): Promise<void> {
  await pool.query("ALTER TYPE product_status ADD VALUE IF NOT EXISTS 'deleted'");
}

export async function setProductStatusForTenant(tenantId: string, productId: string, status: string): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const updateStatus = () => pool.query(
    `
      UPDATE catalog.products
      SET status = $3,
          website_sync_version = website_sync_version + 1,
          updated_at = now()
      WHERE tenant_id = $1 AND id = $2
    `,
    [tenantId, productId, status]
  );

  try {
    await updateStatus();
  } catch (error) {
    if (status !== "deleted" || !looksLikeMissingDeletedStatus(error)) {
      throw error;
    }

    await ensureDeletedProductStatusValue();
    await updateStatus();
  }
}

export async function updateProductProductionRecipe(
  tenantId: string,
  productId: string,
  productionRecipeId: string | null
): Promise<void> {
  await ensureWordPressProductPublishingSchema();
  await pool.query(`
    UPDATE catalog.products
    SET production_recipe_id = $3::uuid,
        website_sync_version = website_sync_version + 1,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, productId, productionRecipeId]);
}

export async function updateProductWebsitePublishing(
  tenantId: string,
  productId: string,
  input: {
    enabled: boolean;
    mode: "live_checkout" | "quote_only";
    slug: string | null;
    category: string | null;
    shortDescription: string | null;
    description: string | null;
    imageUrl: string | null;
    configJson: Record<string, unknown>;
  }
): Promise<void> {
  await ensureWordPressProductPublishingSchema();
  await pool.query(`
    UPDATE catalog.products
    SET website_enabled = $3,
        website_mode = $4,
        website_slug = $5,
        website_category = $6,
        website_short_description = $7,
        website_description = $8,
        website_image_url = $9,
        website_config_json = $10::jsonb,
        website_sync_version = website_sync_version + 1,
        website_published_at = CASE WHEN $3 THEN COALESCE(website_published_at, now()) ELSE website_published_at END,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [
    tenantId,
    productId,
    input.enabled,
    input.mode,
    input.slug,
    input.category,
    input.shortDescription,
    input.description,
    input.imageUrl,
    JSON.stringify(input.configJson ?? {})
  ]);
}


export async function updateProductInternalDefaults(
  tenantId: string,
  productId: string,
  defaults: {
    widthMm: number;
    heightMm: number;
    quantity: number;
    deliveryMethod: string;
    printMethod: string;
    guidedFields?: unknown[];
    guidedComponents?: unknown[];
  }
): Promise<void> {
  await ensureWordPressProductPublishingSchema();
  await pool.query(`
    UPDATE catalog.products
    SET website_config_json = COALESCE(website_config_json, '{}'::jsonb) || $3::jsonb,
        website_sync_version = website_sync_version + 1,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [
    tenantId,
    productId,
    JSON.stringify({
      defaultWidthMm: Math.max(1, Math.round(defaults.widthMm)),
      defaultHeightMm: Math.max(1, Math.round(defaults.heightMm)),
      defaultQuantity: Math.max(1, Math.round(defaults.quantity)),
      internalDeliveryMethod: defaults.deliveryMethod || "pickup",
      internalPrintMethod: defaults.printMethod || "none",
      ...(Array.isArray(defaults.guidedFields) ? { guidedFields: defaults.guidedFields } : {}),
      ...(Array.isArray(defaults.guidedComponents) ? { guidedComponents: defaults.guidedComponents } : {})
    })
  ]);
}

export async function touchProductWebsiteSync(tenantId: string, productId: string): Promise<void> {
  await ensureWordPressProductPublishingSchema();
  await pool.query(`
    UPDATE catalog.products
    SET website_sync_version = website_sync_version + 1,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, productId]);
}

export async function listPublishedWebsiteProductsForTenant(tenantId: string): Promise<ProductRecord[]> {
  const products = await listProductsForTenant(tenantId);
  return products.filter((product) => product.websiteEnabled && product.status === "active");
}

export async function listProductsByTenantId(tenantId: string): Promise<ProductRecord[]> {
  return listProductsForTenant(tenantId);
}
