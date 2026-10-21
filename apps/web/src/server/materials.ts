import "server-only";

import { pool } from "@production-manager/db";
import { relationHasColumns, runtimeSchemaFallbackEnabled } from "@/server/schema-readiness";

export type MaterialRecord = {
  id: string;
  tenantId: string;
  supplierId: string | null;
  sourceProductId: string | null;
  supplierName: string | null;
  sourceProductName: string | null;
  stockSourceMaterialId: string | null;
  stockSourceName: string | null;
  salesMarkupMultiplier: string | null;
  name: string;
  customerFacingName: string | null;
  sku: string | null;
  materialType: string;
  materialGroup: string | null;
  minimumBillableSheetFraction: string | null;
  rollBillingIncrementMetres: string | null;
  reversePrintable: boolean;
  usedForBacking: boolean;
  showAsInstallationOption: boolean;
  stockUom: string;
  purchaseUom: string;
  stockQuantity: string;
  purchaseCost: string;
  wastagePercent: string;
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
  gsm: string | null;
  notes: string | null;
  quoteImageUrl: string | null;
  quoteImageStoragePath: string | null;
  quoteVisualCategory: string | null;
  costJson: Record<string, unknown>;
  myobUid: string | null;
  myobDisplayId: string | null;
  myobSyncState: string | null;
  myobPayloadJson: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DashboardMaterialRecord = Pick<
  MaterialRecord,
  "id" | "name" | "stockQuantity" | "stockUom" | "updatedAt"
>;

export type CreateMaterialInput = {
  tenantId: string;
  supplierId: string | null;
  sourceProductId: string | null;
  stockSourceMaterialId: string | null;
  salesMarkupMultiplier: string | null;
  name: string;
  customerFacingName: string | null;
  sku: string | null;
  materialType: string;
  materialGroup: string | null;
  minimumBillableSheetFraction: string | null;
  rollBillingIncrementMetres: string | null;
  reversePrintable: boolean;
  usedForBacking: boolean;
  showAsInstallationOption: boolean;
  stockUom: string;
  purchaseUom: string;
  stockQuantity: string;
  purchaseCost: string;
  wastagePercent: string;
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
  gsm: string | null;
  notes: string | null;
  quoteImageUrl: string | null;
  quoteImageStoragePath: string | null;
  quoteVisualCategory: string | null;
};

export type UpdateMaterialInput = CreateMaterialInput & {
  id: string;
};

let materialPricingSchemaReady = false;
let materialPricingSchemaPromise: Promise<void> | null = null;
let materialVisualSchemaReady = false;
let materialVisualSchemaPromise: Promise<void> | null = null;

async function ensureMaterialVisualColumns(): Promise<void> {
  if (!process.env.DATABASE_URL || materialVisualSchemaReady) return;
  if (materialVisualSchemaPromise) return materialVisualSchemaPromise;
  materialVisualSchemaPromise = (async () => {
    // Production trusts checked-in migrations. Avoid an information_schema round
    // trip on the first Materials/Quotes request in every serverless instance.
    // Local development (or PM_RUNTIME_SCHEMA_FALLBACK=1) retains the legacy
    // self-healing schema check for older databases.
    if (!runtimeSchemaFallbackEnabled()) {
      materialVisualSchemaReady = true;
      return;
    }
    const result = await pool.query<{ columnCount: string }>(`
      SELECT count(DISTINCT column_name)::text AS "columnCount"
      FROM information_schema.columns
      WHERE table_schema = 'catalog'
        AND table_name = 'materials'
        AND column_name = ANY($1::text[])
    `, [["quote_image_url", "quote_image_storage_path", "quote_visual_category"]]);
    if (Number(result.rows[0]?.columnCount ?? 0) < 3) {
      await pool.query(`
        ALTER TABLE catalog.materials
          ADD COLUMN IF NOT EXISTS quote_image_url text,
          ADD COLUMN IF NOT EXISTS quote_image_storage_path text,
          ADD COLUMN IF NOT EXISTS quote_visual_category varchar(40)
      `);
    }
    materialVisualSchemaReady = true;
  })().catch((error) => {
    materialVisualSchemaPromise = null;
    throw error;
  });
  return materialVisualSchemaPromise;
}

export async function ensureMaterialPricingColumns(): Promise<void> {
  if (!process.env.DATABASE_URL || materialPricingSchemaReady) return;
  if (materialPricingSchemaPromise) return materialPricingSchemaPromise;
  materialPricingSchemaPromise = (async () => {
    if (await relationHasColumns("catalog.materials", [
      "material_group", "minimum_billable_sheet_fraction", "roll_billing_increment_metres",
      "reverse_printable", "used_for_backing", "customer_facing_name", "myob_uid",
      "myob_display_id", "myob_sync_state", "myob_payload_json", "quote_image_url",
      "quote_image_storage_path", "quote_visual_category", "stock_source_material_id",
      "sales_markup_multiplier"
    ])) {
      materialPricingSchemaReady = true;
      return;
    }

  await pool.query(`
    ALTER TABLE catalog.materials
      ADD COLUMN IF NOT EXISTS material_group varchar(50),
      ADD COLUMN IF NOT EXISTS minimum_billable_sheet_fraction numeric(6, 4),
      ADD COLUMN IF NOT EXISTS roll_billing_increment_metres numeric(6, 4),
      ADD COLUMN IF NOT EXISTS reverse_printable boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS used_for_backing boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS customer_facing_name varchar(200),
      ADD COLUMN IF NOT EXISTS myob_uid varchar(255),
      ADD COLUMN IF NOT EXISTS myob_display_id varchar(30),
      ADD COLUMN IF NOT EXISTS myob_sync_state varchar(30),
      ADD COLUMN IF NOT EXISTS myob_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS quote_image_url text,
      ADD COLUMN IF NOT EXISTS quote_image_storage_path text,
      ADD COLUMN IF NOT EXISTS quote_visual_category varchar(40),
      ADD COLUMN IF NOT EXISTS stock_source_material_id uuid REFERENCES catalog.materials(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS sales_markup_multiplier numeric(8,4)
  `);
    materialPricingSchemaReady = true;
  })().catch((error) => {
    materialPricingSchemaPromise = null;
    throw error;
  });
  return materialPricingSchemaPromise;
}

function normalizeMaterialType(value: string): string {
  switch (value) {
    case "sheet":
      return "sheet_media";
    case "roll":
      return "roll_media";
    case "paper":
      return "paper_stock";
    case "hardware":
      return "fixing";
    case "consumable":
      return "item";
    default:
      return value || "other";
  }
}

function toLegacyMaterialType(value: string): string {
  const normalized = normalizeMaterialType(value);
  const allowed = new Set([
    "sheet_media",
    "roll_media",
    "roll_laminate",
    "card_stock",
    "paper_stock",
    "cello_stock",
    "binding",
    "finishing",
    "fixing",
    "item",
    "other"
  ]);

  return allowed.has(normalized) ? normalized : "other";
}

function presentMaterialType(value: string): string {
  switch (value) {
    case "sheet_media":
      return "sheet";
    case "roll_media":
      return "roll";
    case "paper_stock":
      return "paper";
    case "card_stock":
      return "card stock";
    case "roll_laminate":
      return "roll laminate";
    case "fixing":
      return "hardware";
    case "item":
      return "consumable";
    default:
      return value;
  }
}

/**
 * Lightweight active-material read model for quote builders. Quote configuration
 * never needs MYOB payload blobs or archived materials, and loading those on every
 * quote workspace open adds avoidable transfer/JSON parsing cost.
 */
export async function listQuoteMaterialsForTenant(tenantId: string): Promise<MaterialRecord[]> {
  await ensureMaterialPricingColumns();
  await ensureMaterialVisualColumns().catch(() => undefined);
  const result = await pool.query<MaterialRecord>(`
    SELECT
      m.id,
      m.tenant_id AS "tenantId",
      stock.supplier_id AS "supplierId",
      stock.source_product_id AS "sourceProductId",
      s.display_name AS "supplierName",
      NULL::text AS "sourceProductName",
      m.stock_source_material_id AS "stockSourceMaterialId",
      CASE WHEN m.stock_source_material_id IS NULL THEN NULL ELSE stock.name END AS "stockSourceName",
      m.sales_markup_multiplier::text AS "salesMarkupMultiplier",
      m.name,
      m.customer_facing_name AS "customerFacingName",
      stock.sku,
      CASE
        WHEN stock.material_type IS NOT NULL THEN stock.material_type::text
        ELSE stock.type::text
      END AS "materialType",
      COALESCE(m.material_group, stock.material_group) AS "materialGroup",
      stock.minimum_billable_sheet_fraction::text AS "minimumBillableSheetFraction",
      stock.roll_billing_increment_metres::text AS "rollBillingIncrementMetres",
      COALESCE(m.reverse_printable, stock.reverse_printable, false) AS "reversePrintable",
      COALESCE(m.used_for_backing, stock.used_for_backing, false) AS "usedForBacking",
      COALESCE(m.cost_json ->> 'showAsInstallationOption', 'false') = 'true' AS "showAsInstallationOption",
      stock.stock_uom AS "stockUom",
      stock.purchase_uom AS "purchaseUom",
      stock.stock_quantity::text AS "stockQuantity",
      stock.purchase_cost::text AS "purchaseCost",
      COALESCE(m.cost_json ->> 'wastagePercent', stock.cost_json ->> 'wastagePercent', '0') AS "wastagePercent",
      stock.width_mm::text AS "widthMm",
      stock.length_mm::text AS "lengthMm",
      stock.roll_width_mm::text AS "rollWidthMm",
      stock.gsm::text AS gsm,
      m.notes,
      COALESCE(to_jsonb(m) ->> 'quote_image_url', m.cost_json ->> 'quoteImageUrl') AS "quoteImageUrl",
      COALESCE(to_jsonb(m) ->> 'quote_image_storage_path', m.cost_json ->> 'quoteImageStoragePath') AS "quoteImageStoragePath",
      COALESCE(to_jsonb(m) ->> 'quote_visual_category', m.cost_json ->> 'quoteVisualCategory') AS "quoteVisualCategory",
      '{}'::jsonb AS "costJson",
      NULL::text AS "myobUid",
      NULL::text AS "myobDisplayId",
      NULL::text AS "myobSyncState",
      '{}'::jsonb AS "myobPayloadJson",
      true AS active,
      m.created_at AS "createdAt",
      m.updated_at AS "updatedAt"
    FROM catalog.materials m
    JOIN catalog.materials stock
      ON stock.id = COALESCE(m.stock_source_material_id, m.id)
     AND stock.tenant_id = m.tenant_id
    LEFT JOIN app.suppliers s ON s.id = stock.supplier_id
    WHERE m.tenant_id = $1::uuid
      AND m.active = true
      AND stock.active = true
    ORDER BY m.name ASC, m.created_at DESC
  `, [tenantId]);

  return result.rows.map((row) => ({
    ...row,
    materialType: presentMaterialType(row.materialType),
    costJson: row.costJson && typeof row.costJson === "object" ? row.costJson : {},
    myobPayloadJson: {}
  }));
}

export async function listMaterialsForTenant(tenantId: string): Promise<MaterialRecord[]> {
  await ensureMaterialPricingColumns();
  await ensureMaterialVisualColumns().catch(() => undefined);
  const result = await pool.query<MaterialRecord>(`
    SELECT
      m.id,
      m.tenant_id AS "tenantId",
      stock.supplier_id AS "supplierId",
      stock.source_product_id AS "sourceProductId",
      s.display_name AS "supplierName",
      p.name AS "sourceProductName",
      m.stock_source_material_id AS "stockSourceMaterialId",
      CASE WHEN m.stock_source_material_id IS NULL THEN NULL ELSE stock.name END AS "stockSourceName",
      m.sales_markup_multiplier::text AS "salesMarkupMultiplier",
      m.name,
      m.customer_facing_name AS "customerFacingName",
      stock.sku,
      CASE
        WHEN stock.material_type IS NOT NULL THEN stock.material_type::text
        ELSE stock.type::text
      END AS "materialType",
      COALESCE(m.material_group, stock.material_group) AS "materialGroup",
      stock.minimum_billable_sheet_fraction::text AS "minimumBillableSheetFraction",
      stock.roll_billing_increment_metres::text AS "rollBillingIncrementMetres",
      COALESCE(m.reverse_printable, stock.reverse_printable, false) AS "reversePrintable",
      COALESCE(m.used_for_backing, stock.used_for_backing, false) AS "usedForBacking",
      COALESCE(m.cost_json ->> 'showAsInstallationOption', 'false') = 'true' AS "showAsInstallationOption",
      stock.stock_uom AS "stockUom",
      stock.purchase_uom AS "purchaseUom",
      stock.stock_quantity::text AS "stockQuantity",
      stock.purchase_cost::text AS "purchaseCost",
      COALESCE(m.cost_json ->> 'wastagePercent', stock.cost_json ->> 'wastagePercent', '0') AS "wastagePercent",
      stock.width_mm::text AS "widthMm",
      stock.length_mm::text AS "lengthMm",
      stock.roll_width_mm::text AS "rollWidthMm",
      stock.gsm::text AS gsm,
      m.notes,
      COALESCE(to_jsonb(m) ->> 'quote_image_url', m.cost_json ->> 'quoteImageUrl') AS "quoteImageUrl",
      COALESCE(to_jsonb(m) ->> 'quote_image_storage_path', m.cost_json ->> 'quoteImageStoragePath') AS "quoteImageStoragePath",
      COALESCE(to_jsonb(m) ->> 'quote_visual_category', m.cost_json ->> 'quoteVisualCategory') AS "quoteVisualCategory",
      m.cost_json AS "costJson",
      stock.myob_uid AS "myobUid",
      stock.myob_display_id AS "myobDisplayId",
      stock.myob_sync_state AS "myobSyncState",
      stock.myob_payload_json AS "myobPayloadJson",
      m.active,
      m.created_at AS "createdAt",
      m.updated_at AS "updatedAt"
    FROM catalog.materials m
    JOIN catalog.materials stock
      ON stock.id = COALESCE(m.stock_source_material_id, m.id)
     AND stock.tenant_id = m.tenant_id
    LEFT JOIN app.suppliers s ON s.id = stock.supplier_id
    LEFT JOIN catalog.products p ON p.id = stock.source_product_id
    WHERE m.tenant_id = $1::uuid
    ORDER BY m.name ASC, m.created_at DESC
  `, [tenantId]);

  return result.rows.map((row) => ({ ...row, materialType: presentMaterialType(row.materialType), costJson: row.costJson && typeof row.costJson === "object" ? row.costJson : {}, myobPayloadJson: row.myobPayloadJson && typeof row.myobPayloadJson === "object" ? row.myobPayloadJson : {} }));
}

export async function getDashboardMaterialSummary(tenantId: string): Promise<{
  activeCount: number;
  lowStock: DashboardMaterialRecord[];
}> {
  const [countResult, lowStockResult] = await Promise.all([
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM catalog.materials
      WHERE tenant_id = $1::uuid AND active = true
    `, [tenantId]),
    pool.query<DashboardMaterialRecord>(`
      SELECT
        id,
        name,
        stock_quantity::text AS "stockQuantity",
        stock_uom AS "stockUom",
        updated_at AS "updatedAt"
      FROM catalog.materials
      WHERE tenant_id = $1::uuid
        AND active = true
        AND stock_source_material_id IS NULL
        AND stock_quantity > 0
        AND stock_quantity <= 2
      ORDER BY stock_quantity ASC, updated_at DESC
      LIMIT 8
    `, [tenantId])
  ]);

  return {
    activeCount: Number(countResult.rows[0]?.count ?? 0),
    lowStock: lowStockResult.rows
  };
}

type PhysicalStockMaterial = {
  id: string;
  supplierId: string | null;
  sourceProductId: string | null;
  sku: string | null;
  materialType: string;
  materialGroup: string | null;
  minimumBillableSheetFraction: string | null;
  rollBillingIncrementMetres: string | null;
  reversePrintable: boolean;
  usedForBacking: boolean;
  stockUom: string;
  purchaseUom: string;
  stockQuantity: string;
  purchaseCost: string;
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
  gsm: string | null;
};

async function getPhysicalStockMaterial(tenantId: string, materialId: string): Promise<PhysicalStockMaterial | null> {
  const result = await pool.query<PhysicalStockMaterial>(`
    SELECT
      root.id,
      root.supplier_id AS "supplierId",
      root.source_product_id AS "sourceProductId",
      root.sku,
      COALESCE(root.material_type::text, root.type::text) AS "materialType",
      root.material_group AS "materialGroup",
      root.minimum_billable_sheet_fraction::text AS "minimumBillableSheetFraction",
      root.roll_billing_increment_metres::text AS "rollBillingIncrementMetres",
      COALESCE(root.reverse_printable,false) AS "reversePrintable",
      COALESCE(root.used_for_backing,false) AS "usedForBacking",
      root.stock_uom AS "stockUom",
      root.purchase_uom AS "purchaseUom",
      root.stock_quantity::text AS "stockQuantity",
      root.purchase_cost::text AS "purchaseCost",
      root.width_mm::text AS "widthMm",
      root.length_mm::text AS "lengthMm",
      root.roll_width_mm::text AS "rollWidthMm",
      root.gsm::text AS gsm
    FROM catalog.materials selected
    JOIN catalog.materials root
      ON root.id = COALESCE(selected.stock_source_material_id, selected.id)
     AND root.tenant_id = selected.tenant_id
    WHERE selected.tenant_id = $1::uuid
      AND selected.id = $2::uuid
      AND root.active = true
    LIMIT 1
  `, [tenantId, materialId]);
  return result.rows[0] ?? null;
}

export async function resolvePhysicalMaterialId(tenantId: string, materialId: string): Promise<string> {
  const stock = await getPhysicalStockMaterial(tenantId, materialId);
  if (!stock) throw new Error("The selected physical stock material could not be found.");
  return stock.id;
}

async function normalizeSharedStockInput(input: CreateMaterialInput | UpdateMaterialInput): Promise<CreateMaterialInput | UpdateMaterialInput> {
  if (!input.stockSourceMaterialId) return input;
  if ("id" in input && input.id === input.stockSourceMaterialId) throw new Error("A material cannot share stock with itself.");
  if ("id" in input) {
    const dependants = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM catalog.materials
      WHERE tenant_id=$1::uuid AND stock_source_material_id=$2::uuid
    `,[input.tenantId,input.id]);
    if (Number(dependants.rows[0]?.count ?? 0) > 0) {
      throw new Error("This material is already the physical stock source for sales variants. Move those variants before making it a sales variant itself.");
    }
  }
  const stock = await getPhysicalStockMaterial(input.tenantId, input.stockSourceMaterialId);
  if (!stock) throw new Error("The selected shared stock source is no longer available.");
  if ("id" in input && input.id === stock.id) throw new Error("A material cannot share stock with itself.");
  return {
    ...input,
    stockSourceMaterialId: stock.id,
    supplierId: stock.supplierId,
    sourceProductId: stock.sourceProductId,
    sku: stock.sku,
    materialType: stock.materialType,
    materialGroup: stock.materialGroup ?? input.materialGroup,
    minimumBillableSheetFraction: stock.minimumBillableSheetFraction,
    rollBillingIncrementMetres: stock.rollBillingIncrementMetres,
    reversePrintable: stock.reversePrintable,
    usedForBacking: stock.usedForBacking,
    stockUom: stock.stockUom,
    purchaseUom: stock.purchaseUom,
    stockQuantity: stock.stockQuantity,
    purchaseCost: stock.purchaseCost,
    widthMm: stock.widthMm,
    lengthMm: stock.lengthMm,
    rollWidthMm: stock.rollWidthMm,
    gsm: stock.gsm
  };
}

export async function createMaterial(input: CreateMaterialInput): Promise<{ id: string }> {
  await ensureMaterialPricingColumns();
  const saved = await normalizeSharedStockInput(input) as CreateMaterialInput;

  const result = await pool.query<{ id: string }>(`
    INSERT INTO catalog.materials (
      tenant_id, supplier_id, source_product_id, stock_source_material_id, sales_markup_multiplier,
      name, customer_facing_name, sku, type, material_type, material_group,
      minimum_billable_sheet_fraction, roll_billing_increment_metres, reverse_printable, used_for_backing,
      stock_uom, purchase_uom, stock_quantity, purchase_cost, cost_json,
      width_mm, length_mm, roll_width_mm, gsm, notes,
      quote_image_url, quote_image_storage_path, quote_visual_category,
      active, created_at, updated_at
    ) VALUES (
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::numeric,
      $6::varchar,$7::varchar,$8::varchar,$9::material_type,$10::varchar,$11::varchar,
      $12::numeric,$13::numeric,$14::boolean,$15::boolean,
      $16::varchar,$17::varchar,$18::numeric,$19::numeric,
      jsonb_build_object('purchaseCost',$19::numeric,'wastagePercent',$20::numeric,'showAsInstallationOption',$26::boolean),
      $21::numeric,$22::numeric,$23::numeric,$24::numeric,$25::varchar,
      $27::text,$28::text,$29::varchar,
      true,now(),now()
    )
    RETURNING id
  `, [
    saved.tenantId,
    saved.supplierId,
    saved.sourceProductId,
    saved.stockSourceMaterialId,
    saved.salesMarkupMultiplier,
    saved.name,
    saved.customerFacingName,
    saved.sku,
    toLegacyMaterialType(saved.materialType),
    normalizeMaterialType(saved.materialType),
    saved.materialGroup,
    saved.minimumBillableSheetFraction,
    saved.rollBillingIncrementMetres,
    saved.reversePrintable,
    saved.usedForBacking,
    saved.stockUom,
    saved.purchaseUom,
    saved.stockQuantity,
    saved.purchaseCost,
    saved.wastagePercent,
    saved.widthMm,
    saved.lengthMm,
    saved.rollWidthMm,
    saved.gsm,
    saved.notes,
    saved.showAsInstallationOption,
    saved.quoteImageUrl,
    saved.quoteImageStoragePath,
    saved.quoteVisualCategory
  ]);
  return result.rows[0];
}

export async function updateMaterial(input: UpdateMaterialInput): Promise<void> {
  await ensureMaterialPricingColumns();
  const saved = await normalizeSharedStockInput(input) as UpdateMaterialInput;

  await pool.query(`
    UPDATE catalog.materials
    SET
      supplier_id=$3::uuid,
      source_product_id=$4::uuid,
      stock_source_material_id=$5::uuid,
      sales_markup_multiplier=$6::numeric,
      name=$7::varchar,
      customer_facing_name=$8::varchar,
      sku=$9::varchar,
      type=$10::material_type,
      material_type=$11::varchar,
      material_group=$12::varchar,
      minimum_billable_sheet_fraction=$13::numeric,
      roll_billing_increment_metres=$14::numeric,
      reverse_printable=$15::boolean,
      used_for_backing=$16::boolean,
      stock_uom=$17::varchar,
      purchase_uom=$18::varchar,
      stock_quantity=$19::numeric,
      purchase_cost=$20::numeric,
      cost_json=COALESCE(cost_json,'{}'::jsonb) || jsonb_build_object('purchaseCost',$20::numeric,'wastagePercent',$21::numeric,'showAsInstallationOption',$27::boolean),
      width_mm=$22::numeric,
      length_mm=$23::numeric,
      roll_width_mm=$24::numeric,
      gsm=$25::numeric,
      notes=$26::varchar,
      quote_image_url=$28::text,
      quote_image_storage_path=$29::text,
      quote_visual_category=$30::varchar,
      updated_at=now()
    WHERE id=$1::uuid AND tenant_id=$2::uuid
  `, [
    saved.id,
    saved.tenantId,
    saved.supplierId,
    saved.sourceProductId,
    saved.stockSourceMaterialId,
    saved.salesMarkupMultiplier,
    saved.name,
    saved.customerFacingName,
    saved.sku,
    toLegacyMaterialType(saved.materialType),
    normalizeMaterialType(saved.materialType),
    saved.materialGroup,
    saved.minimumBillableSheetFraction,
    saved.rollBillingIncrementMetres,
    saved.reversePrintable,
    saved.usedForBacking,
    saved.stockUom,
    saved.purchaseUom,
    saved.stockQuantity,
    saved.purchaseCost,
    saved.wastagePercent,
    saved.widthMm,
    saved.lengthMm,
    saved.rollWidthMm,
    saved.gsm,
    saved.notes,
    saved.showAsInstallationOption,
    saved.quoteImageUrl,
    saved.quoteImageStoragePath,
    saved.quoteVisualCategory
  ]);
}

export async function setMaterialActive(tenantId: string, materialId: string, active: boolean): Promise<void> {
  if (!active) {
    const variants = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM catalog.materials
      WHERE tenant_id=$1::uuid AND stock_source_material_id=$2::uuid AND active=true
    `,[tenantId,materialId]);
    if (Number(variants.rows[0]?.count ?? 0) > 0) {
      throw new Error("This physical stock item still has active sales variants. Move or deactivate those variants first.");
    }
  }
  await pool.query(`
    UPDATE catalog.materials
    SET active = $3::boolean,
        updated_at = now()
    WHERE id = $1::uuid
      AND tenant_id = $2::uuid
  `, [materialId, tenantId, active]);
}


export async function getMaterialById(tenantId: string, materialId: string | null | undefined): Promise<MaterialRecord | null> {
  if (!materialId) return null;
  const rows = await listMaterialsForTenant(tenantId);
  return rows.find((row) => row.id === materialId) ?? null;
}

export async function setMaterialQuoteImage(tenantId: string, materialId: string, image: { imageUrl: string | null; storagePath: string | null }): Promise<void> {
  await ensureMaterialVisualColumns();
  await pool.query(`
    UPDATE catalog.materials
    SET quote_image_url=$3::text,
        quote_image_storage_path=$4::text,
        cost_json=(COALESCE(cost_json,'{}'::jsonb)-'quoteImageUrl'-'quoteImageStoragePath')
          || CASE WHEN $3::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('quoteImageUrl',$3::text) END
          || CASE WHEN $4::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('quoteImageStoragePath',$4::text) END,
        updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `,[tenantId,materialId,image.imageUrl,image.storagePath]);
}

export async function updateMaterialMyobLink(tenantId: string, materialId: string, input: {
  myobUid: string; myobDisplayId?: string | null; myobSyncState?: string | null; myobPayloadJson?: Record<string, unknown>;
}): Promise<void> {
  await ensureMaterialPricingColumns();
  await pool.query(`
    UPDATE catalog.materials
    SET myob_uid=$3::varchar, myob_display_id=$4::varchar, myob_sync_state=$5::varchar,
        myob_payload_json=COALESCE(myob_payload_json,'{}'::jsonb)||$6::jsonb, updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `,[tenantId,materialId,input.myobUid,input.myobDisplayId??null,input.myobSyncState??"synced",JSON.stringify(input.myobPayloadJson??{})]);
}

export type MaterialPriceManagerAction = "KEEP" | "ADD" | "HIDE" | "ARCHIVE" | "RESTORE";

export type MaterialPriceManagerChange = {
  id: string | null;
  action: MaterialPriceManagerAction;
  materialGroup: string;
  materialType: string;
  name: string;
  customerFacingName: string | null;
  supplierName: string | null;
  sku: string | null;
  purchaseUom: string;
  stockUom: string;
  stockQuantity: string;
  purchaseCost: string;
  wastagePercent: string;
  showAsInstallationOption: boolean;
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
  gsm: string | null;
  priceCheckedAt: string | null;
  quoteVisualCategory: string | null;
  minimumBillableSheetFraction: string | null;
  rollBillingIncrementMetres: string | null;
};

function cleanMaterialManagerText(value: unknown, max = 200): string {
  return String(value ?? "").trim().slice(0, max);
}

function cleanMaterialManagerNumber(value: unknown, allowNull = false): string | null {
  const raw = String(value ?? "").trim().replace(/,/g, "").replace(/\$/g, "");
  if (!raw) return allowNull ? null : "0";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value '${raw}'.`);
  if (parsed < 0) throw new Error("Material quantities and costs cannot be negative.");
  return String(parsed);
}

function cleanMaterialManagerGroup(value: unknown): string {
  const raw = cleanMaterialManagerText(value, 50).toLowerCase().replace(/_/g, "-");
  return ["signage", "small-format", "plan-printing", "poster-printing", "shared"].includes(raw) ? raw : "shared";
}

function cleanMaterialManagerType(value: unknown): string {
  const normalized = normalizeMaterialType(cleanMaterialManagerText(value, 50).toLowerCase().replace(/-/g, "_"));
  return ["sheet_media", "roll_media", "roll_laminate", "card_stock", "paper_stock", "cello_stock", "binding", "finishing", "fixing", "item", "other"].includes(normalized) ? normalized : "other";
}

function cleanPriceCheckedDate(value: unknown): string | null {
  const raw = cleanMaterialManagerText(value, 20);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Price checked date '${raw}' must use YYYY-MM-DD.`);
  return raw;
}

function cleanQuoteVisualCategory(value: unknown): string | null {
  const raw = cleanMaterialManagerText(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  if (!raw) return null;
  return ["acrylic", "acm", "corflute", "pvc", "banner", "other_sheet"].includes(raw) ? raw : null;
}

export async function saveMaterialPriceManagerChanges(
  tenantId: string,
  changes: MaterialPriceManagerChange[]
): Promise<{ updatedIds: string[]; createdIds: string[]; placeholderSuppliers: number; hidden: number; archived: number; restored: number }> {
  await ensureMaterialPricingColumns();
  await ensureMaterialVisualColumns();
  if (!changes.length) return { updatedIds: [], createdIds: [], placeholderSuppliers: 0, hidden: 0, archived: 0, restored: 0 };
  if (changes.length > 500) throw new Error("Save up to 500 material changes at a time.");

  const client = await pool.connect();
  const updatedIds: string[] = [];
  const createdIds: string[] = [];
  const supplierCache = new Map<string, string | null>();
  let placeholderSuppliers = 0;
  let hidden = 0;
  let archived = 0;
  let restored = 0;

  async function supplierIdFor(nameValue: unknown): Promise<string | null> {
    const displayName = cleanMaterialManagerText(nameValue, 200);
    if (!displayName) return null;
    const key = displayName.toLowerCase().replace(/\s+/g, " ");
    if (supplierCache.has(key)) return supplierCache.get(key) ?? null;

    const existing = await client.query<{ id: string }>(`
      SELECT id
      FROM app.suppliers
      WHERE tenant_id=$1::uuid
        AND lower(trim(display_name))=lower(trim($2::text))
      ORDER BY created_at ASC
      LIMIT 2
    `, [tenantId, displayName]);
    if (existing.rows.length > 1) throw new Error(`Supplier '${displayName}' matches more than one PM supplier. Resolve the duplicate supplier names first.`);
    if (existing.rows[0]?.id) {
      supplierCache.set(key, existing.rows[0].id);
      return existing.rows[0].id;
    }

    const created = await client.query<{ id: string }>(`
      INSERT INTO app.suppliers (tenant_id,myob_uid,display_name,is_active,notes,payload_json,created_at,updated_at)
      VALUES ($1::uuid,null,$2::varchar,true,$3::text,jsonb_build_object('placeholder',true,'placeholderSource','material-price-manager'),now(),now())
      RETURNING id
    `, [tenantId, displayName, "Placeholder supplier created from Material Price Manager. Complete contact, purchasing and MYOB details before the first purchase order."]);
    const id = created.rows[0]?.id ?? null;
    if (!id) throw new Error(`Could not create placeholder supplier '${displayName}'.`);
    placeholderSuppliers += 1;
    supplierCache.set(key, id);
    return id;
  }

  try {
    await client.query("BEGIN");

    for (const rawChange of changes) {
      const action = String(rawChange.action ?? "KEEP").toUpperCase() as MaterialPriceManagerAction;
      if (!["KEEP", "ADD", "HIDE", "ARCHIVE", "RESTORE"].includes(action)) throw new Error("Invalid material action.");

      const name = cleanMaterialManagerText(rawChange.name, 200);
      if (!name) throw new Error("Every saved material row needs an internal material name.");
      const group = cleanMaterialManagerGroup(rawChange.materialGroup);
      const materialType = cleanMaterialManagerType(rawChange.materialType);
      const supplierId = await supplierIdFor(rawChange.supplierName);
      const purchaseUom = cleanMaterialManagerText(rawChange.purchaseUom, 20) || "unit";
      const stockUom = cleanMaterialManagerText(rawChange.stockUom, 20) || "unit";
      const stockQuantity = cleanMaterialManagerNumber(rawChange.stockQuantity) ?? "0";
      const purchaseCost = cleanMaterialManagerNumber(rawChange.purchaseCost) ?? "0";
      const wastagePercent = String(Math.max(0, Number(cleanMaterialManagerNumber(rawChange.wastagePercent) ?? "0") || 0));
      const showAsInstallationOption = rawChange.showAsInstallationOption === true;
      const widthMm = cleanMaterialManagerNumber(rawChange.widthMm, true);
      const lengthMm = cleanMaterialManagerNumber(rawChange.lengthMm, true);
      const rollWidthMm = cleanMaterialManagerNumber(rawChange.rollWidthMm, true);
      const gsm = cleanMaterialManagerNumber(rawChange.gsm, true);
      const priceCheckedAt = cleanPriceCheckedDate(rawChange.priceCheckedAt);
      const customerFacingName = cleanMaterialManagerText(rawChange.customerFacingName, 200) || null;
      const sku = cleanMaterialManagerText(rawChange.sku, 100) || null;
      const quoteVisualCategory = cleanQuoteVisualCategory(rawChange.quoteVisualCategory);
      const minimumBillableSheetFraction = cleanMaterialManagerNumber(rawChange.minimumBillableSheetFraction, true);
      const rollBillingIncrementMetres = cleanMaterialManagerNumber(rawChange.rollBillingIncrementMetres, true);

      if (!rawChange.id || action === "ADD") {
        const created = await client.query<{ id: string }>(`
          INSERT INTO catalog.materials (
            tenant_id,supplier_id,source_product_id,name,customer_facing_name,sku,type,material_type,material_group,
            minimum_billable_sheet_fraction,roll_billing_increment_metres,reverse_printable,used_for_backing,
            stock_uom,purchase_uom,stock_quantity,purchase_cost,width_mm,length_mm,roll_width_mm,gsm,quote_visual_category,notes,cost_json,active,created_at,updated_at
          ) VALUES (
            $1::uuid,$2::uuid,null,$3::varchar,$4::varchar,$5::varchar,$6::material_type,$7::varchar,$8::varchar,
            $21::numeric,$22::numeric,false,false,$9::varchar,$10::varchar,$11::numeric,$12::numeric,$14::numeric,$15::numeric,$16::numeric,$17::numeric,$20::varchar,null,
            jsonb_build_object('purchaseCost',$12::numeric,'wastagePercent',$13::numeric,'showAsInstallationOption',$19::boolean,'priceManagerSource','in-app')
              || CASE WHEN $18::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('priceCheckedAt',$18::text) END
              || CASE WHEN $20::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('quoteVisualCategory',$20::text) END,
            true,now(),now()
          )
          RETURNING id
        `, [tenantId, supplierId, name, customerFacingName, sku, toLegacyMaterialType(materialType), materialType, group, stockUom, purchaseUom, stockQuantity, purchaseCost, wastagePercent, widthMm, lengthMm, rollWidthMm, gsm, priceCheckedAt, showAsInstallationOption, quoteVisualCategory, minimumBillableSheetFraction, rollBillingIncrementMetres]);
        const id = created.rows[0]?.id;
        if (!id) throw new Error(`Could not add material '${name}'.`);
        createdIds.push(id);
        continue;
      }

      const result = await client.query<{ id: string }>(`
        UPDATE catalog.materials
        SET supplier_id=$3::uuid,
            name=$4::varchar,
            customer_facing_name=$5::varchar,
            sku=$6::varchar,
            type=$7::material_type,
            material_type=$8::varchar,
            material_group=$9::varchar,
            minimum_billable_sheet_fraction=$22::numeric,
            roll_billing_increment_metres=$23::numeric,
            stock_uom=$10::varchar,
            purchase_uom=$11::varchar,
            stock_quantity=$12::numeric,
            purchase_cost=$13::numeric,
            width_mm=$15::numeric,
            length_mm=$16::numeric,
            roll_width_mm=$17::numeric,
            gsm=$18::numeric,
            quote_visual_category=$21::varchar,
            cost_json=(COALESCE(cost_json,'{}'::jsonb)-'priceCheckedAt'-'quoteVisualCategory')
              || jsonb_build_object('purchaseCost',$13::numeric,'wastagePercent',$14::numeric,'showAsInstallationOption',$20::boolean,'priceManagerSource','in-app')
              || CASE WHEN $19::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('priceCheckedAt',$19::text) END
              || CASE WHEN $21::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('quoteVisualCategory',$21::text) END,
            updated_at=now()
        WHERE tenant_id=$1::uuid AND id=$2::uuid
        RETURNING id
      `, [tenantId, rawChange.id, supplierId, name, customerFacingName, sku, toLegacyMaterialType(materialType), materialType, group, stockUom, purchaseUom, stockQuantity, purchaseCost, wastagePercent, widthMm, lengthMm, rollWidthMm, gsm, priceCheckedAt, showAsInstallationOption, quoteVisualCategory, minimumBillableSheetFraction, rollBillingIncrementMetres]);
      if (!result.rows[0]?.id) throw new Error(`Material '${name}' no longer exists.`);
      updatedIds.push(rawChange.id);

      if (action === "HIDE" || action === "ARCHIVE") {
        await client.query(`
          UPDATE catalog.materials
          SET active=false,
              cost_json=COALESCE(cost_json,'{}'::jsonb)||jsonb_build_object('catalogSheetState',$3::text,'priceManagerSource','in-app'),
              updated_at=now()
          WHERE tenant_id=$1::uuid AND id=$2::uuid
        `, [tenantId, rawChange.id, action === "HIDE" ? "hidden" : "deleted"]);
        if (action === "HIDE") hidden += 1; else archived += 1;
      } else if (action === "RESTORE") {
        await client.query(`
          UPDATE catalog.materials
          SET active=true,
              cost_json=(COALESCE(cost_json,'{}'::jsonb)-'catalogSheetState')||jsonb_build_object('priceManagerSource','in-app'),
              updated_at=now()
          WHERE tenant_id=$1::uuid AND id=$2::uuid
        `, [tenantId, rawChange.id]);
        restored += 1;
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  return {
    updatedIds: [...new Set(updatedIds)],
    createdIds: [...new Set(createdIds)],
    placeholderSuppliers,
    hidden,
    archived,
    restored
  };
}
