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
import { MYOB_PRICE_LEVELS, getCustomerById, normaliseMyobPriceLevel, updateCustomerPayloadForTenant, upsertImportedCustomer, type CustomerRecord, type MyobPriceLevel } from "@/server/customers";
import { upsertImportedProduct } from "@/server/products";
import { getSupplierById, updateSupplierMyobLink, upsertImportedSupplier, type SupplierRecord } from "@/server/suppliers";
import { getMaterialById, updateMaterialMyobLink, type MaterialRecord } from "@/server/materials";
import { getPurchasingDefaults, getPurchaseOrder, listPurchaseOrderLines, markPurchaseOrderMyobSynced } from "@/server/purchasing";

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

function normaliseExpiresAt(expiresIn?: number | string) {
  const seconds = Number(expiresIn ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function defaultSandboxCompanyFileAuthToken() {
  return Buffer.from("APIDeveloper:", "utf8").toString("base64");
}

async function companyFileAuthTokenForTenant(tenantId: string): Promise<string | null> {
  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection) return null;
  if (connection.companyFileAuthToken) return connection.companyFileAuthToken;
  return connection.environment === "sandbox" ? defaultSandboxCompanyFileAuthToken() : null;
}

async function refreshMyobAccessToken(refreshToken: string) {
  if (!env.MYOB_CLIENT_ID || !env.MYOB_CLIENT_SECRET) {
    throw new Error("MYOB OAuth environment variables are not fully configured for token refresh.");
  }

  const tokenUrl = new URL("https://secure.myob.com/oauth2/v1/authorize");
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

const myobRefreshInFlight = new Map<string, Promise<string>>();

async function refreshAccessTokenForTenant(tenantId: string, failedAccessToken?: string): Promise<string> {
  const current = await getMyobOauthTokenByTenantId(tenantId);
  if (!current) throw new Error("No stored MYOB OAuth token found for this tenant.");

  // Another request may already have refreshed the token after this request failed.
  if (failedAccessToken && current.accessToken !== failedAccessToken) return current.accessToken;

  const inFlight = myobRefreshInFlight.get(tenantId);
  if (inFlight) return inFlight;

  const refreshPromise = (async () => {
    const latest = await getMyobOauthTokenByTenantId(tenantId);
    if (!latest) throw new Error("No stored MYOB OAuth token found for this tenant.");
    if (failedAccessToken && latest.accessToken !== failedAccessToken) return latest.accessToken;

    const refreshed = await refreshMyobAccessToken(latest.refreshToken);
    await upsertMyobOauthTokenByTenantId(tenantId, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? latest.refreshToken,
      tokenType: refreshed.token_type ?? latest.tokenType,
      scope: refreshed.scope ?? latest.scope,
      expiresAt: normaliseExpiresAt(refreshed.expires_in)
    });
    return refreshed.access_token;
  })();

  myobRefreshInFlight.set(tenantId, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    if (myobRefreshInFlight.get(tenantId) === refreshPromise) myobRefreshInFlight.delete(tenantId);
  }
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

  const accessToken = await refreshAccessTokenForTenant(tenantId, token.accessToken);
  return { accessToken, refreshed: accessToken !== token.accessToken };
}

type MyobRequestMethod = "GET" | "POST" | "PUT";

const MYOB_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_MYOB_REDIRECTS = 4;

// AccountRight company files can live on MYOB shard hosts (for example arl2.api.myob.com).
// Native fetch follows cross-origin redirects but deliberately strips sensitive headers such
// as Authorization. Follow trusted MYOB API redirects ourselves so the raw Bearer token, API
// key and company-file token reach the actual company-file host.
function isTrustedMyobBusinessApiUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return url.protocol === "https:"
    && (hostname === "api.myob.com" || hostname.endsWith(".api.myob.com"))
    && (url.pathname === "/accountright" || url.pathname.startsWith("/accountright/"));
}

function assertRawMyobAccessToken(accessToken: string): string {
  if (!accessToken) throw new Error("MYOB access token is empty.");
  if (accessToken !== accessToken.trim()) {
    throw new Error("Stored MYOB access token contains unexpected leading or trailing whitespace. Reconnect MYOB to replace the altered token.");
  }
  if (/^Bearer\s+/i.test(accessToken)) {
    throw new Error("Stored MYOB access token incorrectly includes the Bearer prefix. Reconnect MYOB to replace the altered token.");
  }
  return accessToken;
}

async function fetchMyobWithTrustedRedirects(input: {
  initialUrl: URL;
  accessToken: string;
  companyFileAuthToken: string | null;
  method: MyobRequestMethod;
  body?: Record<string, unknown>;
}) {
  const accessToken = assertRawMyobAccessToken(input.accessToken);
  let currentUrl = new URL(input.initialUrl.toString());
  let redirectCount = 0;

  while (true) {
    if (!isTrustedMyobBusinessApiUrl(currentUrl)) {
      throw new Error(`Refusing to send MYOB credentials to an untrusted redirect target: ${currentUrl.origin}`);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "x-myobapi-key": env.MYOB_CLIENT_ID ?? "",
      "x-myobapi-version": "v2"
    };
    if (input.companyFileAuthToken) headers["x-myobapi-cftoken"] = input.companyFileAuthToken;
    if (input.method !== "GET") headers["Content-Type"] = "application/json";

    const response = await fetch(currentUrl.toString(), {
      method: input.method,
      headers,
      body: input.method === "GET" ? undefined : JSON.stringify(input.body ?? {}),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(20000)
    });

    if (!MYOB_REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: currentUrl, redirectCount };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`MYOB returned redirect status ${response.status} without a Location header.`);
    }
    if (redirectCount >= MAX_MYOB_REDIRECTS) {
      throw new Error(`MYOB API exceeded ${MAX_MYOB_REDIRECTS} trusted redirects.`);
    }

    const nextUrl = new URL(location, currentUrl);
    if (!isTrustedMyobBusinessApiUrl(nextUrl)) {
      throw new Error(`MYOB attempted to redirect an authenticated API request outside trusted MYOB API hosts: ${nextUrl.origin}`);
    }
    if (response.status === 303 && input.method !== "GET") {
      throw new Error("MYOB returned HTTP 303 for a write request; refusing to change the request method or replay the write as GET.");
    }

    currentUrl = nextUrl;
    redirectCount += 1;
  }
}

