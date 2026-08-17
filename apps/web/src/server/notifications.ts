import "server-only";

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

export async function ensureNotificationSchema(): Promise<void> {
  if (!process.env.DATABASE_URL || notificationSchemaReady) return;
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

export async function getAppActivityPulseForTenant(tenantId: string): Promise<string> {
  await ensureNotificationSchema();
  try {
    const result = await pool.query<{ pulse: string }>(`
      SELECT concat_ws('|',
        COALESCE((SELECT max(created_at)::text FROM app.notifications WHERE tenant_id=$1::uuid), ''),
        COALESCE((SELECT max(updated_at)::text FROM production.production_jobs WHERE tenant_id=$1::uuid), '')
      ) AS pulse
    `, [tenantId]);
    return result.rows[0]?.pulse ?? '';
  } catch {
    // A fresh tenant may not have visited every module yet, so some lazily-created tables
    // can be absent. Notifications always exist after ensureNotificationSchema and still
    // cover client approvals/change requests, which are the most important live events.
    const fallback = await pool.query<{ pulse: string }>(`
      SELECT COALESCE(max(created_at)::text, '') AS pulse
      FROM app.notifications
      WHERE tenant_id=$1::uuid
    `, [tenantId]);
    return fallback.rows[0]?.pulse ?? '';
  }
}

export async function markAllNotificationsReadForTenant(tenantId: string): Promise<void> {
  await ensureNotificationSchema();
  await pool.query(`
    UPDATE app.notifications SET is_read=true,read_at=COALESCE(read_at,now())
    WHERE tenant_id=$1::uuid AND is_read=false
  `, [tenantId]);
}
