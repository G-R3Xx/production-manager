"use server";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createRecipe,setRecipeActive } from "@/server/productionResources";
const s=(f:FormData,k:string)=>String(f.get(k)??"").trim(); const n=(f:FormData,k:string,d:string)=>{const v=Number(s(f,k));return Number.isFinite(v)?String(v):d;};
export async function createRecipeAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");const name=s(formData,"name");if(!name)redirect("/recipes?error=Name%20is%20required");await createRecipe({tenantId:t.tenantId,name,department:s(formData,"department")||"general",materialId:s(formData,"materialId")||null,machineId:s(formData,"machineId")||null,labourOperationIds:formData.getAll("labourOperationIds").map(String).filter(Boolean),wastePercent:n(formData,"wastePercent","0"),markupMultiplier:n(formData,"markupMultiplier","1.5"),profitMultiplier:n(formData,"profitMultiplier","1.2")});redirect("/recipes?message=Recipe%20created");}
export async function setRecipeActiveAction(formData:FormData){const u=await getRequiredSessionUser();const t=await resolveActiveTenantForAuthUserId(u.id);if(!t)redirect("/bootstrap");await setRecipeActive(t.tenantId,s(formData,"id"),s(formData,"active")==="true");redirect("/recipes");}