async function performMyobRequest(input: {
  tenantId: string;
  accessToken: string;
  companyFileId: string;
  endpoint: string;
  method: MyobRequestMethod;
  body?: Record<string, unknown>;
}) {
  const url = new URL(`${input.companyFileId}${input.endpoint}`, `${getBusinessApiBaseUrl().replace(/\/$/, "")}/`);
  const companyFileAuthToken = await companyFileAuthTokenForTenant(input.tenantId);

  const doFetch = async (accessToken: string) => fetchMyobWithTrustedRedirects({
    initialUrl: url,
    accessToken,
    companyFileAuthToken,
    method: input.method,
    body: input.body
  });

  let requestResult = await doFetch(input.accessToken);
  let response = requestResult.response;
  let retriedAfterRefresh = false;

  if (response.status === 401) {
    const refreshedAccessToken = await refreshAccessTokenForTenant(input.tenantId, input.accessToken);
    requestResult = await doFetch(refreshedAccessToken);
    response = requestResult.response;
    retriedAfterRefresh = true;
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parsed && typeof parsed === "object" ? JSON.stringify(parsed) : text || response.statusText;
    const authHint = response.status === 401
      ? ` MYOB rejected this request even after an automatic token refresh. Production Manager preserved the raw Bearer token and MYOB authentication headers across ${requestResult.redirectCount} trusted MYOB redirect(s). Check that the API key matches the OAuth token and that the token has the endpoint's SME scope. Endpoint: ${input.endpoint}. Final MYOB host: ${requestResult.finalUrl.host}.`
      : "";
    throw new Error(`${response.status}: ${detail}${authHint}`);
  }

  return {
    url: requestResult.finalUrl.toString(),
    data: parsed,
    location: response.headers.get("location"),
    retriedAfterRefresh,
    redirectCount: requestResult.redirectCount
  };
}

export async function fetchMyobJson(accessToken: string, companyFileId: string, endpoint: string, tenantId: string) {
  return performMyobRequest({ tenantId, accessToken, companyFileId, endpoint, method: "GET" });
}

