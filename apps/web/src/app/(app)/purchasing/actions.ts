"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getMaterialById } from "@/server/materials";
import {
  addPurchaseOrderLine, createPurchaseOrder, deletePurchaseOrderLine, getPurchaseOrder,
  markPurchaseOrderMyobFailed, markPurchaseOrderMyobPending,
  savePurchasingDefaults, setPurchaseOrderStatus, updatePurchaseOrderHeader, updatePurchaseOrderLine
} from "@/server/purchasing";
import { fetchMyobPurchasingReferenceDataForTenant, pushPurchaseOrderToMyobForTenant } from "@/server/myob-sync";
import { sendPurchaseOrderEmailForTenant } from "@/server/purchase-order-email";

function str(fd: FormData, key: string) { return String(fd.get(key) ?? "").trim(); }
function numberString(fd: FormData, key: string, fallback = "0") {
  const raw = str(fd, key).replace(/,/g, "");
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? String(n) : fallback;
}
async function tenant() {
  const user = await getRequiredSessionUser();
  const active = await resolveActiveTenantForAuthUserId(user.id);
  if (!active) redirect("/bootstrap");
  return active!;
}
function err(e: unknown) { return e instanceof Error ? e.message : String(e); }
function target(poId: string, kind: "message"|"error", text: string) { return `/purchasing?selected=${encodeURIComponent(poId)}&${kind}=${encodeURIComponent(text)}`; }

export async function startPurchaseOrderAction(formData: FormData) {
  const active = await tenant();
  const supplierId = str(formData, "supplierId");
  const materialId = str(formData, "materialId") || null;
  if (!supplierId) redirect("/purchasing?error=Choose%20a%20supplier%20first");
  if (materialId) {
    const material = await getMaterialById(active.tenantId, materialId);
    if (!material) redirect("/purchasing?error=Material%20not%20found");
    if (material.supplierId && material.supplierId !== supplierId) redirect("/purchasing?error=That%20material%20belongs%20to%20a%20different%20supplier");
  }
  let po: { id: string; poNumber: string } | null = null;
  let errorMessage = "";
  try { po = await createPurchaseOrder(active.tenantId, { supplierId, materialId }); }
  catch (e) { errorMessage = err(e); }
  if (errorMessage || !po) redirect(`/purchasing?error=${encodeURIComponent(errorMessage || "Could not create purchase order")}`);
  redirect(target(po.id, "message", `${po.poNumber} created`));
}

export async function addPurchaseOrderLineAction(formData: FormData) {
  const active = await tenant();
  const purchaseOrderId = str(formData, "purchaseOrderId");
  const materialId = str(formData, "materialId");
  if (!purchaseOrderId || !materialId) redirect(target(purchaseOrderId, "error", "Choose a material"));
  const [po, material] = await Promise.all([getPurchaseOrder(active.tenantId, purchaseOrderId), getMaterialById(active.tenantId, materialId)]);
  if (!po || !material) redirect(target(purchaseOrderId, "error", "Purchase order or material was not found"));
  if (po.status !== "draft") redirect(target(purchaseOrderId, "error", "Only draft purchase orders can be edited"));
  if (material.supplierId && material.supplierId !== po.supplierId) redirect(target(purchaseOrderId, "error", "That material is assigned to a different supplier"));
  await addPurchaseOrderLine(active.tenantId, purchaseOrderId, {
    materialId, quantity: numberString(formData, "quantity", "1"),
    unitCost: str(formData, "unitCost") ? numberString(formData, "unitCost", "0") : String(material.purchaseCost ?? "0"),
    description: str(formData, "description") || null
  });
  redirect(target(purchaseOrderId, "message", "Material added to PO"));
}

export async function updatePurchaseOrderLineAction(formData: FormData) {
  const active = await tenant(); const poId = str(formData, "purchaseOrderId"); const lineId = str(formData, "lineId");
  if (!poId || !lineId) redirect("/purchasing?error=Missing%20purchase%20order%20line");
  const po = await getPurchaseOrder(active.tenantId, poId); if (!po || po.status !== "draft") redirect(target(poId, "error", "Only draft purchase orders can be edited"));
  await updatePurchaseOrderLine(active.tenantId, lineId, { quantity: numberString(formData, "quantity", "1"), unitCost: numberString(formData, "unitCost", "0"), description: str(formData, "description") || null });
  redirect(target(poId, "message", "PO line updated"));
}

export async function deletePurchaseOrderLineAction(formData: FormData) {
  const active = await tenant(); const poId = str(formData, "purchaseOrderId"); const lineId = str(formData, "lineId");
  const po = await getPurchaseOrder(active.tenantId, poId); if (!po || po.status !== "draft") redirect(target(poId, "error", "Only draft purchase orders can be edited"));
  if (lineId) await deletePurchaseOrderLine(active.tenantId, lineId);
  redirect(target(poId, "message", "PO line removed"));
}

