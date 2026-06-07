"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/server/tenant/tenant-context";
import {
  createSyncRunForTenant,
  disconnectMyobConnectionByTenantId,
  startMyobConnectScaffold,
  upsertMyobConnectionByTenantId
} from "@/server/integrations";
import { importMyobCustomersAndCreateMappings, importMyobItemsAndCreateMappings, runMyobReadOnlySync } from "@/server/myob-sync";

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
}


export async function importMyobItemsAction() {
  const tenantId = await requireReadyTenant();

  await importMyobItemsAndCreateMappings(tenantId);

  revalidatePath("/integrations");
  revalidatePath("/dashboard");
  revalidatePath("/products");
}
