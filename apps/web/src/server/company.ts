import "server-only";

import { pool } from "@production-manager/db";

export type QuoteSizePreset = {
  label: string;
  width: string;
  height: string;
};

export const defaultSignageSizePresets: QuoteSizePreset[] = [
  { label: "450 × 600 mm", width: "450", height: "600" },
  { label: "600 × 900 mm", width: "600", height: "900" },
  { label: "900 × 1200 mm", width: "900", height: "1200" },
  { label: "1200 × 2400 mm", width: "1200", height: "2400" }
];

export const defaultSmallSizePresets: QuoteSizePreset[] = [
  { label: "Business card 90 × 55", width: "90", height: "55" },
  { label: "DL 99 × 210", width: "99", height: "210" },
  { label: "A6 105 × 148", width: "105", height: "148" },
  { label: "A5 148 × 210", width: "148", height: "210" },
  { label: "A4 210 × 297", width: "210", height: "297" },
  { label: "A3 297 × 420", width: "297", height: "420" }
];

export type CompanySettingsRecord = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  companyLegalName: string | null;
  tradingName: string | null;
  abn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  defaultCurrency: string;
  globalMarkupMultiplier: string;
  globalProfitMultiplier: string;
  quoteLabourRate: string;
  quoteInkRatePerSqm: string;
  quoteMonoRatePerSqm: string;
  quoteSignageSizePresets: QuoteSizePreset[];
  quoteSmallSizePresets: QuoteSizePreset[];
  quoteTerms: string | null;
  proofTerms: string | null;
  jobTerms: string | null;
};

function sizePresetDefaultSql(presets: QuoteSizePreset[]): string {
  return JSON.stringify(presets).replace(/'/g, "''");
}

function normaliseSizePresetArray(value: unknown, fallback: QuoteSizePreset[]): QuoteSizePreset[] {
  if (!Array.isArray(value)) return fallback;

  const cleaned = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = String(record.label ?? "").trim();
      const width = String(record.width ?? "").trim();
      const height = String(record.height ?? "").trim();

      if (!label || !width || !height) return null;
      return { label, width, height };
    })
    .filter((item): item is QuoteSizePreset => Boolean(item));

  return cleaned.length > 0 ? cleaned : fallback;
}

async function ensurePricingSettingsColumns(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  await pool.query(`
    ALTER TABLE app.tenant_settings
      ADD COLUMN IF NOT EXISTS global_markup_multiplier numeric(8,4) NOT NULL DEFAULT 1.5,
      ADD COLUMN IF NOT EXISTS global_profit_multiplier numeric(8,4) NOT NULL DEFAULT 1.2,
      ADD COLUMN IF NOT EXISTS quote_labour_rate numeric(10,2) NOT NULL DEFAULT 66,
      ADD COLUMN IF NOT EXISTS quote_ink_rate_per_sqm numeric(10,2) NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS quote_mono_rate_per_sqm numeric(10,2) NOT NULL DEFAULT 4,
      ADD COLUMN IF NOT EXISTS quote_signage_size_presets_json jsonb NOT NULL DEFAULT '${sizePresetDefaultSql(defaultSignageSizePresets)}'::jsonb,
      ADD COLUMN IF NOT EXISTS quote_small_size_presets_json jsonb NOT NULL DEFAULT '${sizePresetDefaultSql(defaultSmallSizePresets)}'::jsonb
  `);
}

