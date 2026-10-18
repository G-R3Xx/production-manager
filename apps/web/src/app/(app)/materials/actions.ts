"use server";

import { Buffer } from "node:buffer";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createMaterial, listMaterialsForTenant, saveMaterialPriceManagerChanges, setMaterialActive, updateMaterial, type MaterialPriceManagerChange } from "@/server/materials";
import { listSuppliersForTenant } from "@/server/suppliers";
import { bulkApplyMaterialSheet, previewMaterialPriceWorkbook } from "@/server/material-price-sheet";
import { queueMyobMasterDataSync, runMyobMasterDataSyncNow } from "@/server/myob-background-sync";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { quoteVisualCategoryKey, saveQuoteVisualCategoryImage } from "@/server/quote-visuals";

function readString(formData: FormData, key: string): string { return String(formData.get(key) ?? "").trim(); }
function readOptionalNumeric(formData: FormData, key: string): string | null {
  const raw=readString(formData,key); if(!raw) return null;
  const match=raw.replace(/,/g,"").replace(/\$/g,"").replace(/\s+/g,"").match(/-?\d+(?:\.\d+)?/);
  if(!match) return null; const value=Number(match[0]); return Number.isFinite(value)?String(value):null;
}
function readRequiredNumeric(formData: FormData,key:string,fallback="0"):string{return readOptionalNumeric(formData,key)??fallback;}
function readChecked(formData: FormData,key:string):boolean{return ["1","true","on","yes"].includes(readString(formData,key).toLowerCase());}
function getErrorMessage(error:unknown):string{return error instanceof Error&&error.message?error.message:"Something went wrong while saving the material";}
async function tenant(){const user=await getRequiredSessionUser();const active=await resolveActiveTenantForAuthUserId(user.id);if(!active)redirect('/bootstrap');return active!;}
type UploadedQuoteImage = { imageUrl: string | null; storagePath: string | null };

