import "server-only";

import { pool } from "@production-manager/db";

import {
  createSyncRunForTenant,
  getMyobConnectionByTenantId,
  getMyobOauthTokenByTenantId,
  markMyobConnectionHealthy,
  upsertExternalMappingByTenantId,
  upsertMyobConnectionByTenantId,
  upsertMyobOauthTokenByTenantId
} from "@/server/integrations";
import { env } from "@/lib/env";
import { getCustomerById, upsertImportedCustomer, type CustomerRecord } from "@/server/customers";
import { upsertImportedProduct } from "@/server/products";

export type MyobReadOnlySyncSummary = {
  companyFileId: string;
  companyName: string | null;
  tokenRefreshed: boolean;
  companyInfo: {
    ok: boolean;
    endpoint: string;
    displayName?: string | null;
    rawKeys?: string[];
    error?: string;
  };
  customers: { ok: boolean; endpoint: string; count: number; error?: string };
  suppliers: { ok: boolean; endpoint: string; count: number; error?: string };
  items: { ok: boolean; endpoint: string; count: number; error?: string };
};

type MyobTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
};

function getBusinessApiBaseUrl() {
  return env.MYOB_BUSINESS_API_BASE_URL ?? "https://api.myob.com/accountright";
}

function normaliseExpiresAt(expiresIn?: number) {
  if (!expiresIn || Number.isNaN(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

async function refreshMyobAccessToken(refreshToken: string) {
  if (!env.MYOB_CLIENT_ID || !env.MYOB_CLIENT_SECRET || !env.MYOB_API_BASE_URL) {
    throw new Error("MYOB OAuth environment variables are not fully configured for token refresh.");
  }

  const tokenUrl = new URL("oauth2/v1/authorize", env.MYOB_API_BASE_URL);
  const body = new URLSearchParams({
    client_id: env.MYOB_CLIENT_ID,
    client_secret: env.MYOB_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20000)
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parsed && typeof parsed === "object" ? JSON.stringify(parsed) : text;
    throw new Error(`MYOB refresh token exchange failed (${response.status}): ${detail}`);
  }

  const tokenResponse = parsed as Partial<MyobTokenResponse> | null;

  if (!tokenResponse?.access_token) {
    throw new Error("MYOB refresh response did not include a new access token.");
  }

  return tokenResponse as MyobTokenResponse;
}

export async function getValidAccessToken(tenantId: string) {
  const token = await getMyobOauthTokenByTenantId(tenantId);

  if (!token) {
    throw new Error("No stored MYOB OAuth token found for this tenant.");
  }

  const expiresAtMs = token.expiresAt ? new Date(token.expiresAt).getTime() : null;
  const shouldRefresh = !expiresAtMs || Number.isNaN(expiresAtMs) || expiresAtMs - Date.now() < 5 * 60 * 1000;

  if (!shouldRefresh) {
    return { accessToken: token.accessToken, refreshed: false };
  }

  const refreshed = await refreshMyobAccessToken(token.refreshToken);
  await upsertMyobOauthTokenByTenantId(tenantId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? token.refreshToken,
    tokenType: refreshed.token_type ?? token.tokenType,
    scope: refreshed.scope ?? token.scope,
    expiresAt: normaliseExpiresAt(refreshed.expires_in)
  });

  return { accessToken: refreshed.access_token, refreshed: true };
}

export async function fetchMyobJson(accessToken: string, companyFileId: string, endpoint: string) {
  const url = new URL(`${companyFileId}${endpoint}`, `${getBusinessApiBaseUrl().replace(/\/$/, "")}/`);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "x-myobapi-key": env.MYOB_CLIENT_ID ?? "",
      "x-myobapi-version": "v2"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20000)
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parsed && typeof parsed === "object" ? JSON.stringify(parsed) : text || response.statusText;
    throw new Error(`${response.status}: ${detail}`);
  }

  return { url: url.toString(), data: parsed };
}

function countCollection(data: unknown) {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const items = obj.Items;
    if (Array.isArray(items)) return items.length;
    const values = Object.values(obj).find((value) => Array.isArray(value));
    if (Array.isArray(values)) return values.length;
  }
  return 0;
}

