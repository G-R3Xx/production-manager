import { pool } from "@production-manager/db";
import { cache } from "react";
import { calculateProductionRecipeCost } from "@production-manager/domain";
import { normalizeProductionFlowName, productionFlowPresets } from "@/lib/productionFlowPresets";

type DbClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

export type ProcessRecord = {
  id: string;
  name: string;
  department: string;
  processType: string;
  labourOperationId: string | null;
  labourOperationName: string | null;
  active: boolean;
};

export type MachineRecord = {
  id: string;
  name: string;
  machineType: string;
  maxWidthMm: string | null;
  speedValue: string;
  speedUom: string;
  hourlyCost: string;
  setupMinutes: string;
  inkCostPerSqm: string;
  processIds: string[];
  active: boolean;
};

export type LabourRecord = {
  id: string;
  name: string;
  department: string;
  hourlyRate: string;
  calculationBasis: string;
  calculationValue: string;
  minimumMinutes: string;
  active: boolean;
};

export type RecipeProcessStep = {
  processId: string;
  machineId: string | null;
  labourOperationId: string | null;
};

export type RecipeRecord = {
  id: string;
  name: string;
  department: string;
  materialId: string | null;
  materialName: string | null;
  processIds: string[];
  processNames: string[];
  processSteps: RecipeProcessStep[];
  wastePercent: string;
  markupMultiplier: string;
  profitMultiplier: string;
  active: boolean;
};

type MachineInput = Omit<MachineRecord, "id" | "active"> & { tenantId: string };
type LabourInput = Omit<LabourRecord, "id" | "active"> & { tenantId: string };
type ProcessInput = {
  tenantId: string;
  name: string;
  department: string;
  processType: string;
  labourOperationId: string | null;
};
type RecipeInput = {
  tenantId: string;
  name: string;
  department: string;
  materialId: string | null;
  processIds: string[];
  processSteps?: RecipeProcessStep[];
  wastePercent: string;
  markupMultiplier: string;
  profitMultiplier: string;
};

export type ProductProductionFlowStepInput = {
  processToken: string;
  machineId: string | null;
  labourOperationId: string | null;
};

async function loadProcessesForTenant(tenantId: string): Promise<ProcessRecord[]> {
  const result = await pool.query<ProcessRecord>(`
    SELECT
      p.id::text,
      p.name,
      p.department,
      p.process_type AS "processType",
      p.labour_operation_id::text AS "labourOperationId",
      l.name AS "labourOperationName",
      p.active
    FROM catalog.processes p
    LEFT JOIN catalog.labour_operations l ON l.id = p.labour_operation_id
    WHERE p.tenant_id = $1::uuid
    ORDER BY p.active DESC, p.name
  `, [tenantId]);
  return result.rows;
}

export const listProcessesForTenant = cache(loadProcessesForTenant);

export async function createProcess(input: ProcessInput): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(`
    INSERT INTO catalog.processes (
      tenant_id,
      name,
      department,
      process_type,
      labour_operation_id
    ) VALUES ($1::uuid, $2, $3, $4, NULLIF($5, '')::uuid)
    RETURNING id::text
  `, [input.tenantId, input.name, input.department, input.processType, input.labourOperationId ?? ""]);
  return result.rows[0] ?? { id: "" };
}

export async function updateProcess(input: ProcessInput & { id: string }): Promise<void> {
  await pool.query(`
    UPDATE catalog.processes
    SET name = $3,
        department = $4,
        process_type = $5,
        labour_operation_id = NULLIF($6, '')::uuid,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [input.tenantId, input.id, input.name, input.department, input.processType, input.labourOperationId ?? ""]);
}

export async function setProcessActive(tenantId: string, id: string, active: boolean): Promise<void> {
  await pool.query(`
    UPDATE catalog.processes
    SET active = $3, updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, id, active]);
}

