import "server-only";

import { pool } from "@production-manager/db";

export type SupplierRecord = {
  id: string;
  tenantId: string;
  myobUid: string | null;
  displayName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  notes: string | null;
  payloadJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function listSuppliersForTenant(
  tenantId: string,
  search = ""
): Promise<SupplierRecord[]> {
  const term = search.trim();
  const hasTerm = term.length > 0;
  const result = await pool.query<
    Omit<SupplierRecord, "payloadJson"> & { payloadJson: unknown }
  >(
    `
      SELECT
        id,
        tenant_id as "tenantId",
        myob_uid as "myobUid",
        display_name as "displayName",
        contact_name as "contactName",
        email,
        phone,
        is_active as "isActive",
        notes,
        payload_json as "payloadJson",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM app.suppliers
      WHERE tenant_id = $1::uuid
        AND (
          $2::boolean = false
          OR display_name ILIKE $3::text
          OR COALESCE(contact_name, '') ILIKE $3::text
          OR COALESCE(email, '') ILIKE $3::text
          OR COALESCE(phone, '') ILIKE $3::text
        )
      ORDER BY display_name asc
    `,
    [tenantId, hasTerm, `%${term}%`]
  );

  return result.rows.map((row) => ({
    ...row,
    payloadJson: parseJsonObject(row.payloadJson)
  }));
}

export async function createSupplierForTenant(
  tenantId: string,
  input: {
    displayName: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  }
): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO app.suppliers (
        tenant_id,
        myob_uid,
        display_name,
        contact_name,
        email,
        phone,
        is_active,
        notes,
        payload_json,
        created_at,
        updated_at
      ) VALUES (
        $1::uuid,
        null,
        $2::varchar,
        $3::varchar,
        $4::varchar,
        $5::varchar,
        true,
        $6::text,
        '{}'::jsonb,
        now(),
        now()
      )
      RETURNING id
    `,
    [
      tenantId,
      input.displayName,
      input.contactName ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.notes ?? null
    ]
  );

  return result.rows[0];
}

export async function updateSupplierById(
  tenantId: string,
  supplierId: string,
  input: {
    displayName: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }
): Promise<void> {
  await pool.query(
    `
      UPDATE app.suppliers
      SET
        display_name = $3::varchar,
        contact_name = $4::varchar,
        email = $5::varchar,
        phone = $6::varchar,
        notes = $7::text,
        is_active = COALESCE($8::boolean, is_active),
        updated_at = now()
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
    `,
    [
      tenantId,
      supplierId,
      input.displayName,
      input.contactName ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.notes ?? null,
      typeof input.isActive === "boolean" ? input.isActive : null
    ]
  );
}
