"use server";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createMachine,setMachineActive } from "@/server/productionResources";
const s=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const n=(f:FormData,k:string,d="0")=>{const v=Number(s(f,k));return Number.isFinite(v)?String(v):d;};
export async function createMachineAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");const name=s(formData,"name");if(!name)redirect("/machines?error=Name%20is%20required");await createMachine({tenantId:t.tenantId,name,machineType:s(formData,"machineType")||"other",maxWidthMm:n(formData,"maxWidthMm",""),speedValue:n(formData,"speedValue"),speedUom:s(formData,"speedUom")||"sqm_per_hour",hourlyCost:n(formData,"hourlyCost"),setupMinutes:n(formData,"setupMinutes"),inkCostPerSqm:n(formData,"inkCostPerSqm")});redirect("/machines?message=Machine%20created");}
export async function setMachineActiveAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");await setMachineActive(t.tenantId,s(formData,"id"),s(formData,"active")==="true");redirect("/machines");}