async function loadMachinesForTenant(tenantId: string): Promise<MachineRecord[]> {
  const result = await pool.query<MachineRecord>(`
    SELECT
      m.id::text,
      m.name,
      m.machine_type AS "machineType",
      m.max_width_mm::text AS "maxWidthMm",
      m.speed_value::text AS "speedValue",
      m.speed_uom AS "speedUom",
      m.hourly_cost::text AS "hourlyCost",
      m.setup_minutes::text AS "setupMinutes",
      m.ink_cost_per_sqm::text AS "inkCostPerSqm",
      m.active,
      COALESCE(
        jsonb_agg(mp.process_id::text) FILTER (WHERE mp.process_id IS NOT NULL),
        '[]'::jsonb
      ) AS "processIds"
    FROM catalog.machines m
    LEFT JOIN catalog.machine_processes mp ON mp.machine_id = m.id
    WHERE m.tenant_id = $1::uuid
    GROUP BY m.id
    ORDER BY m.active DESC, m.name
  `, [tenantId]);
  return result.rows.map((row) => ({
    ...row,
    processIds: Array.isArray(row.processIds) ? row.processIds : []
  }));
}

export const listMachinesForTenant = cache(loadMachinesForTenant);

async function replaceMachineProcesses(
  client: DbClient,
  tenantId: string,
  machineId: string,
  processIds: string[]
): Promise<void> {
  await client.query(`
    DELETE FROM catalog.machine_processes
    WHERE tenant_id = $1::uuid AND machine_id = $2::uuid
  `, [tenantId, machineId]);

  for (let index = 0; index < processIds.length; index += 1) {
    await client.query(`
      INSERT INTO catalog.machine_processes (tenant_id, machine_id, process_id, priority)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
    `, [tenantId, machineId, processIds[index], index + 1]);
  }
}

export async function createMachine(input: MachineInput): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>(`
      INSERT INTO catalog.machines (
        tenant_id,
        name,
        machine_type,
        max_width_mm,
        speed_value,
        speed_uom,
        hourly_cost,
        setup_minutes,
        ink_cost_per_sqm
      ) VALUES ($1::uuid, $2, $3, NULLIF($4, '')::numeric, $5::numeric, $6, $7::numeric, $8::numeric, $9::numeric)
      RETURNING id::text
    `, [
      input.tenantId,
      input.name,
      input.machineType,
      input.maxWidthMm ?? "",
      input.speedValue,
      input.speedUom,
      input.hourlyCost,
      input.setupMinutes,
      input.inkCostPerSqm
    ]);
    await replaceMachineProcesses(client, input.tenantId, result.rows[0]?.id ?? "", input.processIds);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateMachine(input: MachineInput & { id: string }): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      UPDATE catalog.machines
      SET name = $3,
          machine_type = $4,
          max_width_mm = NULLIF($5, '')::numeric,
          speed_value = $6::numeric,
          speed_uom = $7,
          hourly_cost = $8::numeric,
          setup_minutes = $9::numeric,
          ink_cost_per_sqm = $10::numeric,
          updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid
    `, [
      input.tenantId,
      input.id,
      input.name,
      input.machineType,
      input.maxWidthMm ?? "",
      input.speedValue,
      input.speedUom,
      input.hourlyCost,
      input.setupMinutes,
      input.inkCostPerSqm
    ]);
    await replaceMachineProcesses(client, input.tenantId, input.id, input.processIds);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setMachineActive(tenantId: string, id: string, active: boolean): Promise<void> {
  await pool.query(`
    UPDATE catalog.machines
    SET active = $3, updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, id, active]);
}

async function loadLabourForTenant(tenantId: string): Promise<LabourRecord[]> {
  const result = await pool.query<LabourRecord>(`
    SELECT
      id::text,
      name,
      department,
      hourly_rate::text AS "hourlyRate",
      calculation_basis AS "calculationBasis",
      calculation_value::text AS "calculationValue",
      minimum_minutes::text AS "minimumMinutes",
      active
    FROM catalog.labour_operations
    WHERE tenant_id = $1::uuid
    ORDER BY active DESC, name
  `, [tenantId]);
  return result.rows;
}

export const listLabourForTenant = cache(loadLabourForTenant);

export async function createLabour(input: LabourInput): Promise<void> {
  await pool.query(`
    INSERT INTO catalog.labour_operations (
      tenant_id,
      name,
      department,
      hourly_rate,
      calculation_basis,
      calculation_value,
      minimum_minutes
    ) VALUES ($1::uuid, $2, $3, $4::numeric, $5, $6::numeric, $7::numeric)
  `, [
    input.tenantId,
    input.name,
    input.department,
    input.hourlyRate,
    input.calculationBasis,
    input.calculationValue,
    input.minimumMinutes
  ]);
}

