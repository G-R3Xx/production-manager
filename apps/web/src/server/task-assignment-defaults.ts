import "server-only";

import { pool } from "@production-manager/db";
import { relationsExist } from "@/server/schema-readiness";

export const TASK_ASSIGNMENT_DEFAULT_KEYS = [
  "artwork",
  "signage_print",
  "signage_manufacture",
  "small_format",
  "installation",
  "dispatch",
] as const;

export type TaskAssignmentDefaultKey = (typeof TASK_ASSIGNMENT_DEFAULT_KEYS)[number];

export type TaskAssignmentDefaultRecord = {
  assignmentKey: TaskAssignmentDefaultKey;
  assigneeProfileIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export const TASK_ASSIGNMENT_DEFAULT_META: Record<TaskAssignmentDefaultKey, { label: string; description: string; group: string }> = {
  artwork: {
    label: "Artwork / prepress",
    description: "Artwork, proof preparation, artwork checks and print-ready file checks.",
    group: "Workflow",
  },
  signage_print: {
    label: "Signage printing",
    description: "RIP / setup and print procedures for signage and wide-format work.",
    group: "Production",
  },
  signage_manufacture: {
    label: "Signage manufacture / finishing",
    description: "Laminate, cut, route, mount, finishing, quality control and packing for signage.",
    group: "Production",
  },
  small_format: {
    label: "Small format",
    description: "Printing and finishing for cards, flyers, brochures, booklets and other small-format work.",
    group: "Production",
  },
  installation: {
    label: "Installation",
    description: "Installation handoff and site-install work. Multiple default installers can be selected.",
    group: "Dispatch",
  },
  dispatch: {
    label: "Pickup / delivery",
    description: "Final packing, pickup and delivery handoff when the job is not an installation.",
    group: "Dispatch",
  },
};

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

export async function ensureTaskAssignmentDefaultSchema(): Promise<void> {
  if (!process.env.DATABASE_URL || schemaReady) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const ready = await relationsExist(["app.task_assignment_defaults"]);
    if (!ready) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app.task_assignment_defaults (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
          assignment_key varchar(60) NOT NULL,
          assignee_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS task_assignment_defaults_tenant_key_uidx
          ON app.task_assignment_defaults (tenant_id, assignment_key)
      `);
    }
    schemaReady = true;
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

export async function listTaskAssignmentDefaultsForTenant(tenantId: string): Promise<TaskAssignmentDefaultRecord[]> {
  await ensureTaskAssignmentDefaultSchema();
  const result = await pool.query<TaskAssignmentDefaultRecord>(`
    SELECT
      assignment_key as "assignmentKey",
      COALESCE(assignee_profile_ids, '{}'::uuid[]) as "assigneeProfileIds",
      created_at::text as "createdAt",
      updated_at::text as "updatedAt"
    FROM app.task_assignment_defaults
    WHERE tenant_id = $1::uuid
      AND assignment_key = ANY($2::text[])
    ORDER BY assignment_key
  `, [tenantId, TASK_ASSIGNMENT_DEFAULT_KEYS]);
  return result.rows;
}

export async function saveTaskAssignmentDefaultsForTenant(
  tenantId: string,
  input: Partial<Record<TaskAssignmentDefaultKey, string[]>>,
): Promise<void> {
  await ensureTaskAssignmentDefaultSchema();

  const allRequestedIds = Array.from(new Set(
    TASK_ASSIGNMENT_DEFAULT_KEYS.flatMap((key) => input[key] ?? []).map((id) => id.trim()).filter(Boolean),
  ));
  if (allRequestedIds.length) {
    const valid = await pool.query<{ id: string }>(`
      SELECT DISTINCT profile.id
      FROM app.memberships membership
      INNER JOIN app.user_profiles profile ON profile.id = membership.user_profile_id
      WHERE membership.tenant_id = $1::uuid
        AND membership.status = 'active'
        AND profile.id = ANY($2::uuid[])
    `, [tenantId, allRequestedIds]);
    if (valid.rows.length !== allRequestedIds.length) {
      throw new Error("One or more selected staff members are no longer active in this workspace.");
    }
  }

  for (const assignmentKey of TASK_ASSIGNMENT_DEFAULT_KEYS) {
    const ids = Array.from(new Set((input[assignmentKey] ?? []).map((id) => id.trim()).filter(Boolean)));
    await pool.query(`
      INSERT INTO app.task_assignment_defaults AS defaults (
        tenant_id, assignment_key, assignee_profile_ids, created_at, updated_at
      ) VALUES ($1::uuid, $2, $3::uuid[], now(), now())
      ON CONFLICT (tenant_id, assignment_key)
      DO UPDATE SET assignee_profile_ids = EXCLUDED.assignee_profile_ids, updated_at = now()
    `, [tenantId, assignmentKey, ids]);
  }
}

export async function taskAssignmentDefaultMapForTenant(tenantId: string): Promise<Map<TaskAssignmentDefaultKey, string[]>> {
  const records = await listTaskAssignmentDefaultsForTenant(tenantId);
  return new Map(records.map((record) => [record.assignmentKey, record.assigneeProfileIds]));
}
