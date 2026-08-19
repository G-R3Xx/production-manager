import "server-only";

import { createHash } from "node:crypto";
import { pool } from "@production-manager/db";

export type AppNotificationRecord = {
  id: string;
  tenantId: string;
  eventType: "new_job" | "new_enquiry" | "artwork_approved" | "artwork_changes_requested" | string;
  title: string;
  message: string | null;
  href: string | null;
  payloadJson: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
};

let notificationSchemaReady = false;
let notificationSchemaPromise: Promise<void> | null = null;

export async function ensureNotificationSchema(): Promise<void> {
  if (!process.env.DATABASE_URL || notificationSchemaReady) return;
  if (notificationSchemaPromise) return notificationSchemaPromise;
  notificationSchemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app.notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
        event_type varchar(80) NOT NULL,
        title varchar(255) NOT NULL,
        message text,
        href text,
        is_read boolean NOT NULL DEFAULT false,
        payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        read_at timestamptz
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS notifications_tenant_unread_created_idx
        ON app.notifications (tenant_id, is_read, created_at DESC)
    `);
    notificationSchemaReady = true;
  })().catch((error) => {
    notificationSchemaPromise = null;
    throw error;
  });
  return notificationSchemaPromise;
}

export async function createNotificationForTenant(tenantId: string, input: {
  eventType: AppNotificationRecord["eventType"];
  title: string;
  message?: string | null;
  href?: string | null;
  payloadJson?: Record<string, unknown>;
}): Promise<void> {
  await ensureNotificationSchema();
  await pool.query(`
    INSERT INTO app.notifications (tenant_id,event_type,title,message,href,payload_json,created_at)
    VALUES ($1::uuid,$2::varchar,$3::varchar,$4::text,$5::text,$6::jsonb,now())
  `, [tenantId, input.eventType, input.title, input.message ?? null, input.href ?? null, JSON.stringify(input.payloadJson ?? {})]);
}

export type NotificationSnapshot = { notifications: AppNotificationRecord[]; unreadCount: number };

export async function listNotificationsWithUnreadForTenant(tenantId: string, limit = 12): Promise<NotificationSnapshot> {
  await ensureNotificationSchema();
  const result = await pool.query<AppNotificationRecord & { unreadCount: string }>(`
    SELECT id,tenant_id::text AS "tenantId",event_type AS "eventType",title,message,href,
      payload_json AS "payloadJson",is_read AS "isRead",created_at AS "createdAt",
      (count(*) FILTER (WHERE is_read=false) OVER ())::text AS "unreadCount"
    FROM app.notifications
    WHERE tenant_id=$1::uuid
    ORDER BY is_read ASC,created_at DESC
    LIMIT $2::int
  `, [tenantId, Math.max(1, Math.min(50, limit))]);
  return {
    notifications: result.rows.map((row: AppNotificationRecord & { unreadCount: string }) => {
      const { unreadCount: _unreadCount, ...notification } = row;
      return notification;
    }),
    unreadCount: Number(result.rows[0]?.unreadCount ?? 0)
  };
}

export async function listNotificationsForTenant(tenantId: string, limit = 12): Promise<AppNotificationRecord[]> {
  await ensureNotificationSchema();
  const result = await pool.query<AppNotificationRecord>(`
    SELECT id,tenant_id::text AS "tenantId",event_type AS "eventType",title,message,href,
      payload_json AS "payloadJson",is_read AS "isRead",created_at AS "createdAt"
    FROM app.notifications
    WHERE tenant_id=$1::uuid
    ORDER BY is_read ASC,created_at DESC
    LIMIT $2::int
  `, [tenantId, Math.max(1, Math.min(50, limit))]);
  return result.rows;
}

export async function countUnreadNotificationsForTenant(tenantId: string): Promise<number> {
  await ensureNotificationSchema();
  const result = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count FROM app.notifications WHERE tenant_id=$1::uuid AND is_read=false
  `, [tenantId]);
  return Number(result.rows[0]?.count ?? 0);
}

type AppPulseSource = {
  key: string;
  relations: string[];
  sql: string;
};

function directPulseSource(key: string, relation: string): AppPulseSource {
  return {
    key,
    relations: [relation],
    sql: `
      SELECT '${key}'::text AS activity_key,
        COALESCE(max(updated_at)::text, '') AS activity_value
      FROM ${relation}
      WHERE tenant_id=$1::uuid
    `,
  };
}