// MYOB's /Info endpoint is global to the AccountRight API service:
//   https://api.myob.com/accountright/Info
// It is NOT a company-file resource and must not be prefixed with businessId/cf_uri.
// Keep this separate from performMyobRequest so company-file authentication is only sent
// to company-file scoped endpoints.
async function fetchMyobGlobalJson(accessToken: string, endpoint: string, tenantId: string) {
  const baseUrl = `${getBusinessApiBaseUrl().replace(/\/$/, "")}/`;
  const url = new URL(endpoint.replace(/^\//, ""), baseUrl);

  const doFetch = async (token: string) => fetchMyobWithTrustedRedirects({
    initialUrl: url,
    accessToken: token,
    companyFileAuthToken: null,
    method: "GET"
  });

  let requestResult = await doFetch(accessToken);
  let response = requestResult.response;
  let retriedAfterRefresh = false;

  if (response.status === 401) {
    const refreshedAccessToken = await refreshAccessTokenForTenant(tenantId, accessToken);
    requestResult = await doFetch(refreshedAccessToken);
    response = requestResult.response;
    retriedAfterRefresh = true;
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parsed && typeof parsed === "object" ? JSON.stringify(parsed) : text || response.statusText;
    const authHint = response.status === 401
      ? ` MYOB rejected the correctly-scoped global ${endpoint} request even after an automatic token refresh. No company-file GUID or x-myobapi-cftoken was added to this request. Check that MYOB_CLIENT_ID is the registered API Key for the same app that issued the OAuth token. Final MYOB host: ${requestResult.finalUrl.host}.`
      : "";
    throw new Error(`${response.status}: ${detail}${authHint}`);
  }

  return {
    url: requestResult.finalUrl.toString(),
    data: parsed,
    location: response.headers.get("location"),
    retriedAfterRefresh,
    redirectCount: requestResult.redirectCount
  };
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
    companyInfo: { ok: false, endpoint: "/Info" },
    customers: { ok: false, endpoint: "/Contact/Customer?$top=50", count: 0 },
    suppliers: { ok: false, endpoint: "/Contact/Supplier?$top=50", count: 0 },
    items: { ok: false, endpoint: "/Inventory/Item?$top=50", count: 0 }
  };

  try {
    const result = await fetchMyobGlobalJson(accessToken, "/Info", tenantId);
    const data = result.data as Record<string, unknown> | null;
    summary.companyInfo = {
      ok: true,
      endpoint: result.url,
      // /Info returns API build/resource information, not company identity. The company
      // name is already supplied by MYOB in the OAuth callback alongside businessId.
      displayName: connection.companyName,
      rawKeys: data ? Object.keys(data).slice(0, 10) : []
    };
  } catch (error) {
    summary.companyInfo = {
      ok: false,
      endpoint: "/Info",
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }

  for (const [key, endpoint] of [["customers", "/Contact/Customer?$top=50"], ["suppliers", "/Contact/Supplier?$top=50"], ["items", "/Inventory/Item?$top=50"]] as const) {
    try {
      const result = await fetchMyobJson(accessToken, connection.companyFileId, endpoint, tenantId);
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


export type MyobPriceLevelNames = Record<MyobPriceLevel, string>;

function defaultMyobPriceLevelNames(): MyobPriceLevelNames {
  return Object.fromEntries(MYOB_PRICE_LEVELS.map((level) => [level, level])) as MyobPriceLevelNames;
}

function priceLevelFromSellingDetails(customer: Record<string, unknown>): MyobPriceLevel | null {
  const selling = customer.SellingDetails;
  if (!selling || typeof selling !== "object" || Array.isArray(selling)) return null;
  return normaliseMyobPriceLevel((selling as Record<string, unknown>).ItemPriceLevel);
}

function parseMyobPriceLevelDetail(data: unknown): MyobPriceLevelNames {
  const names = defaultMyobPriceLevelNames();
  const records = myobCollectionRecords(data);
  for (const item of records) {
    const key = String(item.Name ?? "").trim();
    const value = String(item.Value ?? "").trim();
    const match = key.match(/^PriceLevel([A-F1-6])$/i);
    if (!match || !value) continue;
    const suffix = match[1].toUpperCase();
    const index = /^[1-6]$/.test(suffix) ? Number(suffix) - 1 : suffix.charCodeAt(0) - 65;
    const level = MYOB_PRICE_LEVELS[index];
    if (level) names[level] = value;
  }
  return names;
}

export async function fetchMyobPriceLevelNamesForTenant(tenantId: string): Promise<MyobPriceLevelNames> {
  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection?.companyFileId || connection.status !== "connected") return defaultMyobPriceLevelNames();
  try {
    const { accessToken } = await getValidAccessToken(tenantId);
    const result = await fetchMyobJson(accessToken, connection.companyFileId, "/Inventory/PriceLevelDetail", tenantId);
    return parseMyobPriceLevelDetail(result.data);
  } catch (error) {
    console.warn("Could not read MYOB custom price-level names; using Level A-F labels.", error);
    return defaultMyobPriceLevelNames();
  }
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
  const priceLevelNames = await fetchMyobJson(accessToken, companyFileId, "/Inventory/PriceLevelDetail", tenantId)
    .then((response) => parseMyobPriceLevelDetail(response.data))
    .catch(() => defaultMyobPriceLevelNames());
  const result = await fetchMyobJson(accessToken, companyFileId, "/Contact/Customer?$top=50", tenantId);
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
    const myobItemPriceLevel = priceLevelFromSellingDetails(customer);

    const saved = await upsertImportedCustomer(tenantId, {
      myobUid,
      displayName,
      companyName,
      firstName,
      lastName,
      email,
      phone,
      isActive,
      payloadJson: {
        ...customer,
        myobItemPriceLevel: myobItemPriceLevel ?? undefined,
        myobPriceLevelName: myobItemPriceLevel ? priceLevelNames[myobItemPriceLevel] : undefined,
        myobPriceLevelNames: priceLevelNames,
        myobPriceLevelSyncedAt: new Date().toISOString()
      }
    });

    await upsertExternalMappingByTenantId(tenantId, {
      entityType: "customer",
      localId: saved.id,
      externalId: myobUid,
      syncState: "synced",
      lastSyncedAt: new Date().toISOString(),
      payloadJson: {
        displayName,
        companyName,
        myobItemPriceLevel: myobItemPriceLevel ?? undefined,
        myobPriceLevelName: myobItemPriceLevel ? priceLevelNames[myobItemPriceLevel] : undefined
      }
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
  const [result, matrixResult, priceLevelResult] = await Promise.all([
    fetchMyobJson(accessToken, companyFileId, "/Inventory/Item?$top=50", tenantId),
    fetchMyobJson(accessToken, companyFileId, "/Inventory/ItemPriceMatrix?$top=50", tenantId).catch(() => ({ data: null })),
    fetchMyobJson(accessToken, companyFileId, "/Inventory/PriceLevelDetail", tenantId).catch(() => ({ data: null }))
  ]);
  const payload = result.data as Record<string, unknown> | null;
  const items = Array.isArray(payload?.Items) ? payload.Items : Array.isArray(result.data) ? (result.data as unknown[]) : [];
  const priceLevelNames = parseMyobPriceLevelDetail(priceLevelResult.data);
  const priceMatrixByUid = new Map<string, Record<string, unknown>>();
  for (const matrix of myobCollectionRecords(matrixResult.data)) {
    const uid = textOrNull(matrix.UID) ?? (matrix.Item && typeof matrix.Item === "object" ? textOrNull((matrix.Item as Record<string, unknown>).UID) : null);
    if (uid) priceMatrixByUid.set(uid, matrix);
  }
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
      payloadJson: {
        ...item,
        myobPriceMatrix: priceMatrixByUid.get(myobUid) ?? undefined,
        myobPriceLevelNames: priceLevelNames,
        myobPriceMatrixSyncedAt: new Date().toISOString()
      }
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

async function sendMyobJson(accessToken: string, companyFileId: string, endpoint: string, method: "POST" | "PUT", body: Record<string, unknown>, tenantId: string) {
  return performMyobRequest({ tenantId, accessToken, companyFileId, endpoint, method, body });
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
  const itemPriceLevel = normaliseMyobPriceLevel(customer.payloadJson?.myobItemPriceLevel) ?? "Level A";
  payload.SellingDetails = { ItemPriceLevel: itemPriceLevel };
  return payload;
}

async function exactMyobCustomerMatches(
  tenantId: string,
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
  const results = await Promise.all(endpoints.map((endpoint) => fetchMyobJson(accessToken, companyFileId, endpoint, tenantId)));
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
  const myobItemPriceLevel = priceLevelFromSellingDetails(myobCustomer);
  const priceLevelNames = await fetchMyobPriceLevelNamesForTenant(tenantId);
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
      myobItemPriceLevel: myobItemPriceLevel ?? normaliseMyobPriceLevel(customer.payloadJson?.myobItemPriceLevel) ?? "Level A",
      myobPriceLevelName: priceLevelNames[myobItemPriceLevel ?? normaliseMyobPriceLevel(customer.payloadJson?.myobItemPriceLevel) ?? "Level A"],
      myobPriceLevelNames: priceLevelNames,
      myobLinkedAt: new Date().toISOString()
    })
  ]);

  await upsertExternalMappingByTenantId(tenantId, {
    entityType: "customer",
    localId: customer.id,
    externalId: uid,
    syncState: "synced",
    lastSyncedAt: new Date().toISOString(),
    payloadJson: {
      displayName,
      displayId,
      match,
      myobItemPriceLevel: myobItemPriceLevel ?? normaliseMyobPriceLevel(customer.payloadJson?.myobItemPriceLevel) ?? "Level A",
      myobPriceLevelName: priceLevelNames[myobItemPriceLevel ?? normaliseMyobPriceLevel(customer.payloadJson?.myobItemPriceLevel) ?? "Level A"]
    }
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
  const matches = await exactMyobCustomerMatches(tenantId, accessToken, connection.companyFileId, customer);
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
  const result = await sendMyobJson(accessToken, connection.companyFileId, endpoint, "POST", payload, tenantId);
  let created = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? result.data as Record<string, unknown>
    : null;
  let uid = readMyobUid(created) ?? readUidFromLocation(result.location);

  if (!uid) {
    const displayId = String(payload.DisplayID ?? "").trim();
    const lookup = await fetchMyobJson(accessToken, connection.companyFileId, `/Contact/Customer?$filter=DisplayID eq '${odataString(displayId)}'&$top=5`, tenantId);
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
    SellingDetails: created?.SellingDetails ?? payload.SellingDetails,
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

function stripMyobReadOnlyFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMyobReadOnlyFields);
  if (!value || typeof value !== "object") return value;
  const blocked = new Set(["URI", "PhotoURI", "LastModified", "CurrentBalance", "Available", "PastDue"]);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (blocked.has(key)) continue;
    out[key] = stripMyobReadOnlyFields(child);
  }
  return out;
}

export async function updateMyobCustomerPriceLevelForTenant(
  tenantId: string,
  customerId: string,
  requestedLevel: MyobPriceLevel
): Promise<{ level: MyobPriceLevel; name: string }> {
  const customer = await getCustomerById(tenantId, customerId);
  if (!customer) throw new Error("Production Manager client could not be found.");
  const uid = customer.myobUid && !customer.myobUid.startsWith("manual-")
    ? customer.myobUid
    : typeof customer.payloadJson?.myobUid === "string" && !customer.payloadJson.myobUid.startsWith("manual-")
      ? customer.payloadJson.myobUid
      : null;
  if (!uid) {
    const names = await fetchMyobPriceLevelNamesForTenant(tenantId);
    await updateCustomerPayloadForTenant(tenantId, customerId, {
      myobItemPriceLevel: requestedLevel,
      myobPriceLevelName: names[requestedLevel],
      myobPriceLevelNames: names
    });
    return { level: requestedLevel, name: names[requestedLevel] };
  }

  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection?.companyFileId || connection.status !== "connected") {
    throw new Error("MYOB is not connected, so the customer price level could not be updated in MYOB.");
  }
  const { accessToken } = await getValidAccessToken(tenantId);
  const currentResponse = await fetchMyobJson(accessToken, connection.companyFileId, `/Contact/Customer/${uid}`, tenantId);
  if (!currentResponse.data || typeof currentResponse.data !== "object" || Array.isArray(currentResponse.data)) {
    throw new Error("MYOB did not return the customer record needed to update its price level.");
  }
  const current = currentResponse.data as Record<string, unknown>;
  const currentSelling = current.SellingDetails && typeof current.SellingDetails === "object" && !Array.isArray(current.SellingDetails)
    ? current.SellingDetails as Record<string, unknown>
    : {};
  const updatePayload = stripMyobReadOnlyFields({
    ...current,
    UID: uid,
    SellingDetails: { ...currentSelling, ItemPriceLevel: requestedLevel }
  }) as Record<string, unknown>;

  await sendMyobJson(accessToken, connection.companyFileId, `/Contact/Customer/${uid}`, "PUT", updatePayload, tenantId);
  const names = await fetchMyobPriceLevelNamesForTenant(tenantId);
  await updateCustomerPayloadForTenant(tenantId, customerId, {
    myobItemPriceLevel: requestedLevel,
    myobPriceLevelName: names[requestedLevel],
    myobPriceLevelNames: names,
    myobPriceLevelSyncedAt: new Date().toISOString()
  });
  return { level: requestedLevel, name: names[requestedLevel] };
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
    const result = await sendMyobJson(accessToken, connection.companyFileId, endpoint, "POST", payload, tenantId);
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

// -----------------------------------------------------------------------------
// Production Manager -> MYOB master-data sync and purchasing
// -----------------------------------------------------------------------------

function addressRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function supplierDisplayName(record: Record<string, unknown>): string {
  const company = textOrNull(record.CompanyName);
  if (company) return company;
  return [textOrNull(record.FirstName), textOrNull(record.LastName)].filter(Boolean).join(" ") || textOrNull(record.DisplayID) || "MYOB supplier";
}

function generatedMyobSupplierDisplayId(supplierId: string): string {
  const compact = supplierId.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `PMS${compact.slice(0, 11)}`.slice(0, 15);
}

function supplierExactEmail(record: Record<string, unknown>, email: string): boolean {
  const wanted = email.trim().toLowerCase();
  return Boolean(wanted && addressRecords(record.Addresses).some((address) => String(address.Email ?? "").trim().toLowerCase() === wanted));
}

function supplierExactCompany(record: Record<string, unknown>, name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return Boolean(wanted && String(record.CompanyName ?? "").trim().toLowerCase() === wanted);
}

function buildMyobSupplierPayload(supplier: SupplierRecord): Record<string, unknown> {
  const contact = String(supplier.contactName ?? "").trim();
  const email = String(supplier.email ?? "").trim();
  const phone = String(supplier.phone ?? "").trim();
  const address: Record<string, unknown> = { Location: 1 };
  if (email) address.Email = email.slice(0, 255);
  if (phone) address.Phone1 = phone.slice(0, 21);
  if (contact) address.ContactName = contact.slice(0, 25);
  return {
    DisplayID: generatedMyobSupplierDisplayId(supplier.id),
    CompanyName: supplier.displayName.slice(0, 50),
    IsIndividual: false,
    IsActive: supplier.isActive !== false,
    Addresses: Object.keys(address).length > 1 ? [address] : undefined,
    Notes: String(supplier.notes ?? "Created by Production Manager").slice(0, 255)
  };
}

async function exactMyobSupplierMatches(tenantId: string, accessToken: string, companyFileId: string, supplier: SupplierRecord): Promise<Record<string, unknown>[]> {
  const endpoints: string[] = [];
  const email = String(supplier.email ?? "").trim();
  const company = supplier.displayName.trim();
  if (email) endpoints.push(`/Contact/Supplier?$filter=Addresses/any(x: x/Email eq '${odataString(email)}')&$top=20`);
  if (company) endpoints.push(`/Contact/Supplier?$filter=CompanyName eq '${odataString(company)}'&$top=20`);
  const byUid = new Map<string, Record<string, unknown>>();
  const results = await Promise.all(endpoints.map((endpoint) => fetchMyobJson(accessToken, companyFileId, endpoint, tenantId).catch(() => ({ data: null }))));
  for (const result of results) {
    for (const candidate of myobCollectionRecords(result.data)) {
      const uid = textOrNull(candidate.UID);
      if (!uid) continue;
      if (supplierExactEmail(candidate, email) || supplierExactCompany(candidate, company)) byUid.set(uid, candidate);
    }
  }
  return [...byUid.values()];
}

async function saveLocalSupplierMyobLink(tenantId: string, supplier: SupplierRecord, myobSupplier: Record<string, unknown>, match: string): Promise<void> {
  const uid = textOrNull(myobSupplier.UID);
  if (!uid) throw new Error("MYOB supplier response did not include a UID.");
  await updateSupplierMyobLink(tenantId, supplier.id, {
    myobUid: uid,
    payloadJson: {
      ...myobSupplier,
      myobUid: uid,
      myobDisplayId: textOrNull(myobSupplier.DisplayID),
      myobMatch: match,
      myobSyncedAt: new Date().toISOString()
    }
  });
  await upsertExternalMappingByTenantId(tenantId, {
    entityType: "supplier",
    localId: supplier.id,
    externalId: uid,
    syncState: "synced",
    lastSyncedAt: new Date().toISOString(),
    payloadJson: { displayName: supplierDisplayName(myobSupplier), displayId: textOrNull(myobSupplier.DisplayID), match }
  });
}

export type MyobSupplierImportSummary = {
  importedCount: number;
  mappedCount: number;
  sample: Array<{ myobUid: string; displayName: string; localId: string }>;
};

export async function importMyobSuppliersAndCreateMappings(tenantId: string): Promise<MyobSupplierImportSummary> {
  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection?.companyFileId) throw new Error("No MYOB company file is linked to this tenant yet.");
  const { accessToken } = await getValidAccessToken(tenantId);
  const response = await fetchMyobJson(accessToken, connection.companyFileId, "/Contact/Supplier?$top=1000", tenantId);
  const imported: MyobSupplierImportSummary["sample"] = [];
  for (const supplier of myobCollectionRecords(response.data)) {
    const uid = textOrNull(supplier.UID);
    if (!uid) continue;
    const firstAddress = addressRecords(supplier.Addresses)[0] ?? {};
    const saved = await upsertImportedSupplier(tenantId, {
      myobUid: uid,
      displayName: supplierDisplayName(supplier),
      contactName: textOrNull(firstAddress.ContactName),
      email: textOrNull(firstAddress.Email),
      phone: textOrNull(firstAddress.Phone1),
      isActive: supplier.IsActive !== false,
      notes: textOrNull(supplier.Notes),
      payloadJson: { ...supplier, myobSyncedAt: new Date().toISOString() }
    });
    await upsertExternalMappingByTenantId(tenantId, {
      entityType: "supplier", localId: saved.id, externalId: uid, syncState: "synced", lastSyncedAt: new Date().toISOString(),
      payloadJson: { displayName: supplierDisplayName(supplier), displayId: textOrNull(supplier.DisplayID) }
    });
    imported.push({ myobUid: uid, displayName: supplierDisplayName(supplier), localId: saved.id });
  }
  await markMyobConnectionHealthy(tenantId, { environment: connection.environment, companyFileId: connection.companyFileId, companyName: connection.companyName, connectedAt: connection.connectedAt, lastSuccessfulSyncAt: new Date().toISOString() });
  return { importedCount: imported.length, mappedCount: imported.length, sample: imported.slice(0, 5) };
}

export async function syncLocalSupplierToMyobForTenant(tenantId: string, supplierId: string): Promise<{ uid: string; created: boolean; matchedExisting: boolean }> {
  const supplier = await getSupplierById(tenantId, supplierId);
  if (!supplier) throw new Error("Production Manager supplier could not be found.");
  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection?.companyFileId || connection.status !== "connected") throw new Error("MYOB is not connected.");
  const { accessToken } = await getValidAccessToken(tenantId);
  const linkedUid = supplier.myobUid && !supplier.myobUid.startsWith("manual-") ? supplier.myobUid : null;
  if (!linkedUid) {
    const matches = await exactMyobSupplierMatches(tenantId, accessToken, connection.companyFileId, supplier);
    if (matches.length > 1) throw new Error("More than one matching MYOB supplier was found. Link the correct supplier before syncing.");
    if (matches.length === 1) {
      await saveLocalSupplierMyobLink(tenantId, supplier, matches[0], "exact_match");
      return { uid: String(matches[0].UID), created: false, matchedExisting: true };
    }
    const payload = buildMyobSupplierPayload(supplier);
    const result = await sendMyobJson(accessToken, connection.companyFileId, "/Contact/Supplier", "POST", payload, tenantId);
    const created = result.data && typeof result.data === "object" && !Array.isArray(result.data) ? result.data as Record<string, unknown> : {};
    let uid = readMyobUid(created) ?? readUidFromLocation(result.location);
    if (!uid) {
      const displayId = String(payload.DisplayID ?? "");
      const lookup = await fetchMyobJson(accessToken, connection.companyFileId, `/Contact/Supplier?$filter=DisplayID eq '${odataString(displayId)}'&$top=5`, tenantId);
      const found = myobCollectionRecords(lookup.data).find((row) => String(row.DisplayID ?? "") === displayId);
      uid = readMyobUid(found);
      if (found) Object.assign(created, found);
    }
    if (!uid) throw new Error("MYOB accepted the supplier but did not return its UID.");
    created.UID = uid;
    created.DisplayID = textOrNull(created.DisplayID) ?? payload.DisplayID;
    created.CompanyName = textOrNull(created.CompanyName) ?? payload.CompanyName;
    await saveLocalSupplierMyobLink(tenantId, supplier, created, "created_from_production_manager");
    return { uid, created: true, matchedExisting: false };
  }

  const currentResponse = await fetchMyobJson(accessToken, connection.companyFileId, `/Contact/Supplier/${linkedUid}`, tenantId);
  if (!currentResponse.data || typeof currentResponse.data !== "object" || Array.isArray(currentResponse.data)) throw new Error("MYOB did not return the linked supplier.");
  const current = currentResponse.data as Record<string, unknown>;
  const local = buildMyobSupplierPayload(supplier);
  const currentAddresses = addressRecords(current.Addresses);
  const localAddress = addressRecords(local.Addresses)[0];
  const mergedAddresses = localAddress ? [{ ...(currentAddresses[0] ?? { Location: 1 }), ...localAddress }, ...currentAddresses.slice(1)] : currentAddresses;
  const updatePayload = stripMyobReadOnlyFields({
    ...current,
    UID: linkedUid,
    CompanyName: local.CompanyName,
    IsIndividual: false,
    IsActive: current.IsActive !== false,
    Notes: local.Notes,
    Addresses: mergedAddresses
  }) as Record<string, unknown>;
  await sendMyobJson(accessToken, connection.companyFileId, `/Contact/Supplier/${linkedUid}`, "PUT", updatePayload, tenantId);
  await saveLocalSupplierMyobLink(tenantId, supplier, { ...current, ...updatePayload, UID: linkedUid }, "updated_from_production_manager");
  return { uid: linkedUid, created: false, matchedExisting: false };
}

export async function syncLocalCustomerToMyobForTenant(tenantId: string, customerId: string): Promise<MyobCustomerCreateResult> {
  const customer = await getCustomerById(tenantId, customerId);
  if (!customer) throw new Error("Production Manager client could not be found.");
  const linkedUid = customer.myobUid && !customer.myobUid.startsWith("manual-")
    ? customer.myobUid
    : typeof customer.payloadJson?.myobUid === "string" && !customer.payloadJson.myobUid.startsWith("manual-") ? customer.payloadJson.myobUid : null;
  if (!linkedUid) return createMyobCustomerFromLocalClientForTenant(tenantId, customerId);
  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection?.companyFileId || connection.status !== "connected") throw new Error("MYOB is not connected.");
  const { accessToken } = await getValidAccessToken(tenantId);
  const currentResponse = await fetchMyobJson(accessToken, connection.companyFileId, `/Contact/Customer/${linkedUid}`, tenantId);
  if (!currentResponse.data || typeof currentResponse.data !== "object" || Array.isArray(currentResponse.data)) throw new Error("MYOB did not return the linked customer.");
  const current = currentResponse.data as Record<string, unknown>;
  const local = buildMyobCustomerPayload(customer);
  const currentAddresses = addressRecords(current.Addresses);
  const localAddress = addressRecords(local.Addresses)[0];
  const mergedAddresses = localAddress ? [{ ...(currentAddresses[0] ?? { Location: 1 }), ...localAddress }, ...currentAddresses.slice(1)] : currentAddresses;
  const currentSelling = current.SellingDetails && typeof current.SellingDetails === "object" && !Array.isArray(current.SellingDetails) ? current.SellingDetails as Record<string, unknown> : {};
  const localSelling = local.SellingDetails && typeof local.SellingDetails === "object" && !Array.isArray(local.SellingDetails) ? local.SellingDetails as Record<string, unknown> : {};
  const updatePayload = stripMyobReadOnlyFields({
    ...current, UID: linkedUid, IsIndividual: local.IsIndividual, IsActive: current.IsActive !== false,
    CompanyName: local.CompanyName, FirstName: local.FirstName, LastName: local.LastName,
    Addresses: mergedAddresses, SellingDetails: { ...currentSelling, ...localSelling }
  }) as Record<string, unknown>;
  await sendMyobJson(accessToken, connection.companyFileId, `/Contact/Customer/${linkedUid}`, "PUT", updatePayload, tenantId);
  await saveLocalCustomerMyobLink(tenantId, customer, { ...current, ...updatePayload, UID: linkedUid }, "updated_from_production_manager");
  return { uid: linkedUid, displayName: normaliseCustomerDisplayName({ ...current, ...updatePayload }), displayId: textOrNull(current.DisplayID), created: false, matchedExisting: false };
}

export type MyobPurchasingReferenceData = {
  accounts: Array<{ uid: string; name: string; displayId: string; classification: string }>;
  taxCodes: Array<{ uid: string; code: string; description: string }>;
};

export async function fetchMyobPurchasingReferenceDataForTenant(tenantId: string): Promise<MyobPurchasingReferenceData> {
  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection?.companyFileId || connection.status !== "connected") return { accounts: [], taxCodes: [] };
  const { accessToken } = await getValidAccessToken(tenantId);
  const [accountsResponse, taxResponse] = await Promise.all([
    fetchMyobJson(accessToken, connection.companyFileId, "/GeneralLedger/Account?$top=1000", tenantId),
    fetchMyobJson(accessToken, connection.companyFileId, "/GeneralLedger/TaxCode?$top=1000", tenantId)
  ]);
  const accounts = myobCollectionRecords(accountsResponse.data)
    .filter((row) => row.IsActive !== false && ["Expense", "CostOfSales"].includes(String(row.Classification ?? "")))
    .map((row) => ({ uid: String(row.UID), name: String(row.Name ?? ""), displayId: String(row.DisplayID ?? ""), classification: String(row.Classification ?? "") }))
    .filter((row) => row.uid);
  const taxCodes = myobCollectionRecords(taxResponse.data)
    .filter((row) => row.IsActive !== false)
    .map((row) => ({ uid: String(row.UID), code: String(row.Code ?? ""), description: String(row.Description ?? row.Name ?? "") }))
    .filter((row) => row.uid && row.code);
  return { accounts, taxCodes };
}

