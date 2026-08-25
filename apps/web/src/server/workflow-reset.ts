import "server-only";

import { pool } from "@production-manager/db";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const WORKFLOW_RESET_CONFIRMATION = "RESET WORKFLOW DATA";

export type WorkflowResetPreview = {
  enquiries: number;
  surveys: number;
  quotes: number;
  artworkApprovals: number;
  productionJobs: number;
  workspaceJobs: number;
  calendarTasks: number;
  invoices: number;
  websiteOrders: number;
  myobTransactionMappings: number;
  workflowNotifications: number;
  legacyQuotes: number;
};

export type WorkflowResetResult = {
  removed: WorkflowResetPreview;
  storageFilesRemoved: number;
  storageWarnings: string[];
};

type DbExecutor = { query: (...args: any[]) => Promise<any> };

const zeroPreview = (): WorkflowResetPreview => ({
  enquiries: 0,
  surveys: 0,
  quotes: 0,
  artworkApprovals: 0,
  productionJobs: 0,
  workspaceJobs: 0,
  calendarTasks: 0,
  invoices: 0,
  websiteOrders: 0,
  myobTransactionMappings: 0,
  workflowNotifications: 0,
  legacyQuotes: 0
});

async function relationExists(db: DbExecutor, relation: string): Promise<boolean> {
  const result = await db.query(
    `SELECT to_regclass($1::text) IS NOT NULL AS exists`,
    [relation]
  ) as { rows: Array<{ exists: boolean }> };
  return Boolean(result.rows[0]?.exists);
}

async function countTenantRows(db: DbExecutor, relation: string, tenantId: string, extraWhere = "", params: unknown[] = []): Promise<number> {
  if (!(await relationExists(db, relation))) return 0;
  const result = await db.query(
    `SELECT count(*)::text AS count FROM ${relation} WHERE tenant_id=$1::uuid ${extraWhere}`,
    [tenantId, ...params]
  ) as { rows: Array<{ count: string }> };
  return Number(result.rows[0]?.count ?? 0);
}

const workflowNotificationWhere = `
  AND (
    event_type IN ('new_enquiry','new_job','quote_line_response','artwork_approved','artwork_changes_requested')
    OR href LIKE '/enquiries%'
    OR href LIKE '/surveys%'
    OR href LIKE '/quotes%'
    OR href LIKE '/artwork-approvals%'
    OR href LIKE '/production%'
    OR href LIKE '/dashboard%'
    OR href LIKE '/calendar%'
    OR COALESCE(payload_json->>'entityType','') IN ('quote','order','invoice')
  )
`;

export async function previewWorkflowResetForTenant(tenantId: string): Promise<WorkflowResetPreview> {
  if (!process.env.DATABASE_URL) return zeroPreview();

  const [
    enquiries,
    surveys,
    quotes,
    artworkApprovals,
    productionJobs,
    workspaceJobs,
    calendarTasks,
    invoices,
    websiteOrders,
    myobTransactionMappings,
    workflowNotifications,
    legacyQuotes
  ] = await Promise.all([
    countTenantRows(pool, "app.enquiries", tenantId),
    countTenantRows(pool, "app.survey_requests", tenantId),
    countTenantRows(pool, "sales.quote_drafts", tenantId),
    countTenantRows(pool, "sales.artwork_approvals", tenantId),
    countTenantRows(pool, "production.production_jobs", tenantId),
    countTenantRows(pool, "app.jobs", tenantId),
    countTenantRows(pool, "app.job_tasks", tenantId),
    countTenantRows(pool, "app.invoices", tenantId),
    countTenantRows(pool, "integration.wordpress_orders", tenantId),
    countTenantRows(pool, "integration.external_mappings", tenantId, `AND entity_type::text IN ('quote','order','invoice')`),
    countTenantRows(pool, "app.notifications", tenantId, workflowNotificationWhere),
    countTenantRows(pool, "app.quotes", tenantId)
  ]);

  return {
    enquiries,
    surveys,
    quotes,
    artworkApprovals,
    productionJobs,
    workspaceJobs,
    calendarTasks,
    invoices,
    websiteOrders,
    myobTransactionMappings,
    workflowNotifications,
    legacyQuotes
  };
}