const APP_PULSE_SOURCES: AppPulseSource[] = [
  {
    key: "notifications",
    relations: ["app.notifications"],
    sql: `
      SELECT 'notifications'::text AS activity_key,
        concat(COALESCE(max(created_at)::text, ''), ':', COALESCE(max(read_at)::text, '')) AS activity_value
      FROM app.notifications
      WHERE tenant_id=$1::uuid
    `,
  },
  directPulseSource("enquiries", "app.enquiries"),
  directPulseSource("surveys", "app.survey_requests"),
  directPulseSource("jobs", "app.jobs"),
  directPulseSource("job_process_assignments", "app.job_process_assignments"),
  directPulseSource("job_tasks", "app.job_tasks"),
  directPulseSource("customers", "app.customers"),
  directPulseSource("suppliers", "app.suppliers"),
  directPulseSource("memberships", "app.memberships"),
  {
    key: "staff_profiles",
    relations: ["app.user_profiles", "app.memberships"],
    sql: `
      SELECT 'staff_profiles'::text AS activity_key,
        COALESCE(max(profile.updated_at)::text, '') AS activity_value
      FROM app.user_profiles profile
      INNER JOIN app.memberships membership ON membership.user_profile_id=profile.id
      WHERE membership.tenant_id=$1::uuid
    `,
  },
  directPulseSource("tenant_settings", "app.tenant_settings"),
  directPulseSource("quotes", "sales.quote_drafts"),
  {
    key: "quote_lines",
    relations: ["sales.quote_lines", "sales.quote_drafts"],
    sql: `
      SELECT 'quote_lines'::text AS activity_key,
        COALESCE(max(quote_line.updated_at)::text, '') AS activity_value
      FROM sales.quote_lines quote_line
      INNER JOIN sales.quote_drafts quote ON quote.id=quote_line.quote_id
      WHERE quote.tenant_id=$1::uuid
    `,
  },
  directPulseSource("artwork_approvals", "sales.artwork_approvals"),
  {
    key: "artwork_pages",
    relations: ["sales.artwork_approval_pages", "sales.artwork_approvals"],
    sql: `
      SELECT 'artwork_pages'::text AS activity_key,
        COALESCE(max(page.updated_at)::text, '') AS activity_value
      FROM sales.artwork_approval_pages page
      INNER JOIN sales.artwork_approvals approval ON approval.id=page.approval_id
      WHERE approval.tenant_id=$1::uuid
    `,
  },
  directPulseSource("production_jobs", "production.production_jobs"),
  {
    key: "production_items",
    relations: ["production.production_items", "production.production_jobs"],
    sql: `
      SELECT 'production_items'::text AS activity_key,
        COALESCE(max(item.updated_at)::text, '') AS activity_value
      FROM production.production_items item
      INNER JOIN production.production_jobs job ON job.id=item.job_id
      WHERE job.tenant_id=$1::uuid
    `,
  },
  {
    key: "production_steps",
    relations: ["production.production_steps", "production.production_jobs"],
    sql: `
      SELECT 'production_steps'::text AS activity_key,
        COALESCE(max(step.updated_at)::text, '') AS activity_value
      FROM production.production_steps step
      INNER JOIN production.production_jobs job ON job.id=step.job_id
      WHERE job.tenant_id=$1::uuid
    `,
  },
  directPulseSource("materials", "catalog.materials"),
  directPulseSource("products", "catalog.products"),
  directPulseSource("myob_connections", "integration.myob_connections"),
  directPulseSource("external_mappings", "integration.external_mappings"),
  directPulseSource("sync_runs", "integration.sync_runs"),
  directPulseSource("wordpress_connections", "integration.wordpress_connections"),
  directPulseSource("wordpress_orders", "integration.wordpress_orders"),
  directPulseSource("purchase_orders", "purchasing.purchase_orders"),
  directPulseSource("purchase_order_lines", "purchasing.purchase_order_lines"),
];

const APP_PULSE_RELATION_CACHE_MS = 60_000;
let cachedPulseSources: AppPulseSource[] | null = null;
let cachedPulseSourcesUntil = 0;

async function availableAppPulseSources(): Promise<AppPulseSource[]> {
  if (cachedPulseSources && cachedPulseSourcesUntil > Date.now()) return cachedPulseSources;
  const relations = Array.from(new Set(APP_PULSE_SOURCES.flatMap((source) => source.relations)));
  const result = await pool.query<{ relation: string }>(`
    SELECT relation_name AS relation
    FROM unnest($1::text[]) AS requested(relation_name)
    WHERE to_regclass(relation_name) IS NOT NULL
  `, [relations]);
  const availableRelations = new Set(result.rows.map((row) => row.relation));
  cachedPulseSources = APP_PULSE_SOURCES.filter((source) => source.relations.every((relation) => availableRelations.has(relation)));
  cachedPulseSourcesUntil = Date.now() + APP_PULSE_RELATION_CACHE_MS;
  return cachedPulseSources;
}

async function resilientPulseFallback(tenantId: string, sources: AppPulseSource[]): Promise<string> {
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const result = await pool.query<{ activityValue: string }>(`
        SELECT activity_value AS "activityValue" FROM (${source.sql}) AS source_activity
      `, [tenantId]);
      return `${source.key}=${result.rows[0]?.activityValue ?? ""}`;
    }),
  );
  const healthySources = sources.filter((_source, index) => results[index]?.status === "fulfilled");
  cachedPulseSources = healthySources;
  cachedPulseSourcesUntil = Date.now() + APP_PULSE_RELATION_CACHE_MS;
  const activity = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []).sort().join("|");
  return createHash("md5").update(activity).digest("hex");
}

export async function getAppActivityPulseForTenant(tenantId: string): Promise<string> {
  await ensureNotificationSchema();
  let sources: AppPulseSource[];
  try {
    sources = await availableAppPulseSources();
  } catch {
    sources = APP_PULSE_SOURCES.slice(0, 1);
  }
  if (!sources.length) return "";

  try {
    const union = sources.map((source) => source.sql).join("\nUNION ALL\n");
    const result = await pool.query<{ pulse: string }>(`
      SELECT COALESCE(md5(string_agg(activity_key || '=' || activity_value, '|' ORDER BY activity_key)), '') AS pulse
      FROM (${union}) AS activity
    `, [tenantId]);
    return result.rows[0]?.pulse ?? '';
  } catch {
    // Isolate a partially migrated source instead of allowing one optional module to
    // disable live updates for every other workflow.
    return resilientPulseFallback(tenantId, sources);
  }
}

export async function markAllNotificationsReadForTenant(tenantId: string): Promise<void> {
  await ensureNotificationSchema();
  await pool.query(`
    UPDATE app.notifications SET is_read=true,read_at=COALESCE(read_at,now())
    WHERE tenant_id=$1::uuid AND is_read=false
  `, [tenantId]);
}
