import "server-only";

import { pool } from "@production-manager/db";

/**
 * Production Manager historically kept defensive DDL guards in normal request
 * paths so older databases could self-heal after a deployment. That is useful
 * during local development, but on Vercel each cold function instance would
 * otherwise pay one or more information_schema/ALTER round trips before serving
 * the page. In production we now trust the checked-in SQL migrations by default.
 *
 * Set PM_RUNTIME_SCHEMA_FALLBACK=1 temporarily if a deployment needs the legacy
 * self-healing behaviour. Local development keeps it enabled automatically.
 */
export function runtimeSchemaFallbackEnabled(): boolean {
  const explicit = String(process.env.PM_RUNTIME_SCHEMA_FALLBACK ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(explicit)) return true;
  if (["0", "false", "no", "off"].includes(explicit)) return false;
  return process.env.NODE_ENV !== "production";
}

const columnReadinessCache = new Map<string, boolean>();
const relationReadinessCache = new Map<string, boolean>();

export async function relationHasColumns(relation: string, columns: readonly string[]): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  if (!runtimeSchemaFallbackEnabled()) return true;

  const [schemaName, tableName] = relation.split(".");
  if (!schemaName || !tableName) return false;
  const cacheKey = `${relation}:${[...columns].sort().join(",")}`;
  const cached = columnReadinessCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = await pool.query<{ relationExists: boolean; columnCount: string }>(`
    SELECT
      to_regclass($1::text) IS NOT NULL AS "relationExists",
      count(DISTINCT column_name)::text AS "columnCount"
    FROM information_schema.columns
    WHERE table_schema = $2::text
      AND table_name = $3::text
      AND column_name = ANY($4::text[])
  `, [relation, schemaName, tableName, [...columns]]);

  const row = result.rows[0];
  const ready = Boolean(row?.relationExists) && Number(row?.columnCount ?? 0) === columns.length;
  columnReadinessCache.set(cacheKey, ready);
  return ready;
}

export async function relationsExist(relations: readonly string[]): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  if (!runtimeSchemaFallbackEnabled()) return true;
  if (!relations.length) return true;

  const cacheKey = [...relations].sort().join(",");
  const cached = relationReadinessCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM unnest($1::text[]) AS requested(relation_name)
    WHERE to_regclass(relation_name) IS NOT NULL
  `, [[...relations]]);
  const ready = Number(result.rows[0]?.count ?? 0) === relations.length;
  relationReadinessCache.set(cacheKey, ready);
  return ready;
}
