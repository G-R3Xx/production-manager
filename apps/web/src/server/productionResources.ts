import { pool } from "@production-manager/db";
import { calculateProductionRecipeCost } from "@production-manager/domain";

export type MachineRecord = {
  id: string; name: string; machineType: string; maxWidthMm: string | null; speedValue: string;
  speedUom: string; hourlyCost: string; setupMinutes: string; inkCostPerSqm: string; active: boolean;
};
export type LabourRecord = {
  id: string; name: string; department: string; hourlyRate: string; calculationBasis: string;
  calculationValue: string; minimumMinutes: string; active: boolean;
};
export type RecipeRecord = {
  id: string; name: string; department: string; materialId: string | null; materialName: string | null;
  machineId: string | null; machineName: string | null; labourOperationIds: string[]; wastePercent: string;
  markupMultiplier: string; profitMultiplier: string; active: boolean;
};

export async function listMachinesForTenant(tenantId: string): Promise<MachineRecord[]> {
  const result = await pool.query(`SELECT id::text, name, machine_type AS "machineType", max_width_mm::text AS "maxWidthMm", speed_value::text AS "speedValue", speed_uom AS "speedUom", hourly_cost::text AS "hourlyCost", setup_minutes::text AS "setupMinutes", ink_cost_per_sqm::text AS "inkCostPerSqm", active FROM catalog.machines WHERE tenant_id=$1::uuid ORDER BY active DESC, name`, [tenantId]);
  return result.rows;
}
export async function createMachine(input: Omit<MachineRecord,"id"|"active"> & {tenantId:string}) {
  await pool.query(`INSERT INTO catalog.machines (tenant_id,name,machine_type,max_width_mm,speed_value,speed_uom,hourly_cost,setup_minutes,ink_cost_per_sqm) VALUES ($1::uuid,$2,$3,NULLIF($4,'')::numeric,$5::numeric,$6,$7::numeric,$8::numeric,$9::numeric)`, [input.tenantId,input.name,input.machineType,input.maxWidthMm??"",input.speedValue,input.speedUom,input.hourlyCost,input.setupMinutes,input.inkCostPerSqm]);
}
export async function setMachineActive(tenantId:string,id:string,active:boolean){await pool.query(`UPDATE catalog.machines SET active=$3,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id,active]);}

export async function listLabourForTenant(tenantId:string): Promise<LabourRecord[]> {
  const result=await pool.query(`SELECT id::text,name,department,hourly_rate::text AS "hourlyRate",calculation_basis AS "calculationBasis",calculation_value::text AS "calculationValue",minimum_minutes::text AS "minimumMinutes",active FROM catalog.labour_operations WHERE tenant_id=$1::uuid ORDER BY active DESC,name`,[tenantId]);
  return result.rows;
}
export async function createLabour(input: Omit<LabourRecord,"id"|"active"> & {tenantId:string}){
  await pool.query(`INSERT INTO catalog.labour_operations (tenant_id,name,department,hourly_rate,calculation_basis,calculation_value,minimum_minutes) VALUES ($1::uuid,$2,$3,$4::numeric,$5,$6::numeric,$7::numeric)`,[input.tenantId,input.name,input.department,input.hourlyRate,input.calculationBasis,input.calculationValue,input.minimumMinutes]);
}
export async function setLabourActive(tenantId:string,id:string,active:boolean){await pool.query(`UPDATE catalog.labour_operations SET active=$3,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id,active]);}