export async function updateLabour(input: LabourInput & { id: string }): Promise<void> {
  await pool.query(`
    UPDATE catalog.labour_operations
    SET name = $3,
        department = $4,
        hourly_rate = $5::numeric,
        calculation_basis = $6,
        calculation_value = $7::numeric,
        minimum_minutes = $8::numeric,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [
    input.tenantId,
    input.id,
    input.name,
    input.department,
    input.hourlyRate,
    input.calculationBasis,
    input.calculationValue,
    input.minimumMinutes
  ]);
}

export async function setLabourActive(tenantId: string, id: string, active: boolean): Promise<void> {
  await pool.query(`
    UPDATE catalog.labour_operations
    SET active = $3, updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, id, active]);
}

function normalizeRecipeProcessSteps(value: unknown): RecipeProcessStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const processId = String(row.processId ?? "").trim();
    if (!processId) return [];
    return [{
      processId,
      machineId: String(row.machineId ?? "").trim() || null,
      labourOperationId: String(row.labourOperationId ?? "").trim() || null
    }];
  });
}

async function loadRecipesForTenant(tenantId: string): Promise<RecipeRecord[]> {
  const result = await pool.query<RecipeRecord>(`
    SELECT
      r.id::text,
      r.name,
      r.department,
      r.material_id::text AS "materialId",
      m.name AS "materialName",
      r.waste_percent::text AS "wastePercent",
      r.markup_multiplier::text AS "markupMultiplier",
      r.profit_multiplier::text AS "profitMultiplier",
      r.active,
      COALESCE(
        jsonb_agg(rp.process_id::text ORDER BY rp.position) FILTER (WHERE rp.process_id IS NOT NULL),
        '[]'::jsonb
      ) AS "processIds",
      COALESCE(
        jsonb_agg(p.name ORDER BY rp.position) FILTER (WHERE p.id IS NOT NULL),
        '[]'::jsonb
      ) AS "processNames",
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'processId', rp.process_id::text,
            'machineId', NULLIF(rp.settings_json ->> 'machineId', ''),
            'labourOperationId', NULLIF(rp.settings_json ->> 'labourOperationId', '')
          ) ORDER BY rp.position
        ) FILTER (WHERE rp.process_id IS NOT NULL),
        '[]'::jsonb
      ) AS "processSteps"
    FROM catalog.production_recipes r
    LEFT JOIN catalog.materials m ON m.id = r.material_id
    LEFT JOIN catalog.recipe_processes rp ON rp.recipe_id = r.id
    LEFT JOIN catalog.processes p ON p.id = rp.process_id
    WHERE r.tenant_id = $1::uuid
    GROUP BY r.id, m.name
    ORDER BY r.active DESC, r.name
  `, [tenantId]);

  return result.rows.map((row) => ({
    ...row,
    processIds: Array.isArray(row.processIds) ? row.processIds : [],
    processNames: Array.isArray(row.processNames) ? row.processNames : [],
    processSteps: normalizeRecipeProcessSteps(row.processSteps)
  }));
}

export const listRecipesForTenant = cache(loadRecipesForTenant);

async function replaceRecipeProcesses(
  client: DbClient,
  tenantId: string,
  recipeId: string,
  steps: RecipeProcessStep[]
): Promise<void> {
  await client.query(`
    DELETE FROM catalog.recipe_processes
    WHERE tenant_id = $1::uuid AND recipe_id = $2::uuid
  `, [tenantId, recipeId]);

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    await client.query(`
      INSERT INTO catalog.recipe_processes (
        tenant_id,
        recipe_id,
        process_id,
        position,
        settings_json
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb)
    `, [
      tenantId,
      recipeId,
      step.processId,
      index,
      JSON.stringify({
        machineId: step.machineId,
        labourOperationId: step.labourOperationId
      })
    ]);
  }
}

function recipeStepsFromInput(input: RecipeInput): RecipeProcessStep[] {
  if (input.processSteps?.length) return input.processSteps;
  return input.processIds.map((processId) => ({
    processId,
    machineId: null,
    labourOperationId: null
  }));
}

