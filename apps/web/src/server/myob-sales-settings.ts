import "server-only";

import { pool } from "@production-manager/db";

export type MyobSalesDefaults = {
  incomeAccountUid: string | null;
  incomeAccountName: string | null;
  incomeAccountDisplayId: string | null;
};

let salesSettingsSchemaReady = false;

export async function ensureMyobSalesSettingsSchema(): Promise<void> {
  if (salesSettingsSchemaReady || !process.env.DATABASE_URL) return;
  await pool.query(`
    ALTER TABLE app.tenant_settings
      ADD COLUMN IF NOT EXISTS myob_sales_income_account_uid varchar(255),
      ADD COLUMN IF NOT EXISTS myob_sales_income_account_name varchar(255),
      ADD COLUMN IF NOT EXISTS myob_sales_income_account_display_id varchar(30);
  `);
  salesSettingsSchemaReady = true;
}

export async function getMyobSalesDefaults(tenantId: string): Promise<MyobSalesDefaults> {
  await ensureMyobSalesSettingsSchema();
  const result = await pool.query<MyobSalesDefaults>(`
    SELECT myob_sales_income_account_uid AS "incomeAccountUid",
      myob_sales_income_account_name AS "incomeAccountName",
      myob_sales_income_account_display_id AS "incomeAccountDisplayId"
    FROM app.tenant_settings
    WHERE tenant_id=$1::uuid
    LIMIT 1
  `, [tenantId]);
  return result.rows[0] ?? { incomeAccountUid: null, incomeAccountName: null, incomeAccountDisplayId: null };
}

export async function saveMyobSalesDefaults(tenantId: string, input: MyobSalesDefaults): Promise<void> {
  await ensureMyobSalesSettingsSchema();
  await pool.query(`
    INSERT INTO app.tenant_settings (
      tenant_id,
      myob_sales_income_account_uid,
      myob_sales_income_account_name,
      myob_sales_income_account_display_id,
      created_at,
      updated_at
    )
    VALUES ($1::uuid,$2::varchar,$3::varchar,$4::varchar,now(),now())
    ON CONFLICT (tenant_id) DO UPDATE SET
      myob_sales_income_account_uid=EXCLUDED.myob_sales_income_account_uid,
      myob_sales_income_account_name=EXCLUDED.myob_sales_income_account_name,
      myob_sales_income_account_display_id=EXCLUDED.myob_sales_income_account_display_id,
      updated_at=now()
  `, [tenantId, input.incomeAccountUid, input.incomeAccountName, input.incomeAccountDisplayId]);
}
