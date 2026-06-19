import "server-only";

import { pool } from "@production-manager/db";

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
  quoteTerms: string | null;
  proofTerms: string | null;
  jobTerms: string | null;
};

async function ensurePricingSettingsColumns(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  await pool.query(`
    ALTER TABLE app.tenant_settings
      ADD COLUMN IF NOT EXISTS global_markup_multiplier numeric(8,4) NOT NULL DEFAULT 1.5,
      ADD COLUMN IF NOT EXISTS global_profit_multiplier numeric(8,4) NOT NULL DEFAULT 1.2
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

  return result.rows[0] ?? null;
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
        quote_terms,
        proof_terms,
        job_terms
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10::numeric,$11,$12,$13)
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
      input.quoteTerms,
      input.proofTerms,
      input.jobTerms
    ]
  );
}