function generatedMyobMaterialNumber(material: MaterialRecord): string {
  const sku = String(material.sku ?? "").trim();
  if (sku) return sku.slice(0, 30);
  return `PMM${material.id.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 20)}`.slice(0, 30);
}

function objectChild(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const child = (value as Record<string, unknown>)[key];
  return child && typeof child === "object" && !Array.isArray(child) ? child as Record<string, unknown> : {};
}

async function materialPurchaseReferences(tenantId: string, material: MaterialRecord): Promise<{ expenseUid: string; expenseName?: string; expenseDisplayId?: string; taxUid: string; taxCode: string; supplierUid?: string }> {
  const defaults = await getPurchasingDefaults(tenantId);
  const supplier = material.supplierId ? await getSupplierById(tenantId, material.supplierId) : null;
  let supplierUid = supplier?.myobUid && !supplier.myobUid.startsWith("manual-") ? supplier.myobUid : undefined;
  if (supplier && !supplierUid) {
    try { supplierUid = (await syncLocalSupplierToMyobForTenant(tenantId, supplier.id)).uid; } catch { /* surfaced via account fallback below if needed */ }
  }
  const buyingDetails = objectChild(supplier?.payloadJson, "BuyingDetails");
  const supplierExpense = objectChild(buyingDetails, "ExpenseAccount");
  let expenseUid = textOrNull(supplierExpense.UID) ?? defaults.expenseAccountUid;
  let expenseName = textOrNull(supplierExpense.Name) ?? defaults.expenseAccountName ?? undefined;
  let expenseDisplayId = textOrNull(supplierExpense.DisplayID) ?? defaults.expenseAccountDisplayId ?? undefined;
  let taxUid = defaults.taxCodeUid;
  let taxCode = defaults.taxCode;
  if (!expenseUid || !taxUid) {
    const refs = await fetchMyobPurchasingReferenceDataForTenant(tenantId);
    if (!expenseUid && refs.accounts.length === 1) {
      expenseUid = refs.accounts[0].uid; expenseName = refs.accounts[0].name; expenseDisplayId = refs.accounts[0].displayId;
    }
    if (!taxUid) {
      const gst = refs.taxCodes.find((row) => row.code.toUpperCase() === "GST") ?? (refs.taxCodes.length === 1 ? refs.taxCodes[0] : undefined);
      if (gst) { taxUid = gst.uid; taxCode = gst.code; }
    }
  }
  if (!expenseUid) throw new Error("No MYOB purchase expense/Cost of Sales account is configured. Open Purchasing and choose the MYOB purchasing defaults first.");
  if (!taxUid) throw new Error("No MYOB purchase tax code is configured. Open Purchasing and choose the MYOB purchasing defaults first.");
  return { expenseUid, expenseName, expenseDisplayId, taxUid, taxCode: taxCode || "GST", supplierUid };
}

