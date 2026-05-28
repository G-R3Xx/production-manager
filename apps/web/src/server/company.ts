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
  quoteTerms: string | null;
  proofTerms: string | null;
  jobTerms: string | null;
};

export async function getCompanySettingsByTenantId(tenantId: string): Promise<CompanySettingsRecord | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

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
        ts.default_currency AS "defaultCurrency",
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
        quote_terms,
        proof_terms,
        job_terms
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        company_legal_name = EXCLUDED.company_legal_name,
        trading_name = EXCLUDED.trading_name,
        abn = EXCLUDED.abn,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        address = EXCLUDED.address,
        default_currency = EXCLUDED.default_currency,
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
      input.quoteTerms,
      input.proofTerms,
      input.jobTerms
    ]
  );
}
