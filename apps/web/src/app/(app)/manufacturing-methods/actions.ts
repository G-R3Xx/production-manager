"use server";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createRecipe,setRecipeActive,updateRecipe } from "@/server/productionResources";
const s=(f:FormData,k:string)=>String(f.get(k)??"").trim(); const n=(f:FormData,k:string,d:string)=>{const v=Number(s(f,k));return Number.isFinite(v)?String(v):d;};
const input=(f:FormData,tenantId:string)=>({tenantId,name:s(f,"name"),department:s(f,"department")||"general",materialId:s(f,"materialId")||null,processIds:f.getAll("processIds").map(String).filter(Boolean),wastePercent:n(f,"wastePercent","0"),markupMultiplier:n(f,"markupMultiplier","1.5"),profitMultiplier:n(f,"profitMultiplier","1.2")});
export async function createRecipeAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");const values=input(formData,t.tenantId);if(!values.name)redirect("/manufacturing-methods?error=Name%20is%20required");await createRecipe(values);redirect("/manufacturing-methods?message=Manufacturing%20method%20created");}
export async function updateRecipeAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");const values=input(formData,t.tenantId);const id=s(formData,"id");if(!id||!values.name)redirect("/manufacturing-methods?error=Name%20is%20required");await updateRecipe({...values,id});redirect("/manufacturing-methods?message=Manufacturing%20method%20updated");}
export async function setRecipeActiveAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");await setRecipeActive(t.tenantId,s(formData,"id"),s(formData,"active")==="true");redirect("/manufacturing-methods");}
