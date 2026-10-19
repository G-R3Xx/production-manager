import "server-only";

import { pool } from "@production-manager/db";
import { relationHasColumns } from "@/server/schema-readiness";

export const quoteVisualCategoryKeys = [
  "signage",
  "small_format",
  "plan_printing",
  "poster_printing",
  "service",
  "pickup",
  "delivery",
  "install",
  "access_equipment",
  "component",
  "acrylic",
  "acm",
  "corflute",
  "pvc",
  "banner",
  "other_sheet",
  "artwork_supplied",
  "artwork_required"
] as const;

export type QuoteVisualCategoryKey = (typeof quoteVisualCategoryKeys)[number];

export type QuoteVisualCategoryRecord = {
  imageUrl: string | null;
  storagePath: string | null;
};

export type QuoteVisualCategoryImages = Partial<Record<QuoteVisualCategoryKey, QuoteVisualCategoryRecord>>;

let quoteVisualSettingsSchemaReady = false;
let quoteVisualSettingsSchemaPromise: Promise<void> | null = null;

export async function ensureQuoteVisualSettingsColumns(): Promise<void> {
  if (!process.env.DATABASE_URL || quoteVisualSettingsSchemaReady) return;
  if (quoteVisualSettingsSchemaPromise) return quoteVisualSettingsSchemaPromise;
  quoteVisualSettingsSchemaPromise = (async () => {
    // Quote visuals are optional UI data, but the selected-quote page reads them.
    // Verify this new column against the live production schema instead of relying
    // on the global migration-trust shortcut, otherwise an unapplied migration
    // can turn opening an old quote into a Server Component 500.
    const result = await pool.query<{ columnCount: string }>(`
      SELECT count(DISTINCT column_name)::text AS "columnCount"
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'tenant_settings'
        AND column_name = 'quote_visual_categories_json'
    `);
    if (Number(result.rows[0]?.columnCount ?? 0) < 1) {
      await pool.query(`
        ALTER TABLE app.tenant_settings
          ADD COLUMN IF NOT EXISTS quote_visual_categories_json jsonb NOT NULL DEFAULT '{}'::jsonb
      `);
    }
    quoteVisualSettingsSchemaReady = true;
  })().catch((error) => {
    quoteVisualSettingsSchemaPromise = null;
    throw error;
  });
  return quoteVisualSettingsSchemaPromise;
}

function cleanRecord(value: unknown): QuoteVisualCategoryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const imageUrl = typeof record.imageUrl === "string" && record.imageUrl.trim() ? record.imageUrl.trim() : null;
  const storagePath = typeof record.storagePath === "string" && record.storagePath.trim() ? record.storagePath.trim() : null;
  if (!imageUrl && !storagePath) return null;
  return { imageUrl, storagePath };
}

export async function getQuoteVisualCategoryImages(tenantId: string): Promise<QuoteVisualCategoryImages> {
  // Failure to add the optional visual column must never stop an existing quote
  // from opening. The to_jsonb lookup below is valid whether the column exists or
  // not and simply falls back to an empty visual configuration.
  await ensureQuoteVisualSettingsColumns().catch(() => undefined);
  const result = await pool.query<{ value: unknown }>(`
    SELECT COALESCE(to_jsonb(ts) -> 'quote_visual_categories_json', '{}'::jsonb) AS value
    FROM app.tenant_settings ts
    WHERE tenant_id = $1::uuid
    LIMIT 1
  `, [tenantId]);
  const raw = result.rows[0]?.value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const output: QuoteVisualCategoryImages = {};
  for (const key of quoteVisualCategoryKeys) {
    const cleaned = cleanRecord((raw as Record<string, unknown>)[key]);
    if (cleaned) output[key] = cleaned;
  }
  return output;
}

export async function saveQuoteVisualCategoryImage(
  tenantId: string,
  key: QuoteVisualCategoryKey,
  value: QuoteVisualCategoryRecord | null
): Promise<void> {
  await ensureQuoteVisualSettingsColumns();
  await pool.query(`
    INSERT INTO app.tenant_settings (tenant_id, quote_visual_categories_json, created_at, updated_at)
    VALUES (
      $1::uuid,
      CASE WHEN $3::boolean THEN '{}'::jsonb ELSE jsonb_build_object($2::text, jsonb_build_object('imageUrl', $4::text, 'storagePath', $5::text)) END,
      now(),
      now()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      quote_visual_categories_json = CASE
        WHEN $3::boolean THEN COALESCE(app.tenant_settings.quote_visual_categories_json, '{}'::jsonb) - $2::text
        ELSE jsonb_set(
          COALESCE(app.tenant_settings.quote_visual_categories_json, '{}'::jsonb),
          ARRAY[$2::text],
          jsonb_build_object('imageUrl', $4::text, 'storagePath', $5::text),
          true
        )
      END,
      updated_at = now()
  `, [tenantId, key, value == null, value?.imageUrl ?? null, value?.storagePath ?? null]);
}

export function quoteVisualCategoryKey(value: string | null | undefined): QuoteVisualCategoryKey | null {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (quoteVisualCategoryKeys as readonly string[]).includes(key) ? key as QuoteVisualCategoryKey : null;
}