export async function createRecipe(input: RecipeInput): Promise<{ id: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>(`
      INSERT INTO catalog.production_recipes (
        tenant_id,
        name,
        department,
        material_id,
        waste_percent,
        markup_multiplier,
        profit_multiplier
      ) VALUES ($1::uuid, $2, $3, NULLIF($4, '')::uuid, $5::numeric, $6::numeric, $7::numeric)
      RETURNING id::text
    `, [
      input.tenantId,
      input.name,
      input.department,
      input.materialId ?? "",
      input.wastePercent,
      input.markupMultiplier,
      input.profitMultiplier
    ]);
    const id = result.rows[0]?.id ?? "";
    await replaceRecipeProcesses(client, input.tenantId, id, recipeStepsFromInput(input));
    await client.query("COMMIT");
    return { id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateRecipe(input: RecipeInput & { id: string }): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      UPDATE catalog.production_recipes
      SET name = $3,
          department = $4,
          material_id = NULLIF($5, '')::uuid,
          waste_percent = $6::numeric,
          markup_multiplier = $7::numeric,
          profit_multiplier = $8::numeric,
          updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid
    `, [
      input.tenantId,
      input.id,
      input.name,
      input.department,
      input.materialId ?? "",
      input.wastePercent,
      input.markupMultiplier,
      input.profitMultiplier
    ]);
    await replaceRecipeProcesses(client, input.tenantId, input.id, recipeStepsFromInput(input));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setRecipeActive(tenantId: string, id: string, active: boolean): Promise<void> {
  await pool.query(`
    UPDATE catalog.production_recipes
    SET active = $3, updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, id, active]);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveProductFlowProcess(
  client: DbClient,
  tenantId: string,
  department: string,
  processToken: string
): Promise<string> {
  if (isUuid(processToken)) {
    const existing = await client.query(`
      SELECT id::text
      FROM catalog.processes
      WHERE tenant_id = $1::uuid AND id = $2::uuid AND active = true
      LIMIT 1
    `, [tenantId, processToken]);
    const row = existing.rows[0] as { id?: string } | undefined;
    if (!row?.id) throw new Error("A selected production action is no longer available.");
    return row.id;
  }

  const presetKey = processToken.replace(/^preset:/, "");
  const preset = productionFlowPresets.find((item) => item.key === presetKey);
  if (!preset) throw new Error("A selected production action is invalid.");

  const existing = await client.query(`
    SELECT id::text
    FROM catalog.processes
    WHERE tenant_id = $1::uuid
      AND lower(regexp_replace(name, '[^a-zA-Z0-9]+', ' ', 'g')) = lower($2)
    ORDER BY active DESC, created_at ASC
    LIMIT 1
  `, [tenantId, normalizeProductionFlowName(preset.name)]);

  const existingRow = existing.rows[0] as { id?: string } | undefined;
  if (existingRow?.id) {
    await client.query(`
      UPDATE catalog.processes
      SET active = true, updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid
    `, [tenantId, existingRow.id]);
    return existingRow.id;
  }

  const created = await client.query(`
    INSERT INTO catalog.processes (
      tenant_id,
      name,
      department,
      process_type,
      labour_operation_id
    ) VALUES ($1::uuid, $2, $3, $4, NULL)
    RETURNING id::text
  `, [tenantId, preset.name, department || "general", preset.processType]);

  return (created.rows[0] as { id?: string } | undefined)?.id ?? "";
}

async function validateOptionalResource(
  client: DbClient,
  table: "machines" | "labour_operations",
  tenantId: string,
  id: string | null
): Promise<string | null> {
  if (!id) return null;
  if (!isUuid(id)) throw new Error("A selected costing resource is invalid.");
  const result = await client.query(`
    SELECT id::text
    FROM catalog.${table}
    WHERE tenant_id = $1::uuid AND id = $2::uuid AND active = true
    LIMIT 1
  `, [tenantId, id]);
  const row = result.rows[0] as { id?: string } | undefined;
  if (!row?.id) throw new Error("A selected costing resource is no longer available.");
  return row.id;
}

