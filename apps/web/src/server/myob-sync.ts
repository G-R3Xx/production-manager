import "server-only";

import {
  createSyncRunForTenant,
  getMyobConnectionByTenantId,
  getMyobOauthTokenByTenantId,
  upsertMyobConnectionByTenantId,
  upsertMyobOauthTokenByTenantId
} from "@/server/integrations";
import { env } from "@/lib/env";

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

async function getValidAccessToken(tenantId: string, forceRefresh = false) {
  const token = await getMyobOauthTokenByTenantId(tenantId);

  if (!token) {
    throw new Error("No stored MYOB OAuth token found for this tenant.");
  }

  const expiresAtMs = token.expiresAt ? new Date(token.expiresAt).getTime() : null;
  const shouldRefresh = forceRefresh || !expiresAtMs || Number.isNaN(expiresAtMs) || expiresAtMs - Date.now() < 5 * 60 * 1000;

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

async function fetchMyobJson(accessToken: string, companyFileId: string, endpoint: string) {
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

  if (!connection || !connection.companyFileId) {
    throw new Error("No MYOB company file is linked to this tenant yet.");
  }

  const companyFileId = connection.companyFileId;

  let { accessToken, refreshed } = await getValidAccessToken(tenantId, true);

  const summary: MyobReadOnlySyncSummary = {
    companyFileId,
    companyName: connection.companyName,
    tokenRefreshed: refreshed,
    companyInfo: { ok: false, endpoint: "/Company/Preferences" },
    customers: { ok: false, endpoint: "/Contact/Customer?$top=50", count: 0 },
    suppliers: { ok: false, endpoint: "/Contact/Supplier?$top=50", count: 0 },
    items: { ok: false, endpoint: "/Inventory/Item?$top=50", count: 0 }
  };

  async function fetchWithRetry(endpoint: string) {
    try {
      return await fetchMyobJson(accessToken, companyFileId, endpoint);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const needsRefreshRetry = message.includes("OAuthTokenIsInvalid") || message.includes("401:");

      if (!needsRefreshRetry) {
        throw error;
      }

      const refreshedToken = await getValidAccessToken(tenantId, true);
      accessToken = refreshedToken.accessToken;
      refreshed = refreshed || refreshedToken.refreshed;
      return await fetchMyobJson(accessToken, companyFileId, endpoint);
    }
  }

  try {
    const result = await fetchWithRetry("/Company/Preferences");
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
      const result = await fetchWithRetry(endpoint);
      summary[key] = { ok: true, endpoint: result.url, count: countCollection(result.data) } as any;
    } catch (error) {
      summary[key] = { ok: false, endpoint, count: 0, error: error instanceof Error ? error.message : "Unknown error" } as any;
    }
  }

  const hadErrors = !summary.companyInfo.ok || !summary.customers.ok || !summary.suppliers.ok || !summary.items.ok;

  await upsertMyobConnectionByTenantId(tenantId, {
    environment: connection.environment,
    companyFileId,
    companyName: summary.companyInfo.displayName ?? connection.companyName,
    status: hadErrors ? "error" : "connected",
    connectedAt: connection.connectedAt,
    disconnectedAt: connection.disconnectedAt,
    lastSuccessfulSyncAt: hadErrors ? connection.lastSuccessfulSyncAt : new Date().toISOString()
  });

  await createSyncRunForTenant(
    tenantId,
    "incremental_import",
    hadErrors ? "error" : "success",
    { source: "runMyobReadOnlySync", ...summary },
    hadErrors ? [summary.companyInfo, summary.customers, summary.suppliers, summary.items].find((item) => !item.ok)?.error ?? "Read-only sync failed." : null
  );

  return summary;
}
