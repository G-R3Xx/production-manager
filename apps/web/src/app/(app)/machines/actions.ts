"use server";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createMachine,setMachineActive,updateMachine } from "@/server/productionResources";
const s=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const n=(f:FormData,k:string,d="0")=>{const v=Number(s(f,k));return Number.isFinite(v)?String(v):d;};
const input=(f:FormData,tenantId:string)=>({tenantId,name:s(f,"name"),machineType:s(f,"machineType")||"other",maxWidthMm:n(f,"maxWidthMm",""),speedValue:n(f,"speedValue"),speedUom:s(f,"speedUom")||"sqm_per_hour",hourlyCost:n(f,"hourlyCost"),setupMinutes:n(f,"setupMinutes"),inkCostPerSqm:n(f,"inkCostPerSqm"),colourImpressionCost:n(f,"colourImpressionCost"),monoImpressionCost:n(f,"monoImpressionCost"),maxStackSheets:n(f,"maxStackSheets")});
export async function createMachineAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");const values=input(formData,t.tenantId);if(!values.name)redirect("/machines?error=Name%20is%20required");await createMachine(values);redirect("/machines?message=Machine%20created");}
export async function setMachineActiveAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");await setMachineActive(t.tenantId,s(formData,"id"),s(formData,"active")==="true");redirect("/machines");}

export type MachineSaveState = {
  status: "idle" | "success" | "error";
  message: string;
  savedAt: number;
};

export async function updateMachineInlineAction(_previous: MachineSaveState, formData: FormData): Promise<MachineSaveState> {
  const user = await getRequiredSessionUser();
  const tenantId = s(formData, "tenantId");
  const values = input(formData, tenantId);
  const id = s(formData, "id");
  if (!tenantId || !id || !values.name) return { status: "error", message: "Machine name is required.", savedAt: Date.now() };
  try {
    const saved = await updateMachine({ ...values, id, authUserId: user.id });
    if (!saved) return { status: "error", message: "Machine could not be saved or is no longer available.", savedAt: Date.now() };
    return { status: "success", message: `${values.name} saved`, savedAt: Date.now() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Machine could not be saved.", savedAt: Date.now() };
  }
}
