import "server-only";

import { pool } from "@production-manager/db";

export type ClientDiscountRule = {
  productType: string;
  minQty: number;
  maxQty: number | null;
  discountPercent: number;
  note?: string;
};

export const MYOB_PRICE_LEVELS = ["Level A", "Level B", "Level C", "Level D", "Level E", "Level F"] as const;
export type MyobPriceLevel = (typeof MYOB_PRICE_LEVELS)[number];

export type CustomerPayload = {
  source?: string;
  abn?: string;
  billingAddress?: string;
  defaultSiteAddress?: string;
  notes?: string;
  logoUrl?: string;
  logoStoragePath?: string;
  defaultDiscountPercent?: number;
  discountRules?: ClientDiscountRule[];
  myobItemPriceLevel?: MyobPriceLevel | string;
  myobPriceLevelName?: string;
  myobPriceLevelNames?: Partial<Record<MyobPriceLevel, string>>;
  archivedAt?: string;
  deletedAt?: string;
  deletedReason?: string;
  [key: string]: unknown;
};

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
  payloadJson: CustomerPayload;
  createdAt: string;
  updatedAt: string;
};

function parseJsonObject(value: unknown): CustomerPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as CustomerPayload;
}


export function normaliseMyobPriceLevel(value: unknown): MyobPriceLevel | null {
  const text = String(value ?? "").trim();
  return (MYOB_PRICE_LEVELS as readonly string[]).includes(text) ? text as MyobPriceLevel : null;
}

export function customerMyobPriceLevel(customer: Pick<CustomerRecord, "payloadJson"> | null | undefined): MyobPriceLevel | null {
  return normaliseMyobPriceLevel(customer?.payloadJson?.myobItemPriceLevel);
}

export function customerMyobPriceLevelName(customer: Pick<CustomerRecord, "payloadJson"> | null | undefined): string {
  const level = customerMyobPriceLevel(customer);
  if (!level) return "";
  const direct = String(customer?.payloadJson?.myobPriceLevelName ?? "").trim();
  if (direct) return direct;
  const names = customer?.payloadJson?.myobPriceLevelNames;
  const named = names && typeof names === "object" ? String((names as Record<string, unknown>)[level] ?? "").trim() : "";
  return named || level;
}

export function customerMyobPriceLevelNames(customer: Pick<CustomerRecord, "payloadJson"> | null | undefined): Partial<Record<MyobPriceLevel, string>> {
  const value = customer?.payloadJson?.myobPriceLevelNames;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Partial<Record<MyobPriceLevel, string>> = {};
  for (const level of MYOB_PRICE_LEVELS) {
    const name = String((value as Record<string, unknown>)[level] ?? "").trim();
    if (name) result[level] = name;
  }
  return result;
}

export function isDeletedCustomer(customer: Pick<CustomerRecord, "payloadJson">): boolean {
  return Boolean(customer.payloadJson?.deletedAt);
}

export function customerLogoUrl(customer: Pick<CustomerRecord, "payloadJson"> | null | undefined): string {
  const value = customer?.payloadJson?.logoUrl;
  return typeof value === "string" ? value.trim() : "";
}

export function customerDefaultDiscount(customer: Pick<CustomerRecord, "payloadJson"> | null | undefined): number {
  const value = customer?.payloadJson?.defaultDiscountPercent;
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function customerDiscountRules(customer: Pick<CustomerRecord, "payloadJson"> | null | undefined): ClientDiscountRule[] {
  const value = customer?.payloadJson?.discountRules;
  if (!Array.isArray(value)) return [];
  return value.filter((rule): rule is ClientDiscountRule => {
    if (!rule || typeof rule !== "object") return false;
    const candidate = rule as Partial<ClientDiscountRule>;
    return Boolean(candidate.productType && Number(candidate.minQty) >= 0 && Number(candidate.discountPercent) > 0);
  }).map((rule) => ({
    productType: String(rule.productType),
    minQty: Number(rule.minQty),
    maxQty: rule.maxQty == null ? null : Number(rule.maxQty),
    discountPercent: Number(rule.discountPercent),
    note: rule.note ? String(rule.note) : undefined
  }));
}

export async function listCustomersForTenant(tenantId: string, options?: { includeDeleted?: boolean }): Promise<CustomerRecord[]> {
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

  const rows = result.rows.map((row) => ({ ...row, payloadJson: parseJsonObject(row.payloadJson) }));
  return options?.includeDeleted ? rows : rows.filter((row) => !isDeletedCustomer(row));
}

export async function listCustomerLogoSummariesForTenant(
  tenantId: string
): Promise<Array<Pick<CustomerRecord, "id" | "payloadJson">>> {
  const result = await pool.query<{ id: string; payloadJson: CustomerPayload }>(`
    SELECT
      id,
      jsonb_build_object('logoUrl', NULLIF(payload_json ->> 'logoUrl', '')) AS "payloadJson"
    FROM app.customers
    WHERE tenant_id = $1::uuid
      AND COALESCE(payload_json ->> 'deletedAt', '') = ''
  `, [tenantId]);

  return result.rows;
}

export async function getCustomerById(tenantId: string, customerId: string | null | undefined): Promise<CustomerRecord | null> {
  if (!customerId) return null;
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
      AND id = $2::uuid
    LIMIT 1
  `,[tenantId, customerId]);

  const row = result.rows[0];
  return row ? { ...row, payloadJson: parseJsonObject(row.payloadJson) } : null;
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
      payload_json = app.customers.payload_json || EXCLUDED.payload_json,
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

export async function updateCustomerForTenant(tenantId: string, customerId: string, input: {
  displayName: string;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  payloadJson?: CustomerPayload;
  isActive?: boolean;
}): Promise<void> {
  await pool.query(`
    UPDATE app.customers
    SET
      display_name = $3::varchar,
      company_name = $4::varchar,
      first_name = $5::varchar,
      last_name = $6::varchar,
      email = $7::varchar,
      phone = $8::varchar,
      payload_json = COALESCE(payload_json, '{}'::jsonb) || $9::jsonb,
      is_active = COALESCE($10::boolean, is_active),
      updated_at = now()
    WHERE tenant_id = $1::uuid
      AND id = $2::uuid
  `, [
    tenantId,
    customerId,
    input.displayName,
    input.companyName ?? null,
    input.firstName ?? null,
    input.lastName ?? null,
    input.email ?? null,
    input.phone ?? null,
    JSON.stringify(input.payloadJson ?? {}),
    input.isActive ?? null
  ]);
}

export async function updateCustomerPayloadForTenant(tenantId: string, customerId: string, payloadJson: CustomerPayload, isActive?: boolean): Promise<void> {
  await pool.query(`
    UPDATE app.customers
    SET payload_json = COALESCE(payload_json, '{}'::jsonb) || $3::jsonb,
        is_active = COALESCE($4::boolean, is_active),
        updated_at = now()
    WHERE tenant_id = $1::uuid
      AND id = $2::uuid
  `, [tenantId, customerId, JSON.stringify(payloadJson), isActive ?? null]);
}