export async function listRecipesForTenant(tenantId:string): Promise<RecipeRecord[]> {
  const result=await pool.query(`SELECT r.id::text,r.name,r.department,r.material_id::text AS "materialId",m.name AS "materialName",r.machine_id::text AS "machineId",mc.name AS "machineName",r.labour_operation_ids AS "labourOperationIds",r.waste_percent::text AS "wastePercent",r.markup_multiplier::text AS "markupMultiplier",r.profit_multiplier::text AS "profitMultiplier",r.active FROM catalog.production_recipes r LEFT JOIN catalog.materials m ON m.id=r.material_id LEFT JOIN catalog.machines mc ON mc.id=r.machine_id WHERE r.tenant_id=$1::uuid ORDER BY r.active DESC,r.name`,[tenantId]);
  return result.rows.map((row)=>({...row,labourOperationIds:Array.isArray(row.labourOperationIds)?row.labourOperationIds:[]}));
}
export async function createRecipe(input:{tenantId:string;name:string;department:string;materialId:string|null;machineId:string|null;labourOperationIds:string[];wastePercent:string;markupMultiplier:string;profitMultiplier:string}){
  await pool.query(`INSERT INTO catalog.production_recipes (tenant_id,name,department,material_id,machine_id,labour_operation_ids,waste_percent,markup_multiplier,profit_multiplier) VALUES ($1::uuid,$2,$3,NULLIF($4,'')::uuid,NULLIF($5,'')::uuid,$6::jsonb,$7::numeric,$8::numeric,$9::numeric)`,[input.tenantId,input.name,input.department,input.materialId??"",input.machineId??"",JSON.stringify(input.labourOperationIds),input.wastePercent,input.markupMultiplier,input.profitMultiplier]);
}
export async function setRecipeActive(tenantId:string,id:string,active:boolean){await pool.query(`UPDATE catalog.production_recipes SET active=$3,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,id,active]);}

export async function previewRecipeCost(tenantId:string,recipeId:string,widthMm:number,heightMm:number,quantity:number){
  const recipes=await listRecipesForTenant(tenantId); const recipe=recipes.find((item)=>item.id===recipeId); if(!recipe)return null;
  const [materialResult,machineResult,labourRows]=await Promise.all([
    recipe.materialId?pool.query(`SELECT type::text, width_mm, length_mm, roll_width_mm, minimum_billable_sheet_fraction, COALESCE((cost_json->>'purchaseCost')::numeric,purchase_cost,0)::text AS unit_cost FROM catalog.materials WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,recipe.materialId]):Promise.resolve({rows:[]}),
    recipe.machineId?pool.query(`SELECT speed_value,speed_uom,hourly_cost,setup_minutes,ink_cost_per_sqm FROM catalog.machines WHERE tenant_id=$1::uuid AND id=$2::uuid`,[tenantId,recipe.machineId]):Promise.resolve({rows:[]}),
    recipe.labourOperationIds.length?pool.query(`SELECT name,hourly_rate,calculation_basis,calculation_value,minimum_minutes FROM catalog.labour_operations WHERE tenant_id=$1::uuid AND id=ANY($2::uuid[])`,[tenantId,recipe.labourOperationIds]):Promise.resolve({rows:[]})
  ]);
  const material=materialResult.rows[0]; const machine=machineResult.rows[0];
  return calculateProductionRecipeCost({finishedWidthMm:widthMm,finishedHeightMm:heightMm,quantity,wastePercent:Number(recipe.wastePercent),markupMultiplier:Number(recipe.markupMultiplier),profitMultiplier:Number(recipe.profitMultiplier),material:material?{type:String(material.type),widthMm:Number(material.width_mm||0),heightMm:Number(material.length_mm||0),rollWidthMm:Number(material.roll_width_mm||0),unitCost:Number(material.unit_cost||0),minimumBillableSheetFraction:Number(material.minimum_billable_sheet_fraction||0),allowRotation:true}:null,machine:machine?{speedValue:Number(machine.speed_value||0),speedUom:String(machine.speed_uom),hourlyCost:Number(machine.hourly_cost||0),setupMinutes:Number(machine.setup_minutes||0),inkCostPerSqm:Number(machine.ink_cost_per_sqm||0)}:null,labour:labourRows.rows.map((row)=>({name:String(row.name),hourlyRate:Number(row.hourly_rate||0),calculationBasis:String(row.calculation_basis),calculationValue:Number(row.calculation_value||0),minimumMinutes:Number(row.minimum_minutes||0)}))});
}
