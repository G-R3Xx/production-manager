import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { pool } from "@production-manager/db";
import { createSyncRunForTenant, getMyobConnectionByTenantId } from "@/server/integrations";
import { createNotificationForTenant } from "@/server/notifications";
import {
  syncLocalCustomerToMyobForTenant,
  syncLocalMaterialToMyobForTenant,
  syncLocalSupplierToMyobForTenant
} from "@/server/myob-sync";

export type MyobMasterEntityType = "customer" | "supplier" | "material";
export type MyobMasterSyncStatus = "pending" | "syncing" | "synced" | "error";

type SyncResult = { uid?: string; number?: string | null; displayId?: string | null };

function cleanError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

function isRetryable(error: unknown): boolean {
  const message = cleanError(error);
  return /timeout|timed out|aborted|fetch failed|network|ECONN|ENET|EAI_AGAIN|socket|429:|500:|502:|503:|504:/i.test(message);
}

function hrefFor(type: MyobMasterEntityType, id: string): string {
  if (type === "customer") return `/clients?selected=${encodeURIComponent(id)}`;
  if (type === "supplier") return "/suppliers";
  return "/materials";
}

async function entityLabel(tenantId: string, type: MyobMasterEntityType, id: string): Promise<string> {
  const table = type === "customer" ? "app.customers" : type === "supplier" ? "app.suppliers" : "catalog.materials";
  const field = type === "material" ? "name" : "display_name";
  const result = await pool.query<{ label: string | null }>(`SELECT ${field}::text AS label FROM ${table} WHERE tenant_id=$1::uuid AND id=$2::uuid LIMIT 1`, [tenantId, id]);
  return result.rows[0]?.label || (type === "customer" ? "Client" : type === "supplier" ? "Supplier" : "Material");
}

async function markStatus(
  tenantId: string,
  type: MyobMasterEntityType,
  id: string,
  status: MyobMasterSyncStatus,
  input: { token?: string; error?: string | null; attempt?: number; syncedAt?: string | null } = {}
): Promise<void> {
  const now = new Date().toISOString();
  const patch = {
    myobSyncStatus: status,
    myobSyncError: input.error ?? "",
    myobSyncQueueToken: input.token ?? "",
    myobSyncAttempts: input.attempt ?? 0,
    ...(status === "pending" ? { myobSyncQueuedAt: now } : {}),
    ...(status === "syncing" ? { myobSyncStartedAt: now } : {}),
    ...(status === "synced" ? { myobSyncedAt: input.syncedAt ?? now } : {}),
    ...(status === "error" ? { myobSyncFailedAt: now } : {})
  };

  if (type === "customer") {
    await pool.query(`UPDATE app.customers SET payload_json=COALESCE(payload_json,'{}'::jsonb)||$3::jsonb,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, id, JSON.stringify(patch)]);
    return;
  }
  if (type === "supplier") {
    await pool.query(`UPDATE app.suppliers SET payload_json=COALESCE(payload_json,'{}'::jsonb)||$3::jsonb,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, id, JSON.stringify(patch)]);
    return;
  }
  await pool.query(`UPDATE catalog.materials SET myob_sync_state=$3::varchar,myob_payload_json=COALESCE(myob_payload_json,'{}'::jsonb)||$4::jsonb,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, id, status, JSON.stringify(patch)]);
}

async function currentQueueToken(tenantId: string, type: MyobMasterEntityType, id: string): Promise<string> {
  if (type === "customer") {
    const result = await pool.query<{ token: string | null }>(`SELECT payload_json->>'myobSyncQueueToken' AS token FROM app.customers WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, id]);
    return result.rows[0]?.token ?? "";
  }
  if (type === "supplier") {
    const result = await pool.query<{ token: string | null }>(`SELECT payload_json->>'myobSyncQueueToken' AS token FROM app.suppliers WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, id]);
    return result.rows[0]?.token ?? "";
  }
  const result = await pool.query<{ token: string | null }>(`SELECT myob_payload_json->>'myobSyncQueueToken' AS token FROM catalog.materials WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, id]);
  return result.rows[0]?.token ?? "";
}