function buildMyobMaterialPayload(material: MaterialRecord, refs: Awaited<ReturnType<typeof materialPurchaseReferences>>, rowVersion?: unknown): Record<string, unknown> {
  const number = generatedMyobMaterialNumber(material);
  const fullName = material.name.trim() || number;
  const restocking: Record<string, unknown> = {};
  if (refs.supplierUid) restocking.Supplier = { UID: refs.supplierUid };
  const payload: Record<string, unknown> = {
    Number: number,
    Name: fullName.slice(0, 30),
    Description: fullName.slice(0, 255),
    UseDescription: fullName.length > 30,
    IsActive: true,
    IsBought: true,
    IsSold: false,
    IsInventoried: false,
    ExpenseAccount: { UID: refs.expenseUid },
    BuyingDetails: {
      StandardCost: numberValue(material.purchaseCost),
      BuyingUnitOfMeasure: String(material.purchaseUom || material.stockUom || "each").slice(0, 20),
      TaxCode: { UID: refs.taxUid },
      ...(Object.keys(restocking).length ? { RestockingInformation: restocking } : {})
    },
    StandardCostTaxInclusive: false
  };
  if (rowVersion) payload.RowVersion = rowVersion;
  return payload;
}

async function exactMyobItemMatches(tenantId: string, accessToken: string, companyFileId: string, material: MaterialRecord): Promise<Record<string, unknown>[]> {
  const number = generatedMyobMaterialNumber(material);
  const response = await fetchMyobJson(accessToken, companyFileId, `/Inventory/Item?$filter=Number eq '${odataString(number)}'&$top=20`, tenantId);
  return myobCollectionRecords(response.data).filter((row) => String(row.Number ?? "").trim().toLowerCase() === number.toLowerCase());
}