async function uploadQuoteImageIfPresent(tenantId: string, scope: string, formData: FormData, fieldName = "quoteImageFile"): Promise<UploadedQuoteImage | null> {
  const rawFile = formData.get(fieldName);
  if (!rawFile || typeof rawFile !== "object" || !("size" in rawFile) || !("arrayBuffer" in rawFile)) return null;
  const file = rawFile as unknown as { name?: string; type?: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
  if (!file.size || file.size <= 0) return null;
  if (file.size > 10_000_000) throw new Error("Quote image is too large. Keep images under 10 MB.");
  const contentType = String(file.type || "").toLowerCase();
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
  if (contentType && !allowed.has(contentType)) throw new Error("Use a JPG, PNG, WebP, GIF or AVIF image for quote imagery.");
  const safeName = String(file.name || "quote-image.png").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120) || "quote-image.png";
  const safeScope = scope.replace(/[^a-z0-9/_-]+/gi, "-");
  const storagePath = `${tenantId}/${safeScope}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseServiceRoleClient();
  const bucket = "quote-visuals";
  await supabase.storage.createBucket(bucket, { public: true }).catch(() => undefined);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, { contentType: contentType || "application/octet-stream", upsert: true });
  if (error) throw new Error(`Quote image upload failed: ${error.message}`);
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { imageUrl: data.publicUrl, storagePath };
}

function materialInput(tenantId:string,formData:FormData,name:string,image:UploadedQuoteImage){return{
  tenantId,supplierId:readString(formData,'supplierId')||null,sourceProductId:null,name,
  customerFacingName:readString(formData,'customerFacingName')||null,sku:readString(formData,'sku')||null,
  materialType:readString(formData,'materialType')||'sheet_media',materialGroup:readString(formData,'materialGroup')||null,
  minimumBillableSheetFraction:readOptionalNumeric(formData,'minimumBillableSheetFraction'),rollBillingIncrementMetres:readOptionalNumeric(formData,'rollBillingIncrementMetres'),
  reversePrintable:readChecked(formData,'reversePrintable'),usedForBacking:readChecked(formData,'usedForBacking'),showAsInstallationOption:readChecked(formData,'showAsInstallationOption'),stockUom:readString(formData,'stockUom')||'sheet',
  purchaseUom:readString(formData,'purchaseUom')||'sheet',stockQuantity:readRequiredNumeric(formData,'stockQuantity'),purchaseCost:readRequiredNumeric(formData,'purchaseCost'),
  wastagePercent:String(Math.max(0,Number(readRequiredNumeric(formData,'wastagePercent'))||0)),
  widthMm:readOptionalNumeric(formData,'widthMm'),lengthMm:readOptionalNumeric(formData,'lengthMm'),rollWidthMm:readOptionalNumeric(formData,'rollWidthMm'),gsm:readOptionalNumeric(formData,'gsm'),notes:readString(formData,'notes')||null,
  quoteImageUrl:image.imageUrl,quoteImageStoragePath:image.storagePath,quoteVisualCategory:quoteVisualCategoryKey(readString(formData,'quoteVisualCategory'))
};}



export async function createMaterialAction(formData:FormData){
  const active=await tenant();const name=readString(formData,'name');if(!name)redirect('/materials?error=Material%20name%20is%20required');
  let created:{id:string}|null=null;let saveError="";
  try{
    const uploaded=await uploadQuoteImageIfPresent(active.tenantId,"materials/new",formData);
    created=await createMaterial(materialInput(active.tenantId,formData,name,uploaded??{imageUrl:null,storagePath:null}));
  }catch(error){console.error('Create material failed',error);saveError=getErrorMessage(error);}
  if(saveError||!created)redirect(`/materials?error=${encodeURIComponent(saveError||"Could not create material")}`);
  if(!created) throw new Error("Material was not created.");
  const queued=await queueMyobMasterDataSync(active.tenantId,"material",created.id);
  revalidatePath('/materials');revalidatePath('/quotes');
  redirect(`/materials?message=${encodeURIComponent(queued?"Material created · MYOB sync queued":"Material created")}`);
}

export async function updateMaterialAction(formData:FormData){
  const active=await tenant();const materialId=readString(formData,'materialId');const name=readString(formData,'name');
  if(!materialId)redirect('/materials?error=Material%20ID%20is%20missing');if(!name)redirect('/materials?error=Material%20name%20is%20required');
  let saveError="";
  try{
    const removeImage=readChecked(formData,'removeQuoteImage');
    const uploaded=await uploadQuoteImageIfPresent(active.tenantId,`materials/${materialId}`,formData);
    const image:UploadedQuoteImage=removeImage
      ? {imageUrl:null,storagePath:null}
      : uploaded ?? {imageUrl:readString(formData,'existingQuoteImageUrl')||null,storagePath:readString(formData,'existingQuoteImageStoragePath')||null};
    await updateMaterial({id:materialId,...materialInput(active.tenantId,formData,name,image)});
  }catch(error){console.error('Update material failed',error);saveError=getErrorMessage(error);}
  if(saveError)redirect(`/materials?error=${encodeURIComponent(saveError)}`);
  const queued=await queueMyobMasterDataSync(active.tenantId,"material",materialId);
  revalidatePath('/materials');revalidatePath('/quotes');
  redirect(`/materials?message=${encodeURIComponent(queued?"Material updated · MYOB sync queued":"Material updated")}`);
}

export async function saveQuoteVisualCategoryImageAction(formData:FormData){
  const active=await tenant();
  const key=quoteVisualCategoryKey(readString(formData,'categoryKey'));
  if(!key) throw new Error("Invalid quote visual category.");
  let saveError="";
  try{
    const removeImage=readChecked(formData,'removeCategoryImage');
    const uploaded=await uploadQuoteImageIfPresent(active.tenantId,`categories/${key}`,formData,'categoryImageFile');
    if(removeImage){
      await saveQuoteVisualCategoryImage(active.tenantId,key,null);
    }else if(uploaded){
      await saveQuoteVisualCategoryImage(active.tenantId,key,uploaded);
    }else{
      const existingUrl=readString(formData,'existingCategoryImageUrl')||null;
      const existingPath=readString(formData,'existingCategoryImageStoragePath')||null;
      if(existingUrl||existingPath) await saveQuoteVisualCategoryImage(active.tenantId,key,{imageUrl:existingUrl,storagePath:existingPath});
    }
  }catch(error){console.error('Quote category image save failed',error);saveError=getErrorMessage(error);}
  if(saveError)redirect(`/materials?error=${encodeURIComponent(saveError)}`);
  revalidatePath('/materials');revalidatePath('/quotes');
  redirect('/materials?message=Quote%20wizard%20category%20image%20saved');
}


export async function setMaterialActiveAction(formData:FormData){const active=await tenant();const materialId=readString(formData,'materialId');const nextActive=readString(formData,'active')==='true';if(!materialId)redirect('/materials?error=Material%20ID%20is%20missing');try{await setMaterialActive(active.tenantId,materialId,nextActive);}catch(error){redirect(`/materials?error=${encodeURIComponent(getErrorMessage(error))}`);}redirect(nextActive?'/materials?message=Material%20restored':'/materials?message=Material%20deleted');}
export async function syncMaterialToMyobAction(formData:FormData){const active=await tenant();const materialId=readString(formData,'materialId');if(!materialId)redirect('/materials?error=Material%20ID%20is%20missing');let result:{number?:string|null}|null=null;let errorMessage="";try{result=await runMyobMasterDataSyncNow(active.tenantId,"material",materialId);}catch(error){errorMessage=getErrorMessage(error);}redirect(`/materials?${errorMessage?`error=${encodeURIComponent(errorMessage)}`:`message=${encodeURIComponent(`Material synced to MYOB item ${result?.number??"linked"}`)}`}`);}

function canManageMaterialPrices(role: string): boolean {
  return role === "owner" || role === "manager";
}

function uploadedSpreadsheet(formData: FormData): { file: File | null; error: string | null } {
  const candidate = formData.get("file");
  if (!candidate || typeof candidate !== "object" || !("arrayBuffer" in candidate)) return { file: null, error: "Choose the edited Production Manager .xlsx workbook first." };
  const file = candidate as File;
  if (file.size > 8_000_000) return { file: null, error: "Spreadsheet is too large. Keep material workbooks under 8 MB." };
  const lower = String(file.name || "").toLowerCase();
  if (!lower.endsWith(".xlsx")) return { file: null, error: "Use the Production Manager .xlsx material workbook." };
  return { file, error: null };
}

export async function previewMaterialPriceSheetAction(formData: FormData) {
  const active = await tenant();
  if (!canManageMaterialPrices(String(active.tenantRole).toLowerCase())) return { ok: false as const, error: "Only Owners and Managers can bulk manage materials." };
  const upload = uploadedSpreadsheet(formData);
  if (!upload.file) return { ok: false as const, error: upload.error ?? "Choose the PM .xlsx workbook first." };
  try {
    const [materials, suppliers] = await Promise.all([listMaterialsForTenant(active.tenantId), listSuppliersForTenant(active.tenantId)]);
    const preview = previewMaterialPriceWorkbook(Buffer.from(await upload.file.arrayBuffer()), materials, suppliers);
    if (preview.format === "unknown") return { ok: false as const, error: "Spreadsheet format was not recognised. Download a fresh Production Manager material workbook." };
    return { ok: true as const, fileName: upload.file.name || "material-workbook.xlsx", preview };
  } catch (error) {
    console.error("Material spreadsheet preview failed", error);
    return { ok: false as const, error: getErrorMessage(error) };
  }
}

export async function applyMaterialPriceSheetAction(formData: FormData) {
  const active = await tenant();
  if (!canManageMaterialPrices(String(active.tenantRole).toLowerCase())) return { ok: false as const, error: "Only Owners and Managers can bulk manage materials." };
  const upload = uploadedSpreadsheet(formData);
  if (!upload.file) return { ok: false as const, error: upload.error ?? "Choose the PM .xlsx workbook first." };
  try {
    const [materials, suppliers] = await Promise.all([listMaterialsForTenant(active.tenantId), listSuppliersForTenant(active.tenantId)]);
    const preview = previewMaterialPriceWorkbook(Buffer.from(await upload.file.arrayBuffer()), materials, suppliers);
    if (preview.format === "unknown") return { ok: false as const, error: "Spreadsheet format was not recognised." };
    const result = await bulkApplyMaterialSheet(active.tenantId, preview, upload.file.name || preview.format);
    const syncIds = [...new Set([...result.updatedIds, ...result.createdIds])];
    let syncQueued = 0;
    if (readChecked(formData, "syncMyob") && syncIds.length) {
      const queued = await Promise.all(syncIds.map((id) => queueMyobMasterDataSync(active.tenantId, "material", id).catch(() => false)));
      syncQueued = queued.filter(Boolean).length;
    }
    revalidatePath("/materials");
    return {
      ok: true as const,
      updated: preview.updateRows,
      added: result.createdIds.length,
      supplierPlaceholders: result.createdSupplierPlaceholders,
      hidden: result.hidden,
      deleted: result.deleted,
      restored: result.restored,
      syncQueued,
      skipped: preview.unmatchedRows + preview.ambiguousRows + preview.invalidRows,
      unchanged: preview.unchangedRows
    };
  } catch (error) {
    console.error("Material spreadsheet apply failed", error);
    return { ok: false as const, error: getErrorMessage(error) };
  }
}


export async function saveMaterialPriceManagerAction(formData: FormData) {
  const active = await tenant();
  if (!canManageMaterialPrices(String(active.tenantRole).toLowerCase())) return { ok: false as const, error: "Only Owners and Managers can manage material prices." };

  const raw = readString(formData, "changes");
  if (!raw) return { ok: false as const, error: "No material changes were supplied." };

  let changes: MaterialPriceManagerChange[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Invalid material changes.");
    changes = parsed as MaterialPriceManagerChange[];
  } catch {
    return { ok: false as const, error: "Material changes could not be read. Refresh the page and try again." };
  }

  try {
    const result = await saveMaterialPriceManagerChanges(active.tenantId, changes);
    const syncIds = [...new Set([...result.updatedIds, ...result.createdIds])];
    let syncQueued = 0;
    if (readChecked(formData, "syncMyob") && syncIds.length) {
      const queued = await Promise.all(syncIds.map((id) => queueMyobMasterDataSync(active.tenantId, "material", id).catch(() => false)));
      syncQueued = queued.filter(Boolean).length;
    }
    revalidatePath("/materials");
    return {
      ok: true as const,
      updated: result.updatedIds.length,
      added: result.createdIds.length,
      supplierPlaceholders: result.placeholderSuppliers,
      hidden: result.hidden,
      archived: result.archived,
      restored: result.restored,
      syncQueued
    };
  } catch (error) {
    console.error("Material Price Manager save failed", error);
    return { ok: false as const, error: getErrorMessage(error) };
  }
}
