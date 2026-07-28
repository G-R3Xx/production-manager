"use server";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createMachine,setMachineActive,updateMachine } from "@/server/productionResources";
const s=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const n=(f:FormData,k:string,d="0")=>{const v=Number(s(f,k));return Number.isFinite(v)?String(v):d;};
const input=(f:FormData,tenantId:string)=>({tenantId,name:s(f,"name"),machineType:s(f,"machineType")||"other",maxWidthMm:n(f,"maxWidthMm",""),speedValue:n(f,"speedValue"),speedUom:s(f,"speedUom")||"sqm_per_hour",hourlyCost:n(f,"hourlyCost"),setupMinutes:n(f,"setupMinutes"),inkCostPerSqm:n(f,"inkCostPerSqm"),processIds:f.getAll("processIds").map(String).filter(Boolean)});
export async function createMachineAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");const values=input(formData,t.tenantId);if(!values.name)redirect("/machines?error=Name%20is%20required");await createMachine(values);redirect("/machines?message=Machine%20created");}
export async function updateMachineAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");const values=input(formData,t.tenantId);const id=s(formData,"id");if(!id||!values.name)redirect("/machines?error=Name%20is%20required");await updateMachine({...values,id});redirect("/machines?message=Machine%20updated");}
export async function setMachineActiveAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");await setMachineActive(t.tenantId,s(formData,"id"),s(formData,"active")==="true");redirect("/machines");}
