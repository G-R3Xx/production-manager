import "server-only";

import { pool } from "@production-manager/db";

export type LabourRateRecord = {
  id: string; tenantId: string; name: string; unit: string; costRate: string; sellRate: string; active: boolean; createdAt: string; updatedAt: string;
};
export type ProductRecipeRecord = {
  id: string; tenantId: string; productId: string; productName: string | null; name: string; version: number; status: string; yieldQty: string; yieldUom: string; notes: string | null; createdAt: string; updatedAt: string; componentCount: number;
};
export type ProductRecipeComponentRecord = {
  id: string; tenantId: string; recipeId: string; sortOrder: number; componentType: string; materialId: string | null; labourRateId: string | null; supplierId: string | null; name: string; qty: string; uom: string; wastePercent: string; costOverride: string | null; notes: string | null; createdAt: string; updatedAt: string;
};

export async function listLabourRatesForTenant(tenantId: string): Promise<LabourRateRecord[]> {
  const result = await pool.query<LabourRateRecord>(`
    SELECT id, tenant_id AS "tenantId", name, unit, cost_rate::text AS "costRate", sell_rate::text AS "sellRate", active, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM catalog.labour_rates WHERE tenant_id = $1::uuid ORDER BY name ASC
  `,[tenantId]);
  return result.rows;
}

export async function createLabourRate(input: { tenantId: string; name: string; unit: string; costRate: string; sellRate: string; }): Promise<void> {
  await pool.query(`
    INSERT INTO catalog.labour_rates (tenant_id, name, unit, cost_rate, sell_rate, active, created_at, updated_at)
    VALUES ($1::uuid,$2::varchar,$3::labour_unit,$4::numeric,$5::numeric,true,now(),now())
  `,[input.tenantId, input.name, input.unit, input.costRate, input.sellRate]);
}

export async function listProductRecipesForTenant(tenantId: string): Promise<ProductRecipeRecord[]> {
  const result = await pool.query<ProductRecipeRecord>(`
    SELECT r.id, r.tenant_id AS "tenantId", r.product_id AS "productId", p.name AS "productName", r.name, r.version, r.status, r.yield_qty::text AS "yieldQty", r.yield_uom AS "yieldUom", r.notes, r.created_at AS "createdAt", r.updated_at AS "updatedAt", count(c.id)::int AS "componentCount"
    FROM catalog.product_recipes r
    LEFT JOIN catalog.products p ON p.id = r.product_id
    LEFT JOIN catalog.product_recipe_components c ON c.recipe_id = r.id
    WHERE r.tenant_id = $1::uuid
    GROUP BY r.id, p.name
    ORDER BY r.created_at DESC
  `,[tenantId]);
  return result.rows;
}

export async function listRecipeComponents(recipeId: string): Promise<ProductRecipeComponentRecord[]> {
  const result = await pool.query<ProductRecipeComponentRecord>(`
    SELECT id, tenant_id AS "tenantId", recipe_id AS "recipeId", sort_order AS "sortOrder", component_type AS "componentType", material_id AS "materialId", labour_rate_id AS "labourRateId", supplier_id AS "supplierId", name, qty::text AS qty, uom, waste_percent::text AS "wastePercent", cost_override::text AS "costOverride", notes, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM catalog.product_recipe_components
    WHERE recipe_id = $1::uuid
    ORDER BY sort_order ASC, created_at ASC
  `,[recipeId]);
  return result.rows;
}

export async function createProductRecipe(input: { tenantId: string; productId: string; name: string; yieldQty: string; yieldUom: string; notes: string | null; }): Promise<void> {
  await pool.query(`
    INSERT INTO catalog.product_recipes (tenant_id, product_id, name, version, status, yield_qty, yield_uom, notes, created_at, updated_at)
    VALUES ($1::uuid,$2::uuid,$3::varchar,1,'draft'::recipe_status,$4::numeric,$5::varchar,$6::varchar,now(),now())
  `,[input.tenantId, input.productId, input.name, input.yieldQty, input.yieldUom, input.notes]);
}

export async function addRecipeComponent(input: { tenantId: string; recipeId: string; componentType: string; materialId: string | null; labourRateId: string | null; supplierId: string | null; name: string; qty: string; uom: string; wastePercent: string; costOverride: string | null; notes: string | null; }): Promise<void> {
  const sortResult = await pool.query<{ nextSort: number }>(`SELECT coalesce(max(sort_order), -1) + 1 AS "nextSort" FROM catalog.product_recipe_components WHERE recipe_id = $1::uuid`,[input.recipeId]);
  const nextSort = sortResult.rows[0]?.nextSort ?? 0;
  await pool.query(`
    INSERT INTO catalog.product_recipe_components (tenant_id, recipe_id, sort_order, component_type, material_id, labour_rate_id, supplier_id, name, qty, uom, waste_percent, cost_override, notes, created_at, updated_at)
    VALUES ($1::uuid,$2::uuid,$3::int,$4::recipe_component_type,$5::uuid,$6::uuid,$7::uuid,$8::varchar,$9::numeric,$10::varchar,$11::numeric,$12::numeric,$13::varchar,now(),now())
  `,[input.tenantId, input.recipeId, nextSort, input.componentType, input.materialId, input.labourRateId, input.supplierId, input.name, input.qty, input.uom, input.wastePercent, input.costOverride, input.notes]);
}
