import "server-only";

import { pool } from "@production-manager/db";
import type { QuoteSubJob } from "@/lib/quote-sub-jobs";

export async function listQuoteSubJobs(quoteId: string): Promise<QuoteSubJob[]> {
  const result = await pool.query<QuoteSubJob>(`
    SELECT id::text, quote_id::text AS "quoteId", title, sort_order AS "sortOrder"
    FROM sales.quote_sub_jobs WHERE quote_id = $1::uuid
    ORDER BY sort_order, created_at, id
  `, [quoteId]);
  return result.rows;
}

export async function createQuoteSubJob(tenantId: string, quoteId: string, title: string): Promise<boolean> {
  const result = await pool.query(`
    WITH quote AS (
      SELECT id FROM sales.quote_drafts WHERE id = $2::uuid AND tenant_id = $1::uuid
    ), created AS (
      INSERT INTO sales.quote_sub_jobs (quote_id, title, sort_order)
      SELECT quote.id, $3, COALESCE((SELECT max(sort_order) + 1 FROM sales.quote_sub_jobs WHERE quote_id = quote.id), 0)
      FROM quote RETURNING id
    )
    UPDATE sales.quote_drafts SET updated_at = now() WHERE id IN (SELECT id FROM quote)
      AND EXISTS (SELECT 1 FROM created)
  `, [tenantId, quoteId, title]);
  return (result.rowCount ?? 0) > 0;
}

export async function renameQuoteSubJob(tenantId: string, quoteId: string, id: string, title: string): Promise<boolean> {
  const result = await pool.query(`
    WITH renamed AS (
      UPDATE sales.quote_sub_jobs sj SET title = $4, updated_at = now()
      FROM sales.quote_drafts q
      WHERE sj.id = $3::uuid AND sj.quote_id = $2::uuid AND q.id = sj.quote_id AND q.tenant_id = $1::uuid
      RETURNING sj.quote_id
    )
    UPDATE sales.quote_drafts SET updated_at = now() WHERE id IN (SELECT quote_id FROM renamed)
  `, [tenantId, quoteId, id, title]);
  return (result.rowCount ?? 0) > 0;
}

/** Deleting a section moves its lines to General rather than deleting any work. */
export async function deleteQuoteSubJob(tenantId: string, quoteId: string, id: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query(`
      SELECT sj.id FROM sales.quote_sub_jobs sj
      JOIN sales.quote_drafts q ON q.id = sj.quote_id
      WHERE sj.id = $3::uuid AND sj.quote_id = $2::uuid AND q.tenant_id = $1::uuid
      FOR UPDATE OF sj
    `, [tenantId, quoteId, id]);
    if (!target.rowCount) { await client.query("ROLLBACK"); return false; }
    await client.query(`
      UPDATE sales.quote_lines SET
        configuration_snapshot = configuration_snapshot - 'subJobId', updated_at = now()
      WHERE quote_id = $1::uuid AND configuration_snapshot ->> 'subJobId' = $2
    `, [quoteId, id]);
    await client.query(`DELETE FROM sales.quote_sub_jobs WHERE id = $1::uuid`, [id]);
    await client.query(`UPDATE sales.quote_drafts SET updated_at = now() WHERE id = $1::uuid`, [quoteId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function assignQuoteLineSubJob(tenantId: string, quoteId: string, lineId: string, id: string | null): Promise<boolean> {
  const result = await pool.query(`
    WITH RECURSIVE allowed AS (
      SELECT q.id FROM sales.quote_drafts q WHERE q.id = $2::uuid AND q.tenant_id = $1::uuid
        AND ($4::uuid IS NULL OR EXISTS (
          SELECT 1 FROM sales.quote_sub_jobs sj WHERE sj.id = $4::uuid AND sj.quote_id = q.id
        ))
    ), related AS (
      SELECT l.id FROM sales.quote_lines l
      WHERE l.id = $3::uuid AND l.quote_id IN (SELECT id FROM allowed)
      UNION
      SELECT l.id FROM sales.quote_lines l
      INNER JOIN related r ON l.configuration_snapshot ->> 'parentLineId' = r.id::text
      WHERE l.quote_id IN (SELECT id FROM allowed)
    ), changed AS (
      UPDATE sales.quote_lines l SET
        configuration_snapshot = CASE WHEN $4::uuid IS NULL THEN l.configuration_snapshot - 'subJobId'
          ELSE jsonb_set(l.configuration_snapshot, '{subJobId}', to_jsonb($4::text)) END,
        updated_at = now()
      WHERE l.id IN (SELECT id FROM related) AND l.quote_id IN (SELECT id FROM allowed)
      RETURNING l.quote_id
    )
    UPDATE sales.quote_drafts SET updated_at = now() WHERE id IN (SELECT quote_id FROM changed)
  `, [tenantId, quoteId, lineId, id]);
  return (result.rowCount ?? 0) > 0;
}
