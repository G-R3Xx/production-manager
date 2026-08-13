"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/server/tenant/tenant-context";
import {
  createSyncRunForTenant,
  disconnectMyobConnectionByTenantId,
  startMyobConnectScaffold,
  upsertMyobConnectionByTenantId
} from "@/server/integrations";
import { importMyobCustomersAndCreateMappings, importMyobItemsAndCreateMappings, importMyobSuppliersAndCreateMappings, runMyobReadOnlySync, syncLocalCustomerToMyobForTenant, syncLocalSupplierToMyobForTenant, syncLocalMaterialToMyobForTenant } from "@/server/myob-sync";
import { listCustomersForTenant, isDeletedCustomer } from "@/server/customers";
import { listSuppliersForTenant } from "@/server/suppliers";
import { listMaterialsForTenant } from "@/server/materials";

type SyncRunJobType =
  | "full_import"
  | "incremental_import"
  | "push_customers"
  | "push_products"
  | "push_invoices"
  | "reconcile";

async function requireReadyTenant() {
  const tenantContext = await getTenantContext();

  if (tenantContext.status !== "ready") {
    throw new Error("Tenant context is not ready.");
  }

  return tenantContext.activeTenantId;
}

export async function saveMyobConnectionAction(formData: FormData) {
  const tenantId = await requireReadyTenant();

  const environment = String(formData.get("environment") ?? "sandbox") as
    | "sandbox"
    | "live";

  const companyFileId = String(formData.get("companyFileId") ?? "").trim() || null;
  const companyName = String(formData.get("companyName") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "disconnected") as
    | "disconnected"
    | "connected"
    | "error";

  await upsertMyobConnectionByTenantId(tenantId, {
    environment,
    companyFileId,
    companyName,
    status,
    connectedAt: status === "connected" ? new Date().toISOString() : null,
    disconnectedAt: status === "disconnected" ? new Date().toISOString() : null,
    lastSuccessfulSyncAt: null
  });

  revalidatePath("/integrations");
  revalidatePath("/dashboard");
}

export async function startMyobConnectAction(formData: FormData) {
  const tenantId = await requireReadyTenant();

  const environment = (String(formData.get("environment") ?? "sandbox") ||
    "sandbox") as "sandbox" | "live";

  await startMyobConnectScaffold(tenantId, environment);

  revalidatePath("/integrations");
  revalidatePath("/dashboard");
}

export async function queueMyobSyncAction(formData: FormData) {
  const tenantId = await requireReadyTenant();

  const jobType = (String(formData.get("jobType") ?? "incremental_import") ||
    "incremental_import") as SyncRunJobType;

  await createSyncRunForTenant(
    tenantId,
    jobType,
    "queued",
    {
      source: "queueMyobSyncAction"
    },
    null
  );

  revalidatePath("/integrations");
  revalidatePath("/dashboard");
}

export async function disconnectMyobConnectionAction() {
  const tenantId = await requireReadyTenant();

  await disconnectMyobConnectionByTenantId(tenantId);

  revalidatePath("/integrations");
  revalidatePath("/dashboard");
}


export async function runMyobReadOnlySyncAction() {
  const tenantId = await requireReadyTenant();

  await runMyobReadOnlySync(tenantId);

  revalidatePath("/integrations");
  revalidatePath("/dashboard");
}


export async function importMyobCustomersAction() {
  const tenantId = await requireReadyTenant();

  await importMyobCustomersAndCreateMappings(tenantId);

  revalidatePath("/integrations");
  revalidatePath("/dashboard");
  revalidatePath("/clients");
  revalidatePath("/quotes");
}


export async function importMyobItemsAction() {
  const tenantId = await requireReadyTenant();

  await importMyobItemsAndCreateMappings(tenantId);

  revalidatePath("/integrations");
  revalidatePath("/dashboard");
  revalidatePath("/products");
}


export async function importMyobSuppliersAction() {
  const tenantId = await requireReadyTenant();
  let count = 0;
  let errorMessage = "";
  try {
    const result = await importMyobSuppliersAndCreateMappings(tenantId);
    count = result.importedCount;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }
  revalidatePath("/suppliers"); revalidatePath("/materials"); revalidatePath("/integrations");
  redirect(`/integrations?${errorMessage ? `error=${encodeURIComponent(errorMessage)}` : `message=${encodeURIComponent(`Imported ${count} MYOB suppliers`)}`}`);
}

export async function pushProductionManagerMasterDataToMyobAction() {
  const tenantId = await requireReadyTenant();
  const [customers, suppliers, materials] = await Promise.all([
    listCustomersForTenant(tenantId),
    listSuppliersForTenant(tenantId),
    listMaterialsForTenant(tenantId)
  ]);
  const activeCustomers = customers.filter((row) => row.isActive && !isDeletedCustomer(row));
  const activeSuppliers = suppliers.filter((row) => row.isActive);
  const activeMaterials = materials.filter((row) => row.active);
  let customerCount=0, supplierCount=0, materialCount=0;
  const failures:string[]=[];
  for (const row of activeCustomers) {
    try { await syncLocalCustomerToMyobForTenant(tenantId,row.id); customerCount++; }
    catch(error){ failures.push(`Client ${row.displayName}: ${error instanceof Error?error.message:String(error)}`); }
  }
  for (const row of activeSuppliers) {
    try { await syncLocalSupplierToMyobForTenant(tenantId,row.id); supplierCount++; }
    catch(error){ failures.push(`Supplier ${row.displayName}: ${error instanceof Error?error.message:String(error)}`); }
  }
  for (const row of activeMaterials) {
    try { await syncLocalMaterialToMyobForTenant(tenantId,row.id); materialCount++; }
    catch(error){ failures.push(`Material ${row.name}: ${error instanceof Error?error.message:String(error)}`); }
  }
  revalidatePath("/clients"); revalidatePath("/suppliers"); revalidatePath("/materials"); revalidatePath("/integrations");
  const summary=`Pushed ${customerCount} clients, ${supplierCount} suppliers and ${materialCount} materials to MYOB.`;
  if (failures.length) redirect(`/integrations?error=${encodeURIComponent(`${summary} ${failures.length} failed: ${failures.slice(0,3).join(" | ")}${failures.length>3?" | …":""}`)}`);
  redirect(`/integrations?message=${encodeURIComponent(summary)}`);
}
