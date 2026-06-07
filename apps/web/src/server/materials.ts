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
  sku: string | null;
  materialType: string;
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

export type CreateMaterialInput = {
  tenantId: string;
  supplierId: string | null;
  sourceProductId: string | null;
  name: string;
  sku: string | null;
  materialType: string;
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

export async function listMaterialsForTenant(tenantId: string): Promise<MaterialRecord[]> {
  const result = await pool.query<MaterialRecord>(`
    SELECT
      m.id,
      m.tenant_id AS "tenantId",
      m.supplier_id AS "supplierId",
      m.source_product_id AS "sourceProductId",
      s.display_name AS "supplierName",
      p.name AS "sourceProductName",
      m.name,
      m.sku,
      CASE
        WHEN m.material_type IS NOT NULL THEN m.material_type::text
        ELSE m.type::text
      END AS "materialType",
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

  return result.rows;
}

export async function createMaterial(input: CreateMaterialInput): Promise<void> {
  await pool.query(`
    INSERT INTO catalog.materials (
      tenant_id,
      supplier_id,
      source_product_id,
      name,
      sku,
      type,
      material_type,
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
      NULL,
      $7::varchar,
      $8::varchar,
      $9::numeric,
      $10::numeric,
      $11::numeric,
      $12::numeric,
      $13::numeric,
      $14::numeric,
      $15::varchar,
      true,
      now(),
      now()
    )
  `, [
    input.tenantId,
    input.supplierId,
    input.sourceProductId,
    input.name,
    input.sku,
    input.materialType,
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
