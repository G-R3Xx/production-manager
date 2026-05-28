import "server-only";

import { pool } from "@production-manager/db/client";

export type MyobConnectionRecord = {
  id: string;
  tenantId: string;
  environment: "sandbox" | "live";
  companyFileId: string | null;
  companyName: string | null;
  status: "disconnected" | "connected" | "error";
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MyobOauthTokenRecord = {
  id: string;
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string | null;
  scope: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExternalMappingRecord = {
  id: string;
  tenantId: string;
  system: "myob";
  entityType:
    | "customer"
    | "supplier"
    | "product"
    | "invoice"
    | "tax_code"
    | "account"
    | "quote"
    | "order";
  localId: string;
  externalId: string;
  syncState: "pending" | "synced" | "stale" | "error";
  lastSyncedAt: string | null;
  payloadJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SyncRunRecord = {
  id: string;
  tenantId: string;
  integrationName: "myob";
  jobType:
    | "full_import"
    | "incremental_import"
    | "push_customers"
    | "push_products"
    | "push_invoices"
    | "reconcile";
  status: "queued" | "running" | "success" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  summaryJson: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export async function getMyobConnectionByTenantId(
  tenantId: string
): Promise<MyobConnectionRecord | null> {
  const result = await pool.query<MyobConnectionRecord>(
    `
      SELECT
        id,
        tenant_id AS "tenantId",
        environment,
        company_file_id AS "companyFileId",
        company_name AS "companyName",
        status,
        connected_at AS "connectedAt",
        disconnected_at AS "disconnectedAt",
        last_successful_sync_at AS "lastSuccessfulSyncAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM integration.myob_connections
      WHERE tenant_id = $1::uuid
      LIMIT 1
    `,
    [tenantId]
  );

  return result.rows[0] ?? null;
}

export async function upsertMyobConnectionByTenantId(
  tenantId: string,
  input: {
    environment: "sandbox" | "live";
    companyFileId?: string | null;
    companyName?: string | null;
    status: "disconnected" | "connected" | "error";
    connectedAt?: string | null;
    disconnectedAt?: string | null;
    lastSuccessfulSyncAt?: string | null;
  }
): Promise<void> {
  await pool.query(
    `
      INSERT INTO integration.myob_connections (
        tenant_id,
        environment,
        company_file_id,
        company_name,
        status,
        connected_at,
        disconnected_at,
        last_successful_sync_at,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::myob_environment,
        $3::varchar,
        $4::varchar,
        $5::myob_connection_status,
        $6::timestamptz,
        $7::timestamptz,
        $8::timestamptz,
        now(),
        now()
      )
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        environment = EXCLUDED.environment,
        company_file_id = EXCLUDED.company_file_id,
        company_name = EXCLUDED.company_name,
        status = EXCLUDED.status,
        connected_at = EXCLUDED.connected_at,
        disconnected_at = EXCLUDED.disconnected_at,
        last_successful_sync_at = EXCLUDED.last_successful_sync_at,
        updated_at = now()
    `,
    [
      tenantId,
      input.environment,
      input.companyFileId ?? null,
      input.companyName ?? null,
      input.status,
      input.connectedAt ?? null,
      input.disconnectedAt ?? null,
      input.lastSuccessfulSyncAt ?? null
    ]
  );
}

export async function getMyobOauthTokenByTenantId(
  tenantId: string
): Promise<MyobOauthTokenRecord | null> {
  const result = await pool.query<MyobOauthTokenRecord>(
    `
      SELECT
        id,
        tenant_id AS "tenantId",
        access_token AS "accessToken",
        refresh_token AS "refreshToken",
        token_type AS "tokenType",
        scope,
        expires_at AS "expiresAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM integration.myob_oauth_tokens
      WHERE tenant_id = $1::uuid
      LIMIT 1
    `,
    [tenantId]
  );

  return result.rows[0] ?? null;
}

export async function upsertMyobOauthTokenByTenantId(
  tenantId: string,
  input: {
    accessToken: string;
    refreshToken: string;
    tokenType?: string | null;
    scope?: string | null;
    expiresAt?: string | null;
  }
): Promise<void> {
  await pool.query(
    `
      INSERT INTO integration.myob_oauth_tokens (
        tenant_id,
        access_token,
        refresh_token,
        token_type,
        scope,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::text,
        $3::text,
        $4::varchar,
        $5::text,
        $6::timestamptz,
        now(),
        now()
      )
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_type = EXCLUDED.token_type,
        scope = EXCLUDED.scope,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    `,
    [
      tenantId,
      input.accessToken,
      input.refreshToken,
      input.tokenType ?? null,
      input.scope ?? null,
      input.expiresAt ?? null
    ]
  );
}

export async function clearMyobOauthTokenByTenantId(tenantId: string): Promise<void> {
  await pool.query(
    `DELETE FROM integration.myob_oauth_tokens WHERE tenant_id = $1::uuid`,
    [tenantId]
  );
}

export async function disconnectMyobConnectionByTenantId(
  tenantId: string
): Promise<void> {
  await upsertMyobConnectionByTenantId(tenantId, {
    environment: "sandbox",
    companyFileId: null,
    companyName: null,
    status: "disconnected",
    connectedAt: null,
    disconnectedAt: new Date().toISOString(),
    lastSuccessfulSyncAt: null
  });

  await clearMyobOauthTokenByTenantId(tenantId);
}

export async function listExternalMappingsByTenantId(
  tenantId: string
): Promise<ExternalMappingRecord[]> {
  const result = await pool.query<
    Omit<ExternalMappingRecord, "payloadJson"> & { payloadJson: unknown }
  >(
    `
      SELECT
        id,
        tenant_id AS "tenantId",
        system,
        entity_type AS "entityType",
        local_id AS "localId",
        external_id AS "externalId",
        sync_state AS "syncState",
        last_synced_at AS "lastSyncedAt",
        payload_json AS "payloadJson",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM integration.external_mappings
      WHERE tenant_id = $1::uuid
      ORDER BY created_at DESC
    `,
    [tenantId]
  );

  return result.rows.map((row) => ({
    ...row,
    payloadJson: parseJsonObject(row.payloadJson)
  }));
}

export async function listSyncRunsByTenantId(
  tenantId: string
): Promise<SyncRunRecord[]> {
  const result = await pool.query<
    Omit<SyncRunRecord, "summaryJson"> & { summaryJson: unknown }
  >(
    `
      SELECT
        id,
        tenant_id AS "tenantId",
        integration_name AS "integrationName",
        job_type AS "jobType",
        status,
        started_at AS "startedAt",
        finished_at AS "finishedAt",
        summary_json AS "summaryJson",
        error_message AS "errorMessage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM integration.sync_runs
      WHERE tenant_id = $1::uuid
      ORDER BY created_at DESC
    `,
    [tenantId]
  );

  return result.rows.map((row) => ({
    ...row,
    summaryJson: parseJsonObject(row.summaryJson)
  }));
}

export async function createSyncRunForTenant(
  tenantId: string,
  jobType:
    | "full_import"
    | "incremental_import"
    | "push_customers"
    | "push_products"
    | "push_invoices"
    | "reconcile",
  status: "queued" | "running" | "success" | "error" = "queued",
  summaryJson: Record<string, unknown> = {},
  errorMessage: string | null = null
): Promise<void> {
  await pool.query(
    `
      INSERT INTO integration.sync_runs (
        tenant_id,
        integration_name,
        job_type,
        status,
        summary_json,
        error_message,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        'myob'::integration_system,
        $2::sync_run_job_type,
        $3::sync_run_status,
        $4::jsonb,
        $5::text,
        now(),
        now()
      )
    `,
    [tenantId, jobType, status, JSON.stringify(summaryJson), errorMessage]
  );
}

export async function startMyobConnectScaffold(
  tenantId: string,
  environment: "sandbox" | "live"
): Promise<void> {
  await upsertMyobConnectionByTenantId(tenantId, {
    environment,
    companyFileId: null,
    companyName: null,
    status: "connected",
    connectedAt: new Date().toISOString(),
    disconnectedAt: null,
    lastSuccessfulSyncAt: null
  });

  await createSyncRunForTenant(
    tenantId,
    "incremental_import",
    "queued",
    {
      source: "startMyobConnectScaffold"
    },
    null
  );
}

export async function listMyobConnectionsForTenant(
  tenantId: string
): Promise<MyobConnectionRecord[]> {
  const connection = await getMyobConnectionByTenantId(tenantId);
  return connection ? [connection] : [];
}

export async function listSyncRunsForTenant(
  tenantId: string
): Promise<SyncRunRecord[]> {
  return listSyncRunsByTenantId(tenantId);
}
