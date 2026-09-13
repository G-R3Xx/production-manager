import "server-only";

import { pool } from "@production-manager/db";
import { relationHasColumns } from "@/server/schema-readiness";

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
  notes: string | null;
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
  name: string;
  customerFacingName: string | null;
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
  notes: string | null;
};

export type UpdateMaterialInput = CreateMaterialInput & {
  id: string;
};

let materialPricingSchemaReady = false;
let materialPricingSchemaPromise: Promise<void> | null = null;

export async function ensureMaterialPricingColumns(): Promise<void> {
  if (!process.env.DATABASE_URL || materialPricingSchemaReady) return;
  if (materialPricingSchemaPromise) return materialPricingSchemaPromise;
  materialPricingSchemaPromise = (async () => {
    if (await relationHasColumns("catalog.materials", [
      "material_group", "minimum_billable_sheet_fraction", "roll_billing_increment_metres",
      "reverse_printable", "used_for_backing", "customer_facing_name", "myob_uid",
      "myob_display_id", "myob_sync_state", "myob_payload_json"
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
      ADD COLUMN IF NOT EXISTS myob_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
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
      COALESCE(m.reverse_printable, false) AS "reversePrintable",
      COALESCE(m.used_for_backing, false) AS "usedForBacking",
      m.stock_uom AS "stockUom",
      m.purchase_uom AS "purchaseUom",
      m.stock_quantity::text AS "stockQuantity",
      m.purchase_cost::text AS "purchaseCost",
      m.width_mm::text AS "widthMm",
      m.length_mm::text AS "lengthMm",
      m.roll_width_mm::text AS "rollWidthMm",
      m.gsm::text AS gsm,
      m.notes,
      m.cost_json AS "costJson",
      m.myob_uid AS "myobUid",
      m.myob_display_id AS "myobDisplayId",
      m.myob_sync_state AS "myobSyncState",
      m.myob_payload_json AS "myobPayloadJson",
      m.active,
      m.created_at AS "createdAt",
      m.updated_at AS "updatedAt"
    FROM catalog.materials m
    LEFT JOIN app.suppliers s ON s.id = m.supplier_id
    LEFT JOIN catalog.products p ON p.id = m.source_product_id
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

export async function createMaterial(input: CreateMaterialInput): Promise<{ id: string }> {
  await ensureMaterialPricingColumns();

  const result = await pool.query<{ id: string }>(`
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
      reverse_printable,
      used_for_backing,
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
      $12::boolean,
      $13::boolean,
      $14::varchar,
      $15::varchar,
      $16::numeric,
      $17::numeric,
      $18::numeric,
      $19::numeric,
      $20::numeric,
      $21::numeric,
      $22::varchar,
      true,
      now(),
      now()
    )
    RETURNING id
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
    input.reversePrintable,
    input.usedForBacking,
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
  return result.rows[0];
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
      reverse_printable = $13::boolean,
      used_for_backing = $14::boolean,
      stock_uom = $15::varchar,
      purchase_uom = $16::varchar,
      stock_quantity = $17::numeric,
      purchase_cost = $18::numeric,
      cost_json = COALESCE(cost_json, '{}'::jsonb) || jsonb_build_object('purchaseCost', $18::numeric),
      width_mm = $19::numeric,
      length_mm = $20::numeric,
      roll_width_mm = $21::numeric,
      gsm = $22::numeric,
      notes = $23::varchar,
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
    input.reversePrintable,
    input.usedForBacking,
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


export async function getMaterialById(tenantId: string, materialId: string | null | undefined): Promise<MaterialRecord | null> {
  if (!materialId) return null;
  const rows = await listMaterialsForTenant(tenantId);
  return rows.find((row) => row.id === materialId) ?? null;
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
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
  gsm: string | null;
  priceCheckedAt: string | null;
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

export async function saveMaterialPriceManagerChanges(
  tenantId: string,
  changes: MaterialPriceManagerChange[]
): Promise<{ updatedIds: string[]; createdIds: string[]; placeholderSuppliers: number; hidden: number; archived: number; restored: number }> {
  await ensureMaterialPricingColumns();
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
      const widthMm = cleanMaterialManagerNumber(rawChange.widthMm, true);
      const lengthMm = cleanMaterialManagerNumber(rawChange.lengthMm, true);
      const rollWidthMm = cleanMaterialManagerNumber(rawChange.rollWidthMm, true);
      const gsm = cleanMaterialManagerNumber(rawChange.gsm, true);
      const priceCheckedAt = cleanPriceCheckedDate(rawChange.priceCheckedAt);
      const customerFacingName = cleanMaterialManagerText(rawChange.customerFacingName, 200) || null;
      const sku = cleanMaterialManagerText(rawChange.sku, 100) || null;

      if (!rawChange.id || action === "ADD") {
        const created = await client.query<{ id: string }>(`
          INSERT INTO catalog.materials (
            tenant_id,supplier_id,source_product_id,name,customer_facing_name,sku,type,material_type,material_group,
            minimum_billable_sheet_fraction,roll_billing_increment_metres,reverse_printable,used_for_backing,
            stock_uom,purchase_uom,stock_quantity,purchase_cost,width_mm,length_mm,roll_width_mm,gsm,notes,cost_json,active,created_at,updated_at
          ) VALUES (
            $1::uuid,$2::uuid,null,$3::varchar,$4::varchar,$5::varchar,$6::material_type,$7::varchar,$8::varchar,
            null,null,false,false,$9::varchar,$10::varchar,$11::numeric,$12::numeric,$13::numeric,$14::numeric,$15::numeric,$16::numeric,null,
            jsonb_build_object('purchaseCost',$12::numeric,'priceManagerSource','in-app') || CASE WHEN $17::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('priceCheckedAt',$17::text) END,
            true,now(),now()
          )
          RETURNING id
        `, [tenantId, supplierId, name, customerFacingName, sku, toLegacyMaterialType(materialType), materialType, group, stockUom, purchaseUom, stockQuantity, purchaseCost, widthMm, lengthMm, rollWidthMm, gsm, priceCheckedAt]);
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
            stock_uom=$10::varchar,
            purchase_uom=$11::varchar,
            stock_quantity=$12::numeric,
            purchase_cost=$13::numeric,
            width_mm=$14::numeric,
            length_mm=$15::numeric,
            roll_width_mm=$16::numeric,
            gsm=$17::numeric,
            cost_json=(COALESCE(cost_json,'{}'::jsonb)-'priceCheckedAt')
              || jsonb_build_object('purchaseCost',$13::numeric,'priceManagerSource','in-app')
              || CASE WHEN $18::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('priceCheckedAt',$18::text) END,
            updated_at=now()
        WHERE tenant_id=$1::uuid AND id=$2::uuid
        RETURNING id
      `, [tenantId, rawChange.id, supplierId, name, customerFacingName, sku, toLegacyMaterialType(materialType), materialType, group, stockUom, purchaseUom, stockQuantity, purchaseCost, widthMm, lengthMm, rollWidthMm, gsm, priceCheckedAt]);
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