async function executeSync(tenantId: string, type: MyobMasterEntityType, id: string): Promise<SyncResult> {
  if (type === "customer") return syncLocalCustomerToMyobForTenant(tenantId, id);
  if (type === "supplier") return syncLocalSupplierToMyobForTenant(tenantId, id);
  return syncLocalMaterialToMyobForTenant(tenantId, id);
}

async function logRun(tenantId: string, type: MyobMasterEntityType, id: string, status: "success" | "error", input: { attempts: number; error?: string; result?: SyncResult }): Promise<void> {
  await createSyncRunForTenant(tenantId, "reconcile", status, {
    source: "automatic_master_data_sync",
    entityType: type,
    localId: id,
    attempts: input.attempts,
    ...(input.result ? { result: input.result } : {})
  }, input.error ?? null).catch((error) => console.error("Could not record automatic MYOB sync run", error));
}

async function processQueuedSync(tenantId: string, type: MyobMasterEntityType, id: string, token: string): Promise<void> {
  if ((await currentQueueToken(tenantId, type, id)) !== token) return;

  const delays = [0, 1500];
  let lastError = "";
  for (let index = 0; index < delays.length; index += 1) {
    if ((await currentQueueToken(tenantId, type, id)) !== token) return;
    if (delays[index]) await new Promise((resolve) => setTimeout(resolve, delays[index]));
    const attempt = index + 1;
    await markStatus(tenantId, type, id, "syncing", { token, attempt });
    try {
      const result = await executeSync(tenantId, type, id);
      await markStatus(tenantId, type, id, "synced", { token, attempt, syncedAt: new Date().toISOString() });
      await logRun(tenantId, type, id, "success", { attempts: attempt, result });
      return;
    } catch (error) {
      lastError = cleanError(error);
      if (!isRetryable(error) || attempt === delays.length) break;
    }
  }

  await markStatus(tenantId, type, id, "error", { token, error: lastError, attempt: delays.length });
  await logRun(tenantId, type, id, "error", { attempts: delays.length, error: lastError });
  const label = await entityLabel(tenantId, type, id);
  await createNotificationForTenant(tenantId, {
    eventType: "myob_sync_failed",
    title: `MYOB sync failed · ${label}`,
    message: lastError,
    href: hrefFor(type, id),
    payloadJson: { entityType: type, localId: id }
  }).catch((error) => console.error("Could not create MYOB sync failure alert", error));
}

export async function queueMyobMasterDataSync(tenantId: string, type: MyobMasterEntityType, id: string): Promise<boolean> {
  const connection = await getMyobConnectionByTenantId(tenantId);
  if (connection?.status !== "connected" || !connection.companyFileId) return false;

  const token = randomUUID();
  await markStatus(tenantId, type, id, "pending", { token });
  after(async () => {
    try {
      await processQueuedSync(tenantId, type, id, token);
    } catch (error) {
      console.error("Automatic MYOB master-data sync crashed", { tenantId, type, id, error });
      const message = cleanError(error);
      await markStatus(tenantId, type, id, "error", { token, error: message }).catch(() => undefined);
    }
  });
  return true;
}

export async function runMyobMasterDataSyncNow(tenantId: string, type: MyobMasterEntityType, id: string): Promise<SyncResult> {
  const token = randomUUID();
  await markStatus(tenantId, type, id, "syncing", { token, attempt: 1 });
  try {
    const result = await executeSync(tenantId, type, id);
    await markStatus(tenantId, type, id, "synced", { token, attempt: 1, syncedAt: new Date().toISOString() });
    await logRun(tenantId, type, id, "success", { attempts: 1, result });
    return result;
  } catch (error) {
    const message = cleanError(error);
    await markStatus(tenantId, type, id, "error", { token, error: message, attempt: 1 });
    await logRun(tenantId, type, id, "error", { attempts: 1, error: message });
    throw error;
  }
}