async function saveMaterialLink(tenantId: string, material: MaterialRecord, item: Record<string, unknown>, refs: Awaited<ReturnType<typeof materialPurchaseReferences>>, match: string): Promise<void> {
  const uid = textOrNull(item.UID);
  if (!uid) throw new Error("MYOB material item response did not include a UID.");
  const payload = { ...item, myobMatch: match, myobSyncedAt: new Date().toISOString(), purchaseTaxCodeUid: refs.taxUid, purchaseTaxCode: refs.taxCode, expenseAccountUid: refs.expenseUid };
  await updateMaterialMyobLink(tenantId, material.id, { myobUid: uid, myobDisplayId: textOrNull(item.Number), myobSyncState: "synced", myobPayloadJson: payload });
  await upsertExternalMappingByTenantId(tenantId, { entityType: "material", localId: material.id, externalId: uid, syncState: "synced", lastSyncedAt: new Date().toISOString(), payloadJson: { number: textOrNull(item.Number), name: textOrNull(item.Name), match } });
}

export async function syncLocalMaterialToMyobForTenant(tenantId: string, materialId: string): Promise<{ uid: string; number: string; created: boolean; matchedExisting: boolean }> {
  const material = await getMaterialById(tenantId, materialId);
  if (!material) throw new Error("Production Manager material could not be found.");
  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection?.companyFileId || connection.status !== "connected") throw new Error("MYOB is not connected.");
  const { accessToken } = await getValidAccessToken(tenantId);
  const refs = await materialPurchaseReferences(tenantId, material);
  let linkedUid = material.myobUid;
  if (!linkedUid) {
    const matches = await exactMyobItemMatches(tenantId, accessToken, connection.companyFileId, material);
    if (matches.length > 1) throw new Error(`More than one MYOB item uses material number ${generatedMyobMaterialNumber(material)}.`);
    if (matches.length === 1) {
      await saveMaterialLink(tenantId, material, matches[0], refs, "number_exact_match");
      return { uid: String(matches[0].UID), number: String(matches[0].Number ?? generatedMyobMaterialNumber(material)), created: false, matchedExisting: true };
    }
    const payload = buildMyobMaterialPayload(material, refs);
    const result = await sendMyobJson(accessToken, connection.companyFileId, "/Inventory/Item", "POST", payload, tenantId);
    const created = result.data && typeof result.data === "object" && !Array.isArray(result.data) ? result.data as Record<string, unknown> : {};
    linkedUid = readMyobUid(created) ?? readUidFromLocation(result.location);
    if (!linkedUid) {
      const matchesAfter = await exactMyobItemMatches(tenantId, accessToken, connection.companyFileId, material);
      linkedUid = readMyobUid(matchesAfter[0]);
      if (matchesAfter[0]) Object.assign(created, matchesAfter[0]);
    }
    if (!linkedUid) throw new Error("MYOB accepted the material item but did not return its UID.");
    created.UID = linkedUid;
    created.Number = textOrNull(created.Number) ?? generatedMyobMaterialNumber(material);
    created.Name = textOrNull(created.Name) ?? material.name.slice(0, 30);
    created.BuyingDetails = created.BuyingDetails ?? payload.BuyingDetails;
    await saveMaterialLink(tenantId, material, created, refs, "created_from_production_manager");
    return { uid: linkedUid, number: String(created.Number), created: true, matchedExisting: false };
  }
  const currentResponse = await fetchMyobJson(accessToken, connection.companyFileId, `/Inventory/Item/${linkedUid}`, tenantId);
  if (!currentResponse.data || typeof currentResponse.data !== "object" || Array.isArray(currentResponse.data)) throw new Error("MYOB did not return the linked material item.");
  const current = currentResponse.data as Record<string, unknown>;
  const payload = buildMyobMaterialPayload(material, refs, current.RowVersion);
  payload.UID = linkedUid;
  payload.IsActive = current.IsActive !== false;
  await sendMyobJson(accessToken, connection.companyFileId, `/Inventory/Item/${linkedUid}`, "PUT", payload, tenantId);
  await saveMaterialLink(tenantId, material, { ...current, ...payload, UID: linkedUid }, refs, "updated_from_production_manager");
  return { uid: linkedUid, number: String(payload.Number), created: false, matchedExisting: false };
}

