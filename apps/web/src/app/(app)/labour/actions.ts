"use server";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createLabour,setLabourActive } from "@/server/productionResources";
const s=(f:FormData,k:string)=>String(f.get(k)??"").trim(); const n=(f:FormData,k:string,d="0")=>{const v=Number(s(f,k));return Number.isFinite(v)?String(v):d;};
export async function createLabourAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");const name=s(formData,"name");if(!name)redirect("/labour?error=Name%20is%20required");await createLabour({tenantId:t.tenantId,name,department:s(formData,"department")||"general",hourlyRate:n(formData,"hourlyRate"),calculationBasis:s(formData,"calculationBasis")||"fixed_minutes",calculationValue:n(formData,"calculationValue"),minimumMinutes:n(formData,"minimumMinutes")});redirect("/labour?message=Labour%20operation%20created");}
export async function setLabourActiveAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");await setLabourActive(t.tenantId,s(formData,"id"),s(formData,"active")==="true");redirect("/labour");}