export async function runMyobReadOnlySync(tenantId: string): Promise<MyobReadOnlySyncSummary> {
  const connection = await getMyobConnectionByTenantId(tenantId);

  if (!connection?.companyFileId) {
    throw new Error("No MYOB company file is linked to this tenant yet.");
  }

  const { accessToken, refreshed } = await getValidAccessToken(tenantId);

  const summary: MyobReadOnlySyncSummary = {
    companyFileId: connection.companyFileId,
    companyName: connection.companyName,
    tokenRefreshed: refreshed,
    companyInfo: { ok: false, endpoint: "/Company/Preferences" },
    customers: { ok: false, endpoint: "/Contact/Customer?$top=50", count: 0 },
    suppliers: { ok: false, endpoint: "/Contact/Supplier?$top=50", count: 0 },
    items: { ok: false, endpoint: "/Inventory/Item?$top=50", count: 0 }
  };

  try {
    const result = await fetchMyobJson(accessToken, connection.companyFileId, "/Company/Preferences");
    const data = result.data as Record<string, unknown> | null;
    summary.companyInfo = {
      ok: true,
      endpoint: result.url,
      displayName: typeof data?.Name === "string" ? data.Name : typeof data?.CompanyName === "string" ? data.CompanyName : null,
      rawKeys: data ? Object.keys(data).slice(0, 10) : []
    };
  } catch (error) {
    summary.companyInfo = {
      ok: false,
      endpoint: "/Company/Preferences",
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }

  for (const [key, endpoint] of [["customers", "/Contact/Customer?$top=50"], ["suppliers", "/Contact/Supplier?$top=50"], ["items", "/Inventory/Item?$top=50"]] as const) {
    try {
      const result = await fetchMyobJson(accessToken, connection.companyFileId, endpoint);
      summary[key] = { ok: true, endpoint: result.url, count: countCollection(result.data) } as any;
    } catch (error) {
      summary[key] = { ok: false, endpoint, count: 0, error: error instanceof Error ? error.message : "Unknown error" } as any;
    }
  }

  const hadErrors = !summary.companyInfo.ok || !summary.customers.ok || !summary.suppliers.ok || !summary.items.ok;

  if (hadErrors) {
    await upsertMyobConnectionByTenantId(tenantId, {
      environment: connection.environment,
      companyFileId: connection.companyFileId,
      companyName: summary.companyInfo.displayName ?? connection.companyName,
      status: "error",
      connectedAt: connection.connectedAt,
      disconnectedAt: connection.disconnectedAt,
      lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt
    });
  } else {
    await markMyobConnectionHealthy(tenantId, {
      environment: connection.environment,
      companyFileId: connection.companyFileId,
      companyName: summary.companyInfo.displayName ?? connection.companyName,
      connectedAt: connection.connectedAt,
      lastSuccessfulSyncAt: new Date().toISOString()
    });
  }

  await createSyncRunForTenant(
    tenantId,
    "incremental_import",
    hadErrors ? "error" : "success",
    { source: "runMyobReadOnlySync", ...summary },
    hadErrors ? [summary.companyInfo, summary.customers, summary.suppliers, summary.items].find((item) => !item.ok)?.error ?? "Read-only sync failed." : null
  );

  return summary;
}


export type MyobCustomerImportSummary = {
  importedCount: number;
  mappedCount: number;
  sample: Array<{ myobUid: string; displayName: string; localId: string }>;
};

function normaliseCustomerDisplayName(customer: Record<string, unknown>) {
  const companyName = typeof customer.CompanyName === "string" ? customer.CompanyName : null;
  const displayID = typeof customer.DisplayID === "string" ? customer.DisplayID : null;
  const firstName = typeof customer.FirstName === "string" ? customer.FirstName : null;
  const lastName = typeof customer.LastName === "string" ? customer.LastName : null;
  const personName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return companyName || personName || displayID || "Imported MYOB customer";
}

export async function importMyobCustomersAndCreateMappings(tenantId: string): Promise<MyobCustomerImportSummary> {
  const connection = await getMyobConnectionByTenantId(tenantId);

  if (!connection?.companyFileId) {
    throw new Error("No MYOB company file is linked to this tenant yet.");
  }

  const companyFileId = connection.companyFileId;
  const { accessToken } = await getValidAccessToken(tenantId);
  const result = await fetchMyobJson(accessToken, companyFileId, "/Contact/Customer?$top=50");
  const payload = result.data as Record<string, unknown> | null;
  const customers = Array.isArray(payload?.Items) ? payload.Items : Array.isArray(result.data) ? result.data as unknown[] : [];
  const imported: Array<{ myobUid: string; displayName: string; localId: string }> = [];

  for (const raw of customers) {
    if (!raw || typeof raw !== "object") continue;
    const customer = raw as Record<string, unknown>;
    const myobUid = typeof customer.UID === "string" ? customer.UID : null;
    if (!myobUid) continue;

    const displayName = normaliseCustomerDisplayName(customer);
    const companyName = typeof customer.CompanyName === "string" ? customer.CompanyName : null;
    const firstName = typeof customer.FirstName === "string" ? customer.FirstName : null;
    const lastName = typeof customer.LastName === "string" ? customer.LastName : null;
    const email = customer.Email && typeof customer.Email === "object" && customer.Email && "Address" in customer.Email
      ? String((customer.Email as Record<string, unknown>).Address ?? "") || null
      : null;
    const phone = customer.Phone1 && typeof customer.Phone1 === "object" && customer.Phone1 && "Number" in customer.Phone1
      ? String((customer.Phone1 as Record<string, unknown>).Number ?? "") || null
      : null;
    const isActive = customer.IsActive !== false;

    const saved = await upsertImportedCustomer(tenantId, {
      myobUid,
      displayName,
      companyName,
      firstName,
      lastName,
      email,
      phone,
      isActive,
      payloadJson: customer
    });

    await upsertExternalMappingByTenantId(tenantId, {
      entityType: "customer",
      localId: saved.id,
      externalId: myobUid,
      syncState: "synced",
      lastSyncedAt: new Date().toISOString(),
      payloadJson: { displayName, companyName }
    });

    imported.push({ myobUid, displayName, localId: saved.id });
  }

  await markMyobConnectionHealthy(tenantId, {
    environment: connection.environment,
    companyFileId: connection.companyFileId,
    companyName: connection.companyName,
    connectedAt: connection.connectedAt,
    lastSuccessfulSyncAt: new Date().toISOString()
  });

  const summary: MyobCustomerImportSummary = {
    importedCount: imported.length,
    mappedCount: imported.length,
    sample: imported.slice(0, 5)
  };

  await createSyncRunForTenant(tenantId, "incremental_import", "success", {
    source: "importMyobCustomersAndCreateMappings",
    companyFileId,
    companyName: connection.companyName,
    customersImported: summary.importedCount,
    mappingsCreated: summary.mappedCount,
    sample: summary.sample
  }, null);

  return summary;
}


export type MyobItemImportSummary = {
  importedCount: number;
  mappedCount: number;
  sample: Array<{ myobUid: string; name: string; sku: string | null; localId: string }>;
};

function normaliseItemName(item: Record<string, unknown>) {
  const name = typeof item.Name === "string" ? item.Name : null;
  const number = typeof item.Number === "string" ? item.Number : null;
  const description = typeof item.Description === "string" ? item.Description : null;
  return name || description || number || "Imported MYOB item";
}

function readNestedTaxCode(item: Record<string, unknown>) {
  const candidates = [item.BuyingDetails, item.SellingDetails];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      const code = (candidate as Record<string, unknown>).TaxCode;
      if (code && typeof code === "object" && "Code" in code) {
        const value = (code as Record<string, unknown>).Code;
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }
  }
  return null;
}