async function deleteTenantRows(db: DbExecutor, relation: string, tenantId: string, extraWhere = ""): Promise<number> {
  if (!(await relationExists(db, relation))) return 0;
  const result = await db.query(`DELETE FROM ${relation} WHERE tenant_id=$1::uuid ${extraWhere}`, [tenantId]);
  return result.rowCount ?? 0;
}

async function removeStorageTree(bucket: string, prefix: string): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const files: string[] = [];

  async function walk(path: string, depth: number): Promise<void> {
    if (depth > 12) throw new Error(`Storage path is unexpectedly deep under ${bucket}/${prefix}.`);

    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(path, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" }
      });
      if (error) {
        // A missing bucket or empty/unavailable prefix should not block the database reset.
        if (/not found|does not exist/i.test(error.message)) return;
        throw error;
      }
      const entries = data ?? [];
      for (const entry of entries) {
        const fullPath = path ? `${path}/${entry.name}` : entry.name;
        const isFolder = !entry.id && !entry.metadata;
        if (isFolder) await walk(fullPath, depth + 1);
        else files.push(fullPath);
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  }

  await walk(prefix.replace(/^\/+|\/+$/g, ""), 0);
  let removed = 0;
  for (let index = 0; index < files.length; index += 100) {
    const batch = files.slice(index, index + 100);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw error;
    removed += batch.length;
  }
  return removed;
}

async function cleanupWorkflowStorageForTenant(tenantId: string): Promise<{ removed: number; warnings: string[] }> {
  const targets = [
    { bucket: "artwork-approvals", prefix: tenantId },
    { bucket: "production-files", prefix: tenantId },
    { bucket: "enquiry-correspondence", prefix: `${tenantId}/enquiries` },
    { bucket: "client-assets", prefix: `${tenantId}/enquiries` }
  ];
  let removed = 0;
  const warnings: string[] = [];

  for (const target of targets) {
    try {
      removed += await removeStorageTree(target.bucket, target.prefix);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown storage cleanup error";
      warnings.push(`${target.bucket}: ${message}`);
    }
  }
  return { removed, warnings };
}

export async function resetWorkflowDataForTenant(tenantId: string): Promise<WorkflowResetResult> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to reset workflow data.");

  const removed = zeroPreview();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Clear import/link records first so old WooCommerce orders cannot silently re-link to removed jobs.
    removed.websiteOrders = await deleteTenantRows(client, "integration.wordpress_orders", tenantId);
    if (await relationExists(client, "integration.wordpress_connections")) {
      await client.query(`UPDATE integration.wordpress_connections SET last_order_received_at=NULL,updated_at=now() WHERE tenant_id=$1::uuid`, [tenantId]);
    }
    removed.workflowNotifications = await deleteTenantRows(client, "app.notifications", tenantId, workflowNotificationWhere);
    removed.myobTransactionMappings = await deleteTenantRows(
      client,
      "integration.external_mappings",
      tenantId,
      `AND entity_type::text IN ('quote','order','invoice')`
    );

    // Workspace rows own calendar/process assignments through ON DELETE CASCADE.
    removed.calendarTasks = await countTenantRows(client, "app.job_tasks", tenantId);
    removed.workspaceJobs = await deleteTenantRows(client, "app.jobs", tenantId);

    // Delete the workflow from the end backwards. Child rows cascade from these roots.
    removed.productionJobs = await deleteTenantRows(client, "production.production_jobs", tenantId);
    removed.artworkApprovals = await deleteTenantRows(client, "sales.artwork_approvals", tenantId);
    removed.quotes = await deleteTenantRows(client, "sales.quote_drafts", tenantId);
    removed.surveys = await deleteTenantRows(client, "app.survey_requests", tenantId);
    removed.enquiries = await deleteTenantRows(client, "app.enquiries", tenantId);

    // Local transactional sales groundwork is cleared as part of the test-data reset.
    removed.invoices = await deleteTenantRows(client, "app.invoices", tenantId);
    removed.legacyQuotes = await deleteTenantRows(client, "app.quotes", tenantId);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // Storage is cleaned only after the database transaction commits. Any storage failure is reported
  // as a warning and can safely be retried because the prefixes contain workflow-only files.
  const storage = await cleanupWorkflowStorageForTenant(tenantId);
  return {
    removed,
    storageFilesRemoved: storage.removed,
    storageWarnings: storage.warnings
  };
}
