import "server-only";

import { pool } from "@production-manager/db";

export type CustomerRecord = {
  id: string;
  tenantId: string;
  myobUid: string;
  displayName: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  payloadJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function listCustomersForTenant(tenantId: string): Promise<CustomerRecord[]> {
  const result = await pool.query<Omit<CustomerRecord, "payloadJson"> & { payloadJson: unknown }>(`
    SELECT
      id,
      tenant_id as "tenantId",
      myob_uid as "myobUid",
      display_name as "displayName",
      company_name as "companyName",
      first_name as "firstName",
      last_name as "lastName",
      email,
      phone,
      is_active as "isActive",
      payload_json as "payloadJson",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM app.customers
    WHERE tenant_id = $1::uuid
    ORDER BY display_name asc
  `,[tenantId]);

  return result.rows.map((row) => ({ ...row, payloadJson: parseJsonObject(row.payloadJson) }));
}

export async function upsertImportedCustomer(tenantId: string, input: {
  myobUid: string;
  displayName: string;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean;
  payloadJson?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(`
    INSERT INTO app.customers (
      tenant_id, myob_uid, display_name, company_name, first_name, last_name, email, phone, is_active, payload_json, created_at, updated_at
    ) VALUES (
      $1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::varchar, $7::varchar, $8::varchar, $9::boolean, $10::jsonb, now(), now()
    )
    ON CONFLICT (tenant_id, myob_uid)
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      company_name = EXCLUDED.company_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      is_active = EXCLUDED.is_active,
      payload_json = EXCLUDED.payload_json,
      updated_at = now()
    RETURNING id
  `,[
    tenantId,
    input.myobUid,
    input.displayName,
    input.companyName ?? null,
    input.firstName ?? null,
    input.lastName ?? null,
    input.email ?? null,
    input.phone ?? null,
    input.isActive ?? true,
    JSON.stringify(input.payloadJson ?? {})
  ]);

  return result.rows[0];
}