export async function importMyobItemsAndCreateMappings(tenantId: string): Promise<MyobItemImportSummary> {
  const connection = await getMyobConnectionByTenantId(tenantId);

  if (!connection?.companyFileId) {
    throw new Error("No MYOB company file is linked to this tenant yet.");
  }

  const companyFileId = connection.companyFileId;
  const { accessToken } = await getValidAccessToken(tenantId);
  const result = await fetchMyobJson(accessToken, companyFileId, "/Inventory/Item?$top=50");
  const payload = result.data as Record<string, unknown> | null;
  const items = Array.isArray(payload?.Items) ? payload.Items : Array.isArray(result.data) ? (result.data as unknown[]) : [];
  const imported: Array<{ myobUid: string; name: string; sku: string | null; localId: string }> = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const myobUid = typeof item.UID === "string" ? item.UID : null;
    if (!myobUid) continue;

    const sku = typeof item.Number === "string" && item.Number.trim() ? item.Number.trim() : null;
    const name = normaliseItemName(item);
    const taxCode = readNestedTaxCode(item);
    const isActive = item.IsInactive === true ? false : item.IsActive !== false;

    const saved = await upsertImportedProduct(tenantId, {
      myobUid,
      sku,
      name,
      taxCode,
      status: isActive ? "active" : "draft",
      department: "general",
      productFamily: "general",
      calculatorType: "configurator_template",
      payloadJson: item
    });

    await upsertExternalMappingByTenantId(tenantId, {
      entityType: "product",
      localId: saved.id,
      externalId: myobUid,
      syncState: "synced",
      lastSyncedAt: new Date().toISOString(),
      payloadJson: { name, sku, taxCode }
    });

    imported.push({ myobUid, name, sku, localId: saved.id });
  }

  await markMyobConnectionHealthy(tenantId, {
    environment: connection.environment,
    companyFileId: connection.companyFileId,
    companyName: connection.companyName,
    connectedAt: connection.connectedAt,
    lastSuccessfulSyncAt: new Date().toISOString()
  });

  const summary: MyobItemImportSummary = {
    importedCount: imported.length,
    mappedCount: imported.length,
    sample: imported.slice(0, 5)
  };

  await createSyncRunForTenant(
    tenantId,
    "incremental_import",
    "success",
    {
      source: "importMyobItemsAndCreateMappings",
      companyFileId,
      companyName: connection.companyName,
      itemsImported: summary.importedCount,
      mappingsCreated: summary.mappedCount,
      sample: summary.sample
    },
    null
  );

  return summary;
}

