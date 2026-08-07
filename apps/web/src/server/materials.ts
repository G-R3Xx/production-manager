import "server-only";

import { pool } from "@production-manager/db";

export type MaterialRecord = {
  id: string;
  tenantId: string;
  supplierId: string | null;
  sourceProductId: string | null;
  supplierName: string | null;
  sourceProductName: string | null;
  name: string;
  customerFacingName: string | null;
  sku: string | null;
  materialType: string;
  materialGroup: string | null;
  minimumBillableSheetFraction: string | null;
  rollBillingIncrementMetres: string | null;
  stockUom: string;
  purchaseUom: string;
  stockQuantity: string;
  purchaseCost: string;
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
  gsm: string | null;
  notes: string | null;
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
  name: string;
  customerFacingName: string | null;
  sku: string | null;
  materialType: string;
  materialGroup: string | null;
  minimumBillableSheetFraction: string | null;
  rollBillingIncrementMetres: string | null;
  stockUom: string;
  purchaseUom: string;
  stockQuantity: string;
  purchaseCost: string;
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
  gsm: string | null;
  notes: string | null;
};

export type UpdateMaterialInput = CreateMaterialInput & {
  id: string;
};

export async function ensureMaterialPricingColumns(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  await pool.query(`
    ALTER TABLE catalog.materials
      ADD COLUMN IF NOT EXISTS material_group varchar(50),
      ADD COLUMN IF NOT EXISTS minimum_billable_sheet_fraction numeric(6, 4),
      ADD COLUMN IF NOT EXISTS roll_billing_increment_metres numeric(6, 4),
      ADD COLUMN IF NOT EXISTS customer_facing_name varchar(200)
  `);
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

export async function listMaterialsForTenant(tenantId: string): Promise<MaterialRecord[]> {
  await ensureMaterialPricingColumns();
  const result = await pool.query<MaterialRecord>(`
    SELECT
      m.id,
      m.tenant_id AS "tenantId",
      m.supplier_id AS "supplierId",
      m.source_product_id AS "sourceProductId",
      s.display_name AS "supplierName",
      p.name AS "sourceProductName",
      m.name,
      m.customer_facing_name AS "customerFacingName",
      m.sku,
      CASE
        WHEN m.material_type IS NOT NULL THEN m.material_type::text
        ELSE m.type::text
      END AS "materialType",
      m.material_group AS "materialGroup",
      m.minimum_billable_sheet_fraction::text AS "minimumBillableSheetFraction",
      m.roll_billing_increment_metres::text AS "rollBillingIncrementMetres",
      m.stock_uom AS "stockUom",
      m.purchase_uom AS "purchaseUom",
      m.stock_quantity::text AS "stockQuantity",
      m.purchase_cost::text AS "purchaseCost",
      m.width_mm::text AS "widthMm",
      m.length_mm::text AS "lengthMm",
      m.roll_width_mm::text AS "rollWidthMm",
      m.gsm::text AS gsm,
      m.notes,
      m.active,
      m.created_at AS "createdAt",
      m.updated_at AS "updatedAt"
    FROM catalog.materials m
    LEFT JOIN app.suppliers s ON s.id = m.supplier_id
    LEFT JOIN catalog.products p ON p.id = m.source_product_id
    WHERE m.tenant_id = $1::uuid
    ORDER BY m.name ASC, m.created_at DESC
  `, [tenantId]);

  return result.rows.map((row) => ({ ...row, materialType: presentMaterialType(row.materialType) }));
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

export async function createMaterial(input: CreateMaterialInput): Promise<void> {
  await ensureMaterialPricingColumns();

  await pool.query(`
    INSERT INTO catalog.materials (
      tenant_id,
      supplier_id,
      source_product_id,
      name,
      customer_facing_name,
      sku,
      type,
      material_type,
      material_group,
      minimum_billable_sheet_fraction,
      roll_billing_increment_metres,
      stock_uom,
      purchase_uom,
      stock_quantity,
      purchase_cost,
      width_mm,
      length_mm,
      roll_width_mm,
      gsm,
      notes,
      active,
      created_at,
      updated_at
    ) VALUES (
      $1::uuid,
      $2::uuid,
      $3::uuid,
      $4::varchar,
      $5::varchar,
      $6::varchar,
      $7::material_type,
      $8::varchar,
      $9::varchar,
      $10::numeric,
      $11::numeric,
      $12::varchar,
      $13::varchar,
      $14::numeric,
      $15::numeric,
      $16::numeric,
      $17::numeric,
      $18::numeric,
      $19::numeric,
      $20::varchar,
      true,
      now(),
      now()
    )
  `, [
    input.tenantId,
    input.supplierId,
    input.sourceProductId,
    input.name,
    input.customerFacingName,
    input.sku,
    toLegacyMaterialType(input.materialType),
    normalizeMaterialType(input.materialType),
    input.materialGroup,
    input.minimumBillableSheetFraction,
    input.rollBillingIncrementMetres,
    input.stockUom,
    input.purchaseUom,
    input.stockQuantity,
    input.purchaseCost,
    input.widthMm,
    input.lengthMm,
    input.rollWidthMm,
    input.gsm,
    input.notes
  ]);
}

export async function updateMaterial(input: UpdateMaterialInput): Promise<void> {
  await ensureMaterialPricingColumns();

  await pool.query(`
    UPDATE catalog.materials
    SET
      supplier_id = $3::uuid,
      source_product_id = $4::uuid,
      name = $5::varchar,
      customer_facing_name = $6::varchar,
      sku = $7::varchar,
      type = $8::material_type,
      material_type = $9::varchar,
      material_group = $10::varchar,
      minimum_billable_sheet_fraction = $11::numeric,
      roll_billing_increment_metres = $12::numeric,
      stock_uom = $13::varchar,
      purchase_uom = $14::varchar,
      stock_quantity = $15::numeric,
      purchase_cost = $16::numeric,
      width_mm = $17::numeric,
      length_mm = $18::numeric,
      roll_width_mm = $19::numeric,
      gsm = $20::numeric,
      notes = $21::varchar,
      updated_at = now()
    WHERE id = $1::uuid
      AND tenant_id = $2::uuid
  `, [
    input.id,
    input.tenantId,
    input.supplierId,
    input.sourceProductId,
    input.name,
    input.customerFacingName,
    input.sku,
    toLegacyMaterialType(input.materialType),
    normalizeMaterialType(input.materialType),
    input.materialGroup,
    input.minimumBillableSheetFraction,
    input.rollBillingIncrementMetres,
    input.stockUom,
    input.purchaseUom,
    input.stockQuantity,
    input.purchaseCost,
    input.widthMm,
    input.lengthMm,
    input.rollWidthMm,
    input.gsm,
    input.notes
  ]);
}

export async function setMaterialActive(tenantId: string, materialId: string, active: boolean): Promise<void> {
  await pool.query(`
    UPDATE catalog.materials
    SET active = $3::boolean,
        updated_at = now()
    WHERE id = $1::uuid
      AND tenant_id = $2::uuid
  `, [materialId, tenantId, active]);
}