export async function getCompanySettingsByTenantId(tenantId: string): Promise<CompanySettingsRecord | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  await ensurePricingSettingsColumns();

  const result = await pool.query<CompanySettingsRecord>(
    `
      SELECT
        t.id AS "tenantId",
        t.name AS "tenantName",
        t.slug AS "tenantSlug",
        ts.company_legal_name AS "companyLegalName",
        ts.trading_name AS "tradingName",
        ts.abn AS "abn",
        ts.phone AS "phone",
        ts.email AS "email",
        ts.address AS "address",
        COALESCE(ts.default_currency, 'AUD') AS "defaultCurrency",
        COALESCE(ts.global_markup_multiplier, 1.5)::text AS "globalMarkupMultiplier",
        COALESCE(ts.global_profit_multiplier, 1.2)::text AS "globalProfitMultiplier",
        COALESCE(ts.quote_labour_rate, 66)::text AS "quoteLabourRate",
        COALESCE(ts.quote_ink_rate_per_sqm, 10)::text AS "quoteInkRatePerSqm",
        COALESCE(ts.quote_mono_rate_per_sqm, 4)::text AS "quoteMonoRatePerSqm",
        COALESCE(ts.quote_signage_size_presets_json, '${sizePresetDefaultSql(defaultSignageSizePresets)}'::jsonb) AS "quoteSignageSizePresets",
        COALESCE(ts.quote_small_size_presets_json, '${sizePresetDefaultSql(defaultSmallSizePresets)}'::jsonb) AS "quoteSmallSizePresets",
        ts.quote_terms AS "quoteTerms",
        ts.proof_terms AS "proofTerms",
        ts.job_terms AS "jobTerms"
      FROM app.tenants t
      LEFT JOIN app.tenant_settings ts ON ts.tenant_id = t.id
      WHERE t.id = $1
      LIMIT 1
    `,
    [tenantId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    ...row,
    quoteSignageSizePresets: normaliseSizePresetArray(row.quoteSignageSizePresets, defaultSignageSizePresets),
    quoteSmallSizePresets: normaliseSizePresetArray(row.quoteSmallSizePresets, defaultSmallSizePresets)
  };
}

export async function updateCompanySettingsByTenantId(
  tenantId: string,
  input: Omit<CompanySettingsRecord, "tenantId" | "tenantName" | "tenantSlug">
): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await ensurePricingSettingsColumns();

  await pool.query(
    `
      INSERT INTO app.tenant_settings (
        tenant_id,
        company_legal_name,
        trading_name,
        abn,
        phone,
        email,
        address,
        default_currency,
        global_markup_multiplier,
        global_profit_multiplier,
        quote_labour_rate,
        quote_ink_rate_per_sqm,
        quote_mono_rate_per_sqm,
        quote_signage_size_presets_json,
        quote_small_size_presets_json,
        quote_terms,
        proof_terms,
        job_terms
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10::numeric,$11::numeric,$12::numeric,$13::numeric,$14::jsonb,$15::jsonb,$16,$17,$18)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        company_legal_name = EXCLUDED.company_legal_name,
        trading_name = EXCLUDED.trading_name,
        abn = EXCLUDED.abn,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        address = EXCLUDED.address,
        default_currency = EXCLUDED.default_currency,
        global_markup_multiplier = EXCLUDED.global_markup_multiplier,
        global_profit_multiplier = EXCLUDED.global_profit_multiplier,
        quote_labour_rate = EXCLUDED.quote_labour_rate,
        quote_ink_rate_per_sqm = EXCLUDED.quote_ink_rate_per_sqm,
        quote_mono_rate_per_sqm = EXCLUDED.quote_mono_rate_per_sqm,
        quote_signage_size_presets_json = EXCLUDED.quote_signage_size_presets_json,
        quote_small_size_presets_json = EXCLUDED.quote_small_size_presets_json,
        quote_terms = EXCLUDED.quote_terms,
        proof_terms = EXCLUDED.proof_terms,
        job_terms = EXCLUDED.job_terms,
        updated_at = NOW()
    `,
    [
      tenantId,
      input.companyLegalName,
      input.tradingName,
      input.abn,
      input.phone,
      input.email,
      input.address,
      input.defaultCurrency,
      input.globalMarkupMultiplier || "1.5",
      input.globalProfitMultiplier || "1.2",
      input.quoteLabourRate || "66",
      input.quoteInkRatePerSqm || "10",
      input.quoteMonoRatePerSqm || "4",
      JSON.stringify(normaliseSizePresetArray(input.quoteSignageSizePresets, defaultSignageSizePresets)),
      JSON.stringify(normaliseSizePresetArray(input.quoteSmallSizePresets, defaultSmallSizePresets)),
      input.quoteTerms,
      input.proofTerms,
      input.jobTerms
    ]
  );
}