export type MyobOrderPushResult = {
  ok: boolean;
  quoteId: string;
  myobOrderUid: string | null;
  myobOrderNumber: string | null;
  endpoint: string | null;
  message: string;
};

async function sendMyobJson(accessToken: string, companyFileId: string, endpoint: string, method: "POST" | "PUT", body: Record<string, unknown>) {
  const url = new URL(`${companyFileId}${endpoint}`, `${getBusinessApiBaseUrl().replace(/\/$/, "")}/`);
  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-myobapi-key": env.MYOB_CLIENT_ID ?? "",
      "x-myobapi-version": "v2"
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000)
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parsed && typeof parsed === "object" ? JSON.stringify(parsed) : text || response.statusText;
    throw new Error(`${response.status}: ${detail}`);
  }

  return { url: url.toString(), data: parsed, location: response.headers.get("location") };
}

function numberValue(value: string | null | undefined): number {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function textOrNull(value: unknown): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned.length ? cleaned : null;
}

function readMyobUid(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return textOrNull(record.UID) ?? textOrNull(record.Uid) ?? textOrNull(record.uid);
}

function readMyobNumber(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return textOrNull(record.Number) ?? textOrNull(record.OrderNumber) ?? textOrNull(record.DisplayID) ?? textOrNull(record.UID);
}

function myobCollectionRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  const items = Array.isArray(record.Items) ? record.Items : [];
  return items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function odataString(value: string): string {
  return value.replace(/'/g, "''");
}

function customerAddressRecords(customer: Record<string, unknown>): Record<string, unknown>[] {
  const value = customer.Addresses;
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function customerExactEmail(customer: Record<string, unknown>, email: string): boolean {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return false;
  return customerAddressRecords(customer).some((address) => String(address.Email ?? "").trim().toLowerCase() === wanted);
}

function customerExactCompany(customer: Record<string, unknown>, company: string): boolean {
  const wanted = company.trim().toLowerCase();
  return Boolean(wanted && String(customer.CompanyName ?? "").trim().toLowerCase() === wanted);
}

function customerExactPerson(customer: Record<string, unknown>, firstName: string, lastName: string): boolean {
  const wantedFirst = firstName.trim().toLowerCase();
  const wantedLast = lastName.trim().toLowerCase();
  if (!wantedLast) return false;
  return String(customer.LastName ?? "").trim().toLowerCase() === wantedLast
    && (!wantedFirst || String(customer.FirstName ?? "").trim().toLowerCase() === wantedFirst);
}

function generatedMyobCustomerDisplayId(customerId: string): string {
  const compact = customerId.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `PM${compact.slice(0, 12)}`.slice(0, 15);
}

function localCustomerContactName(customer: CustomerRecord): string {
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || customer.displayName;
}

function buildMyobCustomerPayload(customer: CustomerRecord): Record<string, unknown> {
  const companyName = String(customer.companyName ?? "").trim();
  const firstName = String(customer.firstName ?? "").trim();
  const lastName = String(customer.lastName ?? "").trim();
  const isIndividual = !companyName && Boolean(firstName || lastName);
  const address = String(customer.payloadJson?.billingAddress ?? customer.payloadJson?.defaultSiteAddress ?? "").trim();
  const email = String(customer.email ?? "").trim();
  const phone = String(customer.phone ?? "").trim();
  const contactName = localCustomerContactName(customer).slice(0, 25);
  const addressRecord: Record<string, unknown> = { Location: 1 };
  if (address) addressRecord.Street = address.slice(0, 255);
  if (email) addressRecord.Email = email.slice(0, 255);
  if (phone) addressRecord.Phone1 = phone.slice(0, 21);
  if (contactName) addressRecord.ContactName = contactName;

  const payload: Record<string, unknown> = {
    DisplayID: generatedMyobCustomerDisplayId(customer.id),
    IsIndividual: isIndividual,
    IsActive: true,
    Notes: "Created by Production Manager"
  };

  if (isIndividual) {
    payload.LastName = (lastName || customer.displayName || "Customer").slice(0, 30);
    if (firstName) payload.FirstName = firstName.slice(0, 20);
  } else {
    payload.CompanyName = (companyName || customer.displayName || "Customer").slice(0, 50);
  }

  if (Object.keys(addressRecord).length > 1) payload.Addresses = [addressRecord];
  return payload;
}

async function exactMyobCustomerMatches(
  accessToken: string,
  companyFileId: string,
  customer: CustomerRecord
): Promise<Record<string, unknown>[]> {
  const email = String(customer.email ?? "").trim();
  const companyName = String(customer.companyName ?? "").trim();
  const firstName = String(customer.firstName ?? "").trim();
  const lastName = String(customer.lastName ?? "").trim();
  const endpoints: string[] = [];

  if (email) endpoints.push(`/Contact/Customer?$filter=Addresses/any(x: x/Email eq '${odataString(email)}')&$top=20`);
  if (companyName) endpoints.push(`/Contact/Customer?$filter=CompanyName eq '${odataString(companyName)}'&$top=20`);
  if (!companyName && lastName) endpoints.push(`/Contact/Customer?$filter=LastName eq '${odataString(lastName)}'&$top=20`);

  const byUid = new Map<string, Record<string, unknown>>();
  const results = await Promise.all(endpoints.map((endpoint) => fetchMyobJson(accessToken, companyFileId, endpoint)));
  for (const result of results) {
    for (const candidate of myobCollectionRecords(result.data)) {
      const uid = textOrNull(candidate.UID);
      if (!uid) continue;
      const matches = customerExactEmail(candidate, email)
        || customerExactCompany(candidate, companyName)
        || customerExactPerson(candidate, firstName, lastName);
      if (matches) byUid.set(uid, candidate);
    }
  }

  return Array.from(byUid.values());
}

async function saveLocalCustomerMyobLink(
  tenantId: string,
  customer: CustomerRecord,
  myobCustomer: Record<string, unknown>,
  match: string
): Promise<void> {
  const uid = textOrNull(myobCustomer.UID);
  if (!uid) throw new Error("MYOB customer response did not include a UID.");
  const displayName = normaliseCustomerDisplayName(myobCustomer);
  const displayId = textOrNull(myobCustomer.DisplayID);
  const existing = await pool.query<{ id: string }>(`
    SELECT id
    FROM app.customers
    WHERE tenant_id = $1::uuid AND myob_uid = $2::varchar
    LIMIT 1
  `, [tenantId, uid]);
  const canUsePrimaryUid = !existing.rows[0] || existing.rows[0].id === customer.id;

  await pool.query(`
    UPDATE app.customers
    SET
      myob_uid = CASE WHEN $4::boolean THEN $3::varchar ELSE myob_uid END,
      payload_json = COALESCE(payload_json, '{}'::jsonb) || $5::jsonb,
      is_active = true,
      updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [
    tenantId,
    customer.id,
    uid,
    canUsePrimaryUid,
    JSON.stringify({
      myobUid: uid,
      myobDisplayName: displayName,
      myobDisplayId: displayId,
      myobMatch: match,
      myobLinkedAt: new Date().toISOString()
    })
  ]);

  await upsertExternalMappingByTenantId(tenantId, {
    entityType: "customer",
    localId: customer.id,
    externalId: uid,
    syncState: "synced",
    lastSyncedAt: new Date().toISOString(),
    payloadJson: { displayName, displayId, match }
  });
}

function readUidFromLocation(location: string | null): string | null {
  if (!location) return null;
  const match = location.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0] ?? null;
}

export type MyobCustomerCreateResult = {
  uid: string;
  displayName: string;
  displayId: string | null;
  created: boolean;
  matchedExisting: boolean;
};

export async function createMyobCustomerFromLocalClientForTenant(
  tenantId: string,
  customerId: string
): Promise<MyobCustomerCreateResult> {
  const customer = await getCustomerById(tenantId, customerId);
  if (!customer) throw new Error("Production Manager client could not be found.");

  const alreadyLinkedUid = customer.myobUid && !customer.myobUid.startsWith("manual-")
    ? customer.myobUid
    : typeof customer.payloadJson?.myobUid === "string" && !customer.payloadJson.myobUid.startsWith("manual-")
      ? customer.payloadJson.myobUid
      : null;
  if (alreadyLinkedUid) {
    return {
      uid: alreadyLinkedUid,
      displayName: String(customer.payloadJson?.myobDisplayName ?? customer.displayName),
      displayId: typeof customer.payloadJson?.myobDisplayId === "string" ? customer.payloadJson.myobDisplayId : null,
      created: false,
      matchedExisting: true
    };
  }

  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection?.companyFileId || connection.status !== "connected") {
    throw new Error("MYOB is not connected. Connect MYOB before creating a customer.");
  }

  const { accessToken } = await getValidAccessToken(tenantId);
  const matches = await exactMyobCustomerMatches(accessToken, connection.companyFileId, customer);
  if (matches.length > 1) {
    const names = matches.slice(0, 4).map((item) => `${normaliseCustomerDisplayName(item)}${textOrNull(item.DisplayID) ? ` (${textOrNull(item.DisplayID)})` : ""}`).join(", ");
    throw new Error(`More than one exact MYOB customer match was found: ${names}. Link the correct existing MYOB customer instead of creating a duplicate.`);
  }
  if (matches.length === 1) {
    const matched = matches[0];
    if (matched.IsActive === false) {
      throw new Error(`A matching MYOB customer already exists (${normaliseCustomerDisplayName(matched)}) but is inactive. Reactivate it in MYOB or choose another existing customer.`);
    }
    await saveLocalCustomerMyobLink(tenantId, customer, matched, "create_button_exact_match");
    return {
      uid: String(matched.UID),
      displayName: normaliseCustomerDisplayName(matched),
      displayId: textOrNull(matched.DisplayID),
      created: false,
      matchedExisting: true
    };
  }

  const payload = buildMyobCustomerPayload(customer);
  const endpoint = "/Contact/Customer";
  const result = await sendMyobJson(accessToken, connection.companyFileId, endpoint, "POST", payload);
  let created = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? result.data as Record<string, unknown>
    : null;
  let uid = readMyobUid(created) ?? readUidFromLocation(result.location);

  if (!uid) {
    const displayId = String(payload.DisplayID ?? "").trim();
    const lookup = await fetchMyobJson(accessToken, connection.companyFileId, `/Contact/Customer?$filter=DisplayID eq '${odataString(displayId)}'&$top=5`);
    created = myobCollectionRecords(lookup.data).find((candidate) => String(candidate.DisplayID ?? "").trim().toLowerCase() === displayId.toLowerCase()) ?? null;
    uid = readMyobUid(created);
  }
  if (!uid) throw new Error("MYOB accepted the customer create request but Production Manager could not read the new customer UID. Refresh MYOB customers before trying again.");

  const createdRecord: Record<string, unknown> = {
    ...(created ?? {}),
    UID: uid,
    DisplayID: textOrNull(created?.DisplayID) ?? String(payload.DisplayID ?? ""),
    CompanyName: textOrNull(created?.CompanyName) ?? textOrNull(payload.CompanyName),
    FirstName: textOrNull(created?.FirstName) ?? textOrNull(payload.FirstName),
    LastName: textOrNull(created?.LastName) ?? textOrNull(payload.LastName),
    IsActive: created?.IsActive ?? true
  };
  await saveLocalCustomerMyobLink(tenantId, customer, createdRecord, "created_from_production_manager");

  await createSyncRunForTenant(tenantId, "incremental_import", "success", {
    source: "createMyobCustomerFromLocalClientForTenant",
    customerId: customer.id,
    customerName: customer.displayName,
    myobCustomerUid: uid,
    myobDisplayId: textOrNull(createdRecord.DisplayID),
    endpoint: result.url
  }, null);

  return {
    uid,
    displayName: normaliseCustomerDisplayName(createdRecord),
    displayId: textOrNull(createdRecord.DisplayID),
    created: true,
    matchedExisting: false
  };
}

function buildOrderLineDescription(line: import("@/server/quotes").QuoteLineRecord, customerMaterialNames: Map<string, string> = new Map()): string {
  let description = [line.productName, line.optionSummary, line.notes].filter(Boolean).join("\n");
  for (const [internalName, customerName] of customerMaterialNames) {
    if (!internalName || !customerName || internalName === customerName) continue;
    description = description.split(internalName).join(customerName);
  }
  return description.slice(0, 1000);
}

async function customerFacingMaterialNamesForTenant(tenantId: string): Promise<Map<string, string>> {
  await pool.query(`ALTER TABLE catalog.materials ADD COLUMN IF NOT EXISTS customer_facing_name varchar(200)`);
  const result = await pool.query<{ name: string; customerFacingName: string }>(`
    SELECT name, customer_facing_name AS "customerFacingName"
    FROM catalog.materials
    WHERE tenant_id = $1::uuid
      AND NULLIF(BTRIM(customer_facing_name), '') IS NOT NULL
  `, [tenantId]);
  const names = new Map<string, string>();
  for (const row of result.rows) {
    const internalName = String(row.name ?? "").trim();
    const customerName = String(row.customerFacingName ?? "").trim();
    if (internalName && customerName) names.set(internalName, customerName);
  }
  return names;
}

async function resolveMyobCustomerUid(tenantId: string, quote: import("@/server/quotes").QuoteDraftRecord): Promise<{ uid: string | null; source: string; customerPayload?: Record<string, unknown> }> {
  if (!quote.linkedCustomerId) {
    return { uid: null, source: "quote-not-linked-to-client" };
  }

  const customer = await getCustomerById(tenantId, quote.linkedCustomerId);
  if (!customer) return { uid: null, source: "linked-client-not-found" };

  if (customer.myobUid && !customer.myobUid.startsWith("manual-")) {
    return { uid: customer.myobUid, source: "linked-client-myob-uid", customerPayload: customer.payloadJson };
  }

  const mappedUid = typeof customer.payloadJson?.myobUid === "string" ? customer.payloadJson.myobUid : null;
  if (mappedUid && !mappedUid.startsWith("manual-")) {
    return { uid: mappedUid, source: "linked-client-payload-myob-uid", customerPayload: customer.payloadJson };
  }

  const exactCandidates = async (mode: "email" | "company") => {
    const email = String(customer.email ?? "").trim().toLowerCase();
    const company = String(customer.companyName || customer.displayName || "").trim().toLowerCase();
    if ((mode === "email" && !email) || (mode === "company" && !company)) return [] as Array<{ uid: string }>;
    const result = await pool.query<{ uid: string }>(`
      SELECT myob_uid AS uid
      FROM app.customers
      WHERE tenant_id=$1::uuid AND id<>$2::uuid AND is_active=true
        AND myob_uid IS NOT NULL AND myob_uid NOT LIKE 'manual-%'
        AND COALESCE(payload_json->>'deletedAt','')=''
        AND CASE WHEN $3::text='email'
          THEN lower(COALESCE(email,''))=$4::text
          ELSE lower(COALESCE(company_name,display_name,''))=$5::text
        END
      ORDER BY updated_at DESC
      LIMIT 2
    `, [tenantId, customer.id, mode, email, company]);
    return result.rows;
  };

  for (const mode of ["email", "company"] as const) {
    const candidates = await exactCandidates(mode);
    if (candidates.length !== 1) continue;
    const uid = candidates[0].uid;
    await pool.query(`
      UPDATE app.customers
      SET payload_json=COALESCE(payload_json,'{}'::jsonb) || jsonb_build_object('myobUid',$3::text,'myobMatch',$4::text),updated_at=now()
      WHERE tenant_id=$1::uuid AND id=$2::uuid
    `, [tenantId, customer.id, uid, `automatic_exact_${mode}`]);
    return { uid, source: `automatic-exact-${mode}-match`, customerPayload: { ...customer.payloadJson, myobUid: uid, myobMatch: `automatic_exact_${mode}` } };
  }

  return { uid: null, source: "client-is-manual-not-linked-to-myob", customerPayload: customer.payloadJson };
}

function buildMyobServiceOrderPayload(input: {
  quote: import("@/server/quotes").QuoteDraftRecord;
  lines: import("@/server/quotes").QuoteLineRecord[];
  customerUid: string;
  customerMaterialNames?: Map<string, string>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const subtotal = input.lines.reduce((sum, line) => sum + numberValue(line.lineTotal), 0);
  const lines = input.lines.map((line) => ({
    Type: "Transaction",
    Description: buildOrderLineDescription(line, input.customerMaterialNames),
    Total: numberValue(line.lineTotal),
    TaxCode: { Code: "GST" },
    Job: null
  }));

  return {
    Customer: { UID: input.customerUid },
    Date: today,
    Number: input.quote.quoteNumber ?? undefined,
    CustomerPurchaseOrderNumber: input.quote.clientPurchaseOrderNumber ?? undefined,
    JournalMemo: `Production Manager accepted quote ${input.quote.quoteNumber ?? input.quote.id}`,
    Comment: input.quote.notes ?? undefined,
    Lines: lines,
    Freight: 0,
    FreightTaxCode: { Code: "GST" },
    IsTaxInclusive: false
  };
}

export async function pushAcceptedQuoteToMyobOrderForTenant(tenantId: string, quoteId: string): Promise<MyobOrderPushResult> {
  const { getQuoteDraftById, listQuoteLines, updateQuoteMyobOrderSyncForTenant } = await import("@/server/quotes");
  const quote = await getQuoteDraftById(tenantId, quoteId);
  if (!quote) throw new Error("Quote not found.");

  if (quote.status !== "accepted") {
    await updateQuoteMyobOrderSyncForTenant(tenantId, quoteId, {
      status: "error",
      error: "Only accepted quotes can be pushed to MYOB as open orders.",
      payloadJson: { attemptedAt: new Date().toISOString(), stage: "preflight" }
    });
    throw new Error("Only accepted quotes can be pushed to MYOB as open orders.");
  }

  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection?.companyFileId || connection.status !== "connected") {
    const message = "MYOB is not connected. Connect MYOB before sending accepted quotes to MYOB Orders.";
    await updateQuoteMyobOrderSyncForTenant(tenantId, quoteId, { status: "error", error: message, payloadJson: { attemptedAt: new Date().toISOString(), stage: "connection" } });
    throw new Error(message);
  }

  const allLines = await listQuoteLines(quoteId);
  const hasExplicitLineResponses = allLines.some((line) => line.clientResponseStatus !== "pending");
  const lines = hasExplicitLineResponses
    ? allLines.filter((line) => line.clientResponseStatus === "approved")
    : allLines;
  if (!lines.length) {
    const message = "This quote has no approved quote lines to send to MYOB.";
    await updateQuoteMyobOrderSyncForTenant(tenantId, quoteId, { status: "error", error: message, payloadJson: { attemptedAt: new Date().toISOString(), stage: "quote-lines" } });
    throw new Error(message);
  }

  const customer = await resolveMyobCustomerUid(tenantId, quote);
  if (!customer.uid) {
    const message = "The linked client is not mapped to a MYOB customer yet. Import/match the client from MYOB or link this client before creating the MYOB Order.";
    await updateQuoteMyobOrderSyncForTenant(tenantId, quoteId, { status: "error", error: message, payloadJson: { attemptedAt: new Date().toISOString(), stage: "customer", customerSource: customer.source } });
    throw new Error(message);
  }

  await updateQuoteMyobOrderSyncForTenant(tenantId, quoteId, {
    status: "syncing",
    error: null,
    payloadJson: { attemptedAt: new Date().toISOString(), stage: "push-start", customerSource: customer.source }
  });

  const { accessToken } = await getValidAccessToken(tenantId);
  const customerMaterialNames = await customerFacingMaterialNamesForTenant(tenantId).catch(() => new Map<string, string>());
  const payload = buildMyobServiceOrderPayload({ quote, lines, customerUid: customer.uid, customerMaterialNames });
  const endpoint = "/Sale/Order/Service";

  try {
    const result = await sendMyobJson(accessToken, connection.companyFileId, endpoint, "POST", payload);
    const uid = readMyobUid(result.data) ?? `pending-${quote.id}`;
    const number = readMyobNumber(result.data) ?? quote.quoteNumber ?? null;
    await updateQuoteMyobOrderSyncForTenant(tenantId, quoteId, {
      status: "synced",
      uid,
      orderNumber: number,
      error: null,
      payloadJson: {
        endpoint: result.url,
        pushedAt: new Date().toISOString(),
        response: result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : { raw: result.data },
        requestSummary: {
          quoteNumber: quote.quoteNumber,
          lineCount: lines.length,
          subtotal: lines.reduce((sum, line) => sum + numberValue(line.lineTotal), 0)
        }
      }
    });

    await upsertExternalMappingByTenantId(tenantId, {
      entityType: "order",
      localId: quoteId,
      externalId: uid,
      syncState: "synced",
      lastSyncedAt: new Date().toISOString(),
      payloadJson: { orderNumber: number, quoteNumber: quote.quoteNumber, endpoint: result.url }
    });

    await createSyncRunForTenant(tenantId, "push_invoices", "success", {
      source: "pushAcceptedQuoteToMyobOrderForTenant",
      quoteId,
      quoteNumber: quote.quoteNumber,
      myobOrderUid: uid,
      myobOrderNumber: number,
      endpoint: result.url
    }, null);

    return { ok: true, quoteId, myobOrderUid: uid, myobOrderNumber: number, endpoint: result.url, message: "Accepted quote sent to MYOB as an open order." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateQuoteMyobOrderSyncForTenant(tenantId, quoteId, {
      status: "error",
      error: message,
      payloadJson: { endpoint, failedAt: new Date().toISOString(), request: payload }
    });
    await createSyncRunForTenant(tenantId, "push_invoices", "error", {
      source: "pushAcceptedQuoteToMyobOrderForTenant",
      quoteId,
      quoteNumber: quote.quoteNumber,
      endpoint,
      request: payload
    }, message);
    throw new Error(`MYOB Order sync failed: ${message}`);
  }
}
