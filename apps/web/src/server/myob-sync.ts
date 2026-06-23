import "server-only";

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
import { upsertImportedCustomer } from "@/server/customers";
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
    cache: "no-store"
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
    cache: "no-store"
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
    cache: "no-store"
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

function buildOrderLineDescription(line: import("@/server/quotes").QuoteLineRecord): string {
  return [line.productName, line.optionSummary, line.notes].filter(Boolean).join("\n").slice(0, 1000);
}

async function resolveMyobCustomerUid(tenantId: string, quote: import("@/server/quotes").QuoteDraftRecord): Promise<{ uid: string | null; source: string; customerPayload?: Record<string, unknown> }> {
  if (!quote.linkedCustomerId) {
    return { uid: null, source: "quote-not-linked-to-client" };
  }

  const { getCustomerById } = await import("@/server/customers");
  const customer = await getCustomerById(tenantId, quote.linkedCustomerId);
  if (!customer) return { uid: null, source: "linked-client-not-found" };

  if (customer.myobUid && !customer.myobUid.startsWith("manual-")) {
    return { uid: customer.myobUid, source: "linked-client-myob-uid", customerPayload: customer.payloadJson };
  }

  const mappedUid = typeof customer.payloadJson?.myobUid === "string" ? customer.payloadJson.myobUid : null;
  if (mappedUid && !mappedUid.startsWith("manual-")) {
    return { uid: mappedUid, source: "linked-client-payload-myob-uid", customerPayload: customer.payloadJson };
  }

  return { uid: null, source: "client-is-manual-not-linked-to-myob", customerPayload: customer.payloadJson };
}

function buildMyobServiceOrderPayload(input: {
  quote: import("@/server/quotes").QuoteDraftRecord;
  lines: import("@/server/quotes").QuoteLineRecord[];
  customerUid: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const subtotal = input.lines.reduce((sum, line) => sum + numberValue(line.lineTotal), 0);
  const lines = input.lines.map((line) => ({
    Type: "Transaction",
    Description: buildOrderLineDescription(line),
    Total: numberValue(line.lineTotal),
    TaxCode: { Code: "GST" },
    Job: null
  }));

  return {
    Customer: { UID: input.customerUid },
    Date: today,
    Number: input.quote.quoteNumber ?? undefined,
    CustomerPurchaseOrderNumber: input.quote.quoteNumber ?? undefined,
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

  const lines = await listQuoteLines(quoteId);
  if (!lines.length) {
    const message = "This quote has no quote lines to send to MYOB.";
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
  const payload = buildMyobServiceOrderPayload({ quote, lines, customerUid: customer.uid });
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
