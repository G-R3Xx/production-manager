import "server-only";

import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const MYOB_OAUTH_STATE_COOKIE = "pm_myob_oauth_state";

export type MyobOauthStartResult =
  | { ok: true; authorizeUrl: string }
  | { ok: false; reason: string };

export type MyobTokenExchangeResponse = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

function randomState() {
  return crypto.randomUUID();
}

export function getMyobScopes() {
  return [
    "sme-company-file",
    "sme-contacts-customer",
    "sme-contacts-supplier",
    "sme-inventory",
    "sme-sales",
    "sme-purchases"
  ].join(" ");
}

export async function createMyobOauthStartUrl(input: {
  tenantId: string;
  environment: "sandbox" | "live";
}): Promise<MyobOauthStartResult> {
  if (!env.MYOB_CLIENT_ID || !env.MYOB_REDIRECT_URI || !env.MYOB_API_BASE_URL) {
    return {
      ok: false,
      reason:
        "MYOB OAuth environment variables are not configured yet. Add MYOB_CLIENT_ID, MYOB_REDIRECT_URI, and MYOB_API_BASE_URL before starting the real connect flow."
    };
  }

  const state = randomState();
  const cookieStore = await cookies();
  cookieStore.set(MYOB_OAUTH_STATE_COOKIE, JSON.stringify({
    state,
    tenantId: input.tenantId,
    environment: input.environment,
    createdAt: new Date().toISOString()
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10
  });

  const baseUrl = new URL(env.MYOB_API_BASE_URL);
  const authorizeUrl = new URL("oauth2/account/authorize", baseUrl);
  authorizeUrl.searchParams.set("client_id", env.MYOB_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", env.MYOB_REDIRECT_URI);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", getMyobScopes());
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("state", state);

  return {
    ok: true,
    authorizeUrl: authorizeUrl.toString()
  };
}

export async function exchangeMyobAuthorizationCode(
  code: string
): Promise<MyobTokenExchangeResponse> {
  if (!env.MYOB_CLIENT_ID || !env.MYOB_CLIENT_SECRET || !env.MYOB_REDIRECT_URI || !env.MYOB_API_BASE_URL) {
    throw new Error("MYOB OAuth environment variables are not fully configured.");
  }

  const baseUrl = new URL(env.MYOB_API_BASE_URL);
  const tokenUrl = new URL("oauth2/v1/authorize", baseUrl);
  const body = new URLSearchParams({
    client_id: env.MYOB_CLIENT_ID,
    client_secret: env.MYOB_CLIENT_SECRET,
    code,
    redirect_uri: env.MYOB_REDIRECT_URI,
    grant_type: "authorization_code"
  });

  const response = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
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
    throw new Error(`MYOB token exchange failed (${response.status}): ${detail}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("MYOB token exchange returned an unexpected response.");
  }

  const tokenResponse = parsed as Partial<MyobTokenExchangeResponse>;

  if (!tokenResponse.access_token || !tokenResponse.refresh_token) {
    throw new Error("MYOB token exchange response did not include access and refresh tokens.");
  }

  return {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    token_type: tokenResponse.token_type,
    expires_in: tokenResponse.expires_in,
    scope: tokenResponse.scope
  };
}

export async function readMyobOauthState() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(MYOB_OAUTH_STATE_COOKIE)?.value;

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      state: string;
      tenantId: string;
      environment: "sandbox" | "live";
      createdAt: string;
    };

    if (!parsed.state || !parsed.tenantId || !parsed.environment) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function clearMyobOauthState() {
  const cookieStore = await cookies();
  cookieStore.set(MYOB_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