export async function saveProductProductionFlow(input: {
  tenantId: string;
  productId: string;
  productName: string;
  department: string;
  materialId: string | null;
  steps: ProductProductionFlowStepInput[];
}): Promise<{ recipeId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (input.materialId) {
      const material = await client.query<{ id: string }>(`
        SELECT id::text
        FROM catalog.materials
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND active = true
        LIMIT 1
      `, [input.tenantId, input.materialId]);
      if (!material.rows[0]?.id) throw new Error("The selected material is no longer available.");
    }

    const seenProcessIds = new Set<string>();
    const resolvedSteps: RecipeProcessStep[] = [];
    for (const step of input.steps) {
      const processId = await resolveProductFlowProcess(
        client,
        input.tenantId,
        input.department,
        step.processToken
      );
      if (!processId || seenProcessIds.has(processId)) continue;
      seenProcessIds.add(processId);
      resolvedSteps.push({
        processId,
        machineId: await validateOptionalResource(client, "machines", input.tenantId, step.machineId),
        labourOperationId: await validateOptionalResource(
          client,
          "labour_operations",
          input.tenantId,
          step.labourOperationId
        )
      });
    }

    const currentPricing = await client.query<{
      wastePercent: string;
      markupMultiplier: string;
      profitMultiplier: string;
    }>(`
      SELECT
        COALESCE(r.waste_percent, 5)::text AS "wastePercent",
        COALESCE(r.markup_multiplier, 1.5)::text AS "markupMultiplier",
        COALESCE(r.profit_multiplier, 1.2)::text AS "profitMultiplier"
      FROM catalog.products p
      LEFT JOIN catalog.production_recipes r ON r.id = p.production_recipe_id
      WHERE p.tenant_id = $1::uuid AND p.id = $2::uuid
      LIMIT 1
    `, [input.tenantId, input.productId]);
    const pricing = currentPricing.rows[0] ?? {
      wastePercent: "5",
      markupMultiplier: "1.5",
      profitMultiplier: "1.2"
    };

    const managedRecipe = await client.query<{ id: string }>(`
      SELECT id::text
      FROM catalog.production_recipes
      WHERE tenant_id = $1::uuid
        AND recipe_json ->> 'managedBy' = 'product_build'
        AND recipe_json ->> 'productId' = $2
      ORDER BY updated_at DESC
      LIMIT 1
    `, [input.tenantId, input.productId]);

    let recipeId = managedRecipe.rows[0]?.id ?? "";
    const recipeName = `${input.productName} · production`;
    if (recipeId) {
      await client.query(`
        UPDATE catalog.production_recipes
        SET name = $3,
            department = $4,
            material_id = NULLIF($5, '')::uuid,
            waste_percent = $6::numeric,
            markup_multiplier = $7::numeric,
            profit_multiplier = $8::numeric,
            active = true,
            recipe_json = recipe_json || $9::jsonb,
            updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid
      `, [
        input.tenantId,
        recipeId,
        recipeName,
        input.department || "general",
        input.materialId ?? "",
        pricing.wastePercent,
        pricing.markupMultiplier,
        pricing.profitMultiplier,
        JSON.stringify({ managedBy: "product_build", productId: input.productId })
      ]);
    } else {
      const created = await client.query<{ id: string }>(`
        INSERT INTO catalog.production_recipes (
          tenant_id,
          name,
          department,
          material_id,
          waste_percent,
          markup_multiplier,
          profit_multiplier,
          recipe_json,
          active
        ) VALUES (
          $1::uuid,
          $2,
          $3,
          NULLIF($4, '')::uuid,
          $5::numeric,
          $6::numeric,
          $7::numeric,
          $8::jsonb,
          true
        )
        RETURNING id::text
      `, [
        input.tenantId,
        recipeName,
        input.department || "general",
        input.materialId ?? "",
        pricing.wastePercent,
        pricing.markupMultiplier,
        pricing.profitMultiplier,
        JSON.stringify({ managedBy: "product_build", productId: input.productId })
      ]);
      recipeId = created.rows[0]?.id ?? "";
    }

    if (!recipeId) throw new Error("The production workflow could not be saved.");
    await replaceRecipeProcesses(client, input.tenantId, recipeId, resolvedSteps);
    await client.query(`
      UPDATE catalog.products
      SET production_recipe_id = $3::uuid,
          website_sync_version = website_sync_version + 1,
          updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid
    `, [input.tenantId, input.productId, recipeId]);

    await client.query("COMMIT");
    return { recipeId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function labourHoursForCost(
  labour: LabourRecord | undefined,
  areaSqm: number,
  sheets: number,
  linearMetres: number,
  quantity: number
): number {
  if (!labour) return 0;
  const value = Number(labour.calculationValue || 0);
  let hours = 0;
  if (labour.calculationBasis === "per_sqm_hours") hours = areaSqm * value;
  else if (labour.calculationBasis === "per_sheet_hours") hours = sheets * value;
  else if (labour.calculationBasis === "per_linear_metre_hours") hours = linearMetres * value;
  else if (labour.calculationBasis === "per_item_hours") hours = quantity * value;
  else hours = value / 60;
  return Math.max(hours, Number(labour.minimumMinutes || 0) / 60);
}

export async function previewRecipeCost(
  tenantId: string,
  recipeId: string,
  widthMm: number,
  heightMm: number,
  quantity: number
) {
  const [recipes, machines, labour] = await Promise.all([
    listRecipesForTenant(tenantId),
    listMachinesForTenant(tenantId),
    listLabourForTenant(tenantId)
  ]);
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return null;

  const materialResult = recipe.materialId
    ? await pool.query<{
        type: string;
        width_mm: string | null;
        length_mm: string | null;
        roll_width_mm: string | null;
        minimum_billable_sheet_fraction: string | null;
        purchase_uom: string | null;
        stock_uom: string | null;
        stock_quantity: string | null;
        purchase_cost: string;
      }>(`
        SELECT
          type::text,
          width_mm,
          length_mm,
          roll_width_mm,
          minimum_billable_sheet_fraction,
          purchase_uom,
          stock_uom,
          stock_quantity::text,
          COALESCE((cost_json ->> 'purchaseCost')::numeric, purchase_cost, 0)::text AS purchase_cost
        FROM catalog.materials
        WHERE tenant_id = $1::uuid AND id = $2::uuid
      `, [tenantId, recipe.materialId])
    : { rows: [] };

  const material = materialResult.rows[0];
  const materialType = String(material?.type ?? "").toLowerCase();
  const purchaseUom = String(material?.purchase_uom ?? "").toLowerCase();
  const stockUom = String(material?.stock_uom ?? "").toLowerCase();
  const stockQuantity = Number(material?.stock_quantity || 0);
  const purchaseCost = Number(material?.purchase_cost || 0);
  const linearUnits = ["lm", "m", "metre", "meter", "linear metre", "linear meter"];
  const looksLikeRoll = materialType.includes("roll") || materialType.includes("laminate") || materialType.includes("cello") || Number(material?.roll_width_mm || 0) > 0;
  const looksLikeSheet = materialType.includes("sheet") || materialType.includes("paper") || materialType.includes("card");
  let normalizedUnitCost = purchaseCost;
  if (looksLikeRoll) {
    if (linearUnits.includes(purchaseUom)) normalizedUnitCost = purchaseCost;
    else if (purchaseUom.includes("roll") && stockQuantity > 0) normalizedUnitCost = purchaseCost / stockQuantity;
    else if (stockQuantity > 0 && linearUnits.includes(stockUom)) normalizedUnitCost = purchaseCost / stockQuantity;
  } else if (looksLikeSheet && (purchaseUom.includes("ream") || purchaseUom.includes("pack") || purchaseUom.includes("box")) && stockQuantity > 0) {
    normalizedUnitCost = purchaseCost / stockQuantity;
  } else if (["box", "pack", "bag", "carton", "bundle"].some((unit) => purchaseUom.includes(unit)) && stockQuantity > 0 && stockUom.includes("each")) {
    normalizedUnitCost = purchaseCost / stockQuantity;
  }

  const base = calculateProductionRecipeCost({
    finishedWidthMm: widthMm,
    finishedHeightMm: heightMm,
    quantity,
    wastePercent: Number(recipe.wastePercent),
    markupMultiplier: 1,
    profitMultiplier: 1,
    material: material
      ? {
          type: String(material.type),
          widthMm: Number(material.width_mm || 0),
          heightMm: Number(material.length_mm || 0),
          rollWidthMm: Number(material.roll_width_mm || 0),
          unitCost: normalizedUnitCost,
          minimumBillableSheetFraction: Number(material.minimum_billable_sheet_fraction || 0),
          allowRotation: true
        }
      : null,
    machine: null,
    labour: []
  });

  const processRows = recipe.processIds.length
    ? await pool.query<ProcessRecord>(`
        SELECT
          p.id::text,
          p.name,
          p.department,
          p.process_type AS "processType",
          p.labour_operation_id::text AS "labourOperationId",
          l.name AS "labourOperationName",
          p.active
        FROM catalog.processes p
        LEFT JOIN catalog.labour_operations l ON l.id = p.labour_operation_id
        WHERE p.tenant_id = $1::uuid AND p.id = ANY($2::uuid[])
      `, [tenantId, recipe.processIds])
    : { rows: [] as ProcessRecord[] };

  const processMap = new Map(processRows.rows.map((row) => [row.id, row]));
  const machineMap = new Map(machines.filter((row) => row.active).map((row) => [row.id, row]));
  const labourMap = new Map(labour.filter((row) => row.active).map((row) => [row.id, row]));

  let machineCost = 0;
  let inkCost = 0;
  let labourCost = 0;
  const breakdown: Array<{
    processName: string;
    machineName: string | null;
    labourName: string | null;
    machineCost: number;
    inkCost: number;
    labourCost: number;
  }> = [];

  const orderedSteps = recipe.processSteps.length
    ? recipe.processSteps
    : recipe.processIds.map((processId) => ({ processId, machineId: null, labourOperationId: null }));

  for (const step of orderedSteps) {
    const process = processMap.get(step.processId);
    if (!process) continue;
    const selectedMachine = step.machineId
      ? machineMap.get(step.machineId)
      : machines.find((row) => row.active && row.processIds.includes(step.processId));
    const selectedLabour = step.labourOperationId
      ? labourMap.get(step.labourOperationId)
      : process.labourOperationId
        ? labourMap.get(process.labourOperationId)
        : undefined;

    let runHours = 0;
    const speed = Number(selectedMachine?.speedValue || 0);
    if (speed > 0) {
      if (selectedMachine?.speedUom === "linear_metres_per_hour") {
        runHours = Number(base.materialUsage.linearMetres || 0) / speed;
      } else if (selectedMachine?.speedUom === "sheets_per_hour") {
        runHours = Number(base.materialUsage.sheets || 0) / speed;
      } else {
        runHours = base.areaSqm / speed;
      }
    }

    const stepMachineCost = selectedMachine
      ? (runHours + Number(selectedMachine.setupMinutes || 0) / 60) * Number(selectedMachine.hourlyCost || 0)
      : 0;
    const stepInkCost = selectedMachine
      ? base.areaSqm * Number(selectedMachine.inkCostPerSqm || 0)
      : 0;
    const stepLabourCost = selectedLabour
      ? labourHoursForCost(
          selectedLabour,
          base.areaSqm,
          Number(base.materialUsage.sheets || 0),
          Number(base.materialUsage.linearMetres || 0),
          quantity
        ) * Number(selectedLabour.hourlyRate || 0)
      : 0;

    machineCost += stepMachineCost;
    inkCost += stepInkCost;
    labourCost += stepLabourCost;
    breakdown.push({
      processName: process.name,
      machineName: selectedMachine?.name ?? null,
      labourName: selectedLabour?.name ?? null,
      machineCost: Math.round(stepMachineCost * 100) / 100,
      inkCost: Math.round(stepInkCost * 100) / 100,
      labourCost: Math.round(stepLabourCost * 100) / 100
    });
  }

  const total = base.materialCost + machineCost + inkCost + labourCost;
  return {
    ...base,
    machineCost: Math.round(machineCost * 100) / 100,
    inkCost: Math.round(inkCost * 100) / 100,
    labourCost: Math.round(labourCost * 100) / 100,
    totalCost: Math.round(total * 100) / 100,
    sellPrice: Math.round(total * Number(recipe.markupMultiplier) * Number(recipe.profitMultiplier) * 100) / 100,
    processBreakdown: breakdown
  };
}
