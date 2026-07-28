"use server";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createLabour,setLabourActive,updateLabour } from "@/server/productionResources";
const s=(f:FormData,k:string)=>String(f.get(k)??"").trim(); const n=(f:FormData,k:string,d="0")=>{const v=Number(s(f,k));return Number.isFinite(v)?String(v):d;};
const input=(f:FormData,tenantId:string)=>({tenantId,name:s(f,"name"),department:s(f,"department")||"general",hourlyRate:n(f,"hourlyRate"),calculationBasis:s(f,"calculationBasis")||"fixed_minutes",calculationValue:n(f,"calculationValue"),minimumMinutes:n(f,"minimumMinutes")});
export async function createLabourAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");const values=input(formData,t.tenantId);if(!values.name)redirect("/labour?error=Name%20is%20required");await createLabour(values);redirect("/labour?message=Labour%20operation%20created");}
export async function updateLabourAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");const values=input(formData,t.tenantId);const id=s(formData,"id");if(!id||!values.name)redirect("/labour?error=Name%20is%20required");await updateLabour({...values,id});redirect("/labour?message=Labour%20operation%20updated");}
export async function setLabourActiveAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");await setLabourActive(t.tenantId,s(formData,"id"),s(formData,"active")==="true");redirect("/labour");}