export async function updatePurchaseOrderHeaderAction(formData: FormData) {
  const active = await tenant(); const poId = str(formData, "purchaseOrderId");
  if (!poId) redirect("/purchasing?error=Missing%20purchase%20order");
  await updatePurchaseOrderHeader(active.tenantId, poId, { promisedDate: str(formData, "promisedDate") || null, shipToAddress: str(formData, "shipToAddress") || null, notes: str(formData, "notes") || null });
  redirect(target(poId, "message", "Purchase order details saved"));
}

export async function sendPurchaseOrderToMyobAction(formData: FormData) {
  const active = await tenant(); const poId = str(formData, "purchaseOrderId");
  if (!poId) redirect("/purchasing?error=Missing%20purchase%20order");
  let result: {number:string|null}|null=null, errorMessage="";
  try {
    await markPurchaseOrderMyobPending(active.tenantId, poId);
    result = await pushPurchaseOrderToMyobForTenant(active.tenantId, poId);
  } catch (e) {
    errorMessage = err(e);
    await markPurchaseOrderMyobFailed(active.tenantId, poId, errorMessage).catch(()=>undefined);
  }
  redirect(target(poId, errorMessage ? "error" : "message", errorMessage || `MYOB synced${result?.number ? ` as ${result.number}` : ""}`));
}

export async function emailPurchaseOrderOnlyAction(formData: FormData) {
  const active = await tenant(); const poId = str(formData, "purchaseOrderId");
  if (!poId) redirect("/purchasing?error=Missing%20purchase%20order");
  let result: {recipient:string}|null=null, errorMessage="";
  try { result = await sendPurchaseOrderEmailForTenant(active.tenantId, poId); }
  catch (e) { errorMessage = err(e); }
  redirect(target(poId, errorMessage ? "error" : "message", errorMessage || `Purchase order emailed to ${result?.recipient ?? "supplier"}`));
}

export async function sendPurchaseOrderAction(formData: FormData) {
  const active = await tenant(); const poId = str(formData, "purchaseOrderId");
  if (!poId) redirect("/purchasing?error=Missing%20purchase%20order");
  const po = await getPurchaseOrder(active.tenantId, poId);
  if (!po) redirect("/purchasing?error=Purchase%20order%20not%20found");

  let myobMessage = "MYOB not attempted";
  let emailMessage = "Email not attempted";
  let myobOk = false;
  let emailOk = false;
  try {
    await markPurchaseOrderMyobPending(active.tenantId, poId);
    const result = await pushPurchaseOrderToMyobForTenant(active.tenantId, poId);
    myobOk = true;
    myobMessage = `MYOB synced${result.number ? ` as ${result.number}` : ""}`;
  } catch (e) {
    myobMessage = `MYOB sync failed: ${err(e)}`;
    await markPurchaseOrderMyobFailed(active.tenantId, poId, err(e)).catch(()=>undefined);
  }

  try {
    const result = await sendPurchaseOrderEmailForTenant(active.tenantId, poId);
    emailOk = true;
    emailMessage = `Email sent to ${result.recipient}`;
  } catch (e) {
    emailMessage = err(e);
  }

  const summary = `${emailOk ? "✓" : "✕"} ${emailMessage} · ${myobOk ? "✓" : "✕"} ${myobMessage}`;
  redirect(target(poId, myobOk && emailOk ? "message" : "error", summary));
}

export async function savePurchasingDefaultsAction(formData: FormData) {
  const active = await tenant(); const expenseUid = str(formData, "expenseAccountUid"); const taxUid = str(formData, "taxCodeUid");
  if (!expenseUid || !taxUid) redirect("/purchasing?error=Choose%20both%20an%20expense%20account%20and%20tax%20code");
  let errorMessage = "";
  try {
    const refs = await fetchMyobPurchasingReferenceDataForTenant(active.tenantId);
    const account = refs.accounts.find((x)=>x.uid===expenseUid); const tax = refs.taxCodes.find((x)=>x.uid===taxUid);
    if (!account || !tax) throw new Error("Selected MYOB account or tax code is no longer available.");
    await savePurchasingDefaults(active.tenantId, { expenseAccountUid:account.uid, expenseAccountName:account.name, expenseAccountDisplayId:account.displayId, taxCodeUid:tax.uid, taxCode:tax.code });
  } catch(e) { errorMessage = err(e); }
  revalidatePath("/purchasing"); revalidatePath("/materials");
  redirect(`/purchasing?${errorMessage ? `error=${encodeURIComponent(errorMessage)}` : "message=MYOB%20purchasing%20defaults%20saved"}`);
}

export async function setPurchaseOrderStatusAction(formData: FormData) {
  const active=await tenant(); const poId=str(formData,"purchaseOrderId"); const status=str(formData,"status");
  if (!poId || !["draft","ordered","received","cancelled"].includes(status)) redirect("/purchasing?error=Invalid%20status");
  await setPurchaseOrderStatus(active.tenantId,poId,status as "draft"|"ordered"|"received"|"cancelled");
  redirect(target(poId,"message",`PO marked ${status}`));
}
