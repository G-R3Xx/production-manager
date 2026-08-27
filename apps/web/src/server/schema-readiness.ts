import "server-only";

import { pool } from "@production-manager/db";

export async function relationHasColumns(relation: string, columns: readonly string[]): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const [schemaName, tableName] = relation.split(".");
  if (!schemaName || !tableName) return false;

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
  return Boolean(row?.relationExists) && Number(row?.columnCount ?? 0) === columns.length;
}

export async function relationsExist(relations: readonly string[]): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  if (!relations.length) return true;
  const result = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM unnest($1::text[]) AS requested(relation_name)
    WHERE to_regclass(relation_name) IS NOT NULL
  `, [[...relations]]);
  return Number(result.rows[0]?.count ?? 0) === relations.length;
}