export async function pushPurchaseOrderToMyobForTenant(tenantId: string, purchaseOrderId: string): Promise<{ uid: string; number: string | null }> {
  const order = await getPurchaseOrder(tenantId, purchaseOrderId);
  if (!order) throw new Error("Purchase order could not be found.");
  if (order.myobUid) return { uid: order.myobUid, number: order.myobNumber };
  const supplierSync = await syncLocalSupplierToMyobForTenant(tenantId, order.supplierId);
  const connection = await getMyobConnectionByTenantId(tenantId);
  if (!connection?.companyFileId || connection.status !== "connected") throw new Error("MYOB is not connected.");
  const { accessToken } = await getValidAccessToken(tenantId);
  let lines = await listPurchaseOrderLines(tenantId, purchaseOrderId);
  if (!lines.length) throw new Error("Add at least one material before sending the PO to MYOB.");
  for (const line of lines) {
    if (!line.materialMyobUid) await syncLocalMaterialToMyobForTenant(tenantId, line.materialId);
  }
  lines = await listPurchaseOrderLines(tenantId, purchaseOrderId);
  const defaults = await getPurchasingDefaults(tenantId);
  const myobLines = lines.map((line) => {
    if (!line.materialMyobUid) throw new Error(`${line.materialName} is not linked to a MYOB inventory item.`);
    const buyingDetails = objectChild(line.materialMyobPayloadJson, "BuyingDetails");
    const taxCode = objectChild(buyingDetails, "TaxCode");
    const taxUid = textOrNull(taxCode.UID) ?? textOrNull(line.materialMyobPayloadJson.purchaseTaxCodeUid) ?? defaults.taxCodeUid;
    if (!taxUid) throw new Error(`${line.materialName} has no MYOB purchase tax code.`);
    const qty = numberValue(line.quantity);
    const unitCost = numberValue(line.unitCost);
    return { Type: "Transaction", Description: (line.description || line.materialName).slice(0, 1000), BillQuantity: qty, ReceivedQuantity: 0, UnitPrice: unitCost, DiscountPercent: 0, Total: Number((qty * unitCost).toFixed(2)), Item: { UID: line.materialMyobUid }, TaxCode: { UID: taxUid } };
  });
  const payload: Record<string, unknown> = {
    Number: order.poNumber.slice(0, 13),
    Date: `${order.orderDate} 00:00:00`,
    Supplier: { UID: supplierSync.uid },
    IsTaxInclusive: order.isTaxInclusive,
    Lines: myobLines,
    IsReportable: false,
    Comment: String(order.notes ?? "").slice(0, 2000),
    JournalMemo: `Purchase Order ${order.poNumber}`.slice(0, 255),
    OrderDeliveryStatus: "Nothing"
  };
  if (order.shipToAddress) payload.ShipToAddress = order.shipToAddress.slice(0, 255);
  if (order.promisedDate) payload.PromisedDate = `${order.promisedDate} 00:00:00`;
  const result = await sendMyobJson(accessToken, connection.companyFileId, "/Purchase/Order/Item", "POST", payload, tenantId);
  let created = result.data && typeof result.data === "object" && !Array.isArray(result.data) ? result.data as Record<string, unknown> : {};
  let uid = readMyobUid(created) ?? readUidFromLocation(result.location);
  if (!uid) {
    const lookup = await fetchMyobJson(accessToken, connection.companyFileId, `/Purchase/Order/Item?$filter=Number eq '${odataString(order.poNumber.slice(0,13))}'&$top=10`, tenantId);
    const found = myobCollectionRecords(lookup.data).find((row) => String(row.Number ?? "") === order.poNumber.slice(0,13));
    uid = readMyobUid(found); if (found) created = found;
  }
  if (!uid) throw new Error("MYOB accepted the purchase order but did not return its UID.");
  const number = textOrNull(created.Number) ?? order.poNumber.slice(0,13);
  await markPurchaseOrderMyobSynced(tenantId, purchaseOrderId, { myobUid: uid, myobNumber: number });
  await upsertExternalMappingByTenantId(tenantId, { entityType: "purchase_order", localId: purchaseOrderId, externalId: uid, syncState: "synced", lastSyncedAt: new Date().toISOString(), payloadJson: { number, supplierUid: supplierSync.uid } });
  return { uid, number };
}
