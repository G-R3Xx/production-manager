import "server-only";

import { pool } from "@production-manager/db";

export type SupplierRecord = {
  id: string;
  tenantId: string;
  myobUid: string | null;
  displayName: string;
  contactName: string | null;
  email: string | null;
  purchaseOrderEmail: string | null;
  phone: string | null;
  isActive: boolean;
  notes: string | null;
  payloadJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

let supplierPurchasingSchemaReady = false;

export async function ensureSupplierPurchasingSchema(): Promise<void> {
  if (supplierPurchasingSchemaReady || !process.env.DATABASE_URL) return;
  await pool.query(`
    ALTER TABLE app.suppliers
      ADD COLUMN IF NOT EXISTS purchase_order_email varchar(320);
  `);
  supplierPurchasingSchemaReady = true;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function listSuppliersForTenant(tenantId: string, search = ""): Promise<SupplierRecord[]> {
  await ensureSupplierPurchasingSchema();
  const term = search.trim();
  const hasTerm = term.length > 0;
  const result = await pool.query<Omit<SupplierRecord, "payloadJson"> & { payloadJson: unknown }>(`
    SELECT id, tenant_id as "tenantId", myob_uid as "myobUid", display_name as "displayName",
      contact_name as "contactName", email, purchase_order_email as "purchaseOrderEmail", phone, is_active as "isActive", notes,
      payload_json as "payloadJson", created_at as "createdAt", updated_at as "updatedAt"
    FROM app.suppliers
    WHERE tenant_id = $1::uuid
      AND ($2::boolean = false OR display_name ILIKE $3::text OR COALESCE(contact_name, '') ILIKE $3::text
        OR COALESCE(email, '') ILIKE $3::text OR COALESCE(phone, '') ILIKE $3::text)
    ORDER BY display_name asc
  `, [tenantId, hasTerm, `%${term}%`]);
  return result.rows.map((row) => ({ ...row, payloadJson: parseJsonObject(row.payloadJson) }));
}

export async function getSupplierById(tenantId: string, supplierId: string | null | undefined): Promise<SupplierRecord | null> {
  if (!supplierId) return null;
  await ensureSupplierPurchasingSchema();
  const result = await pool.query<Omit<SupplierRecord, "payloadJson"> & { payloadJson: unknown }>(`
    SELECT id, tenant_id as "tenantId", myob_uid as "myobUid", display_name as "displayName",
      contact_name as "contactName", email, purchase_order_email as "purchaseOrderEmail", phone, is_active as "isActive", notes,
      payload_json as "payloadJson", created_at as "createdAt", updated_at as "updatedAt"
    FROM app.suppliers
    WHERE tenant_id = $1::uuid AND id = $2::uuid
    LIMIT 1
  `, [tenantId, supplierId]);
  const row = result.rows[0];
  return row ? { ...row, payloadJson: parseJsonObject(row.payloadJson) } : null;
}

export async function createSupplierForTenant(tenantId: string, input: {
  displayName: string; contactName?: string | null; email?: string | null; purchaseOrderEmail?: string | null; phone?: string | null; notes?: string | null;
  payloadJson?: Record<string, unknown>;
}): Promise<{ id: string }> {
  await ensureSupplierPurchasingSchema();
  const result = await pool.query<{ id: string }>(`
    INSERT INTO app.suppliers (tenant_id, myob_uid, display_name, contact_name, email, purchase_order_email, phone, is_active, notes, payload_json, created_at, updated_at)
    VALUES ($1::uuid, null, $2::varchar, $3::varchar, $4::varchar, COALESCE($5::varchar,$4::varchar), $6::varchar, true, $7::text, $8::jsonb, now(), now())
    RETURNING id
  `, [tenantId, input.displayName, input.contactName ?? null, input.email ?? null, input.purchaseOrderEmail ?? null, input.phone ?? null, input.notes ?? null, JSON.stringify(input.payloadJson ?? {})]);
  return result.rows[0];
}

export async function updateSupplierById(tenantId: string, supplierId: string, input: {
  displayName: string; contactName?: string | null; email?: string | null; purchaseOrderEmail?: string | null; phone?: string | null; notes?: string | null; isActive?: boolean;
  payloadJson?: Record<string, unknown>;
}): Promise<void> {
  await ensureSupplierPurchasingSchema();
  await pool.query(`
    UPDATE app.suppliers SET display_name=$3::varchar, contact_name=$4::varchar, email=$5::varchar, purchase_order_email=$6::varchar, phone=$7::varchar,
      notes=$8::text, is_active=COALESCE($9::boolean,is_active),
      payload_json=COALESCE(payload_json,'{}'::jsonb)||$10::jsonb, updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `, [tenantId, supplierId, input.displayName, input.contactName ?? null, input.email ?? null, input.purchaseOrderEmail ?? input.email ?? null, input.phone ?? null,
    input.notes ?? null, typeof input.isActive === "boolean" ? input.isActive : null, JSON.stringify(input.payloadJson ?? {})]);
}

export async function upsertImportedSupplier(tenantId: string, input: {
  myobUid: string; displayName: string; contactName?: string | null; email?: string | null; purchaseOrderEmail?: string | null; phone?: string | null;
  isActive?: boolean; notes?: string | null; payloadJson?: Record<string, unknown>;
}): Promise<{ id: string }> {
  await ensureSupplierPurchasingSchema();
  const result = await pool.query<{ id: string }>(`
    INSERT INTO app.suppliers (tenant_id,myob_uid,display_name,contact_name,email,purchase_order_email,phone,is_active,notes,payload_json,created_at,updated_at)
    VALUES ($1::uuid,$2::varchar,$3::varchar,$4::varchar,$5::varchar,COALESCE($6::varchar,$5::varchar),$7::varchar,$8::boolean,$9::text,$10::jsonb,now(),now())
    ON CONFLICT (tenant_id,myob_uid) WHERE myob_uid IS NOT NULL
    DO UPDATE SET display_name=EXCLUDED.display_name, contact_name=EXCLUDED.contact_name, email=EXCLUDED.email,
      purchase_order_email=COALESCE(app.suppliers.purchase_order_email,EXCLUDED.purchase_order_email), phone=EXCLUDED.phone, is_active=EXCLUDED.is_active, notes=COALESCE(EXCLUDED.notes,app.suppliers.notes),
      payload_json=COALESCE(app.suppliers.payload_json,'{}'::jsonb)||EXCLUDED.payload_json, updated_at=now()
    RETURNING id
  `, [tenantId,input.myobUid,input.displayName,input.contactName??null,input.email??null,input.purchaseOrderEmail??null,input.phone??null,input.isActive??true,
      input.notes??null,JSON.stringify(input.payloadJson??{})]);
  return result.rows[0];
}

export async function updateSupplierMyobLink(tenantId: string, supplierId: string, input: {
  myobUid: string; payloadJson?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(`
    UPDATE app.suppliers
    SET myob_uid=$3::varchar, payload_json=COALESCE(payload_json,'{}'::jsonb)||$4::jsonb, updated_at=now()
    WHERE tenant_id=$1::uuid AND id=$2::uuid
  `,[tenantId,supplierId,input.myobUid,JSON.stringify(input.payloadJson??{})]);
}
