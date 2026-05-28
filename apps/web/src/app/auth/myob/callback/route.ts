import { NextRequest, NextResponse } from "next/server";
import {
  createSyncRunForTenant,
  upsertMyobConnectionByTenantId,
  upsertMyobOauthTokenByTenantId
} from "@/server/integrations";
import {
  clearMyobOauthState,
  exchangeMyobAuthorizationCode,
  readMyobOauthState
} from "@/server/myob-oauth";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const businessId = url.searchParams.get("businessId");
  const businessName = url.searchParams.get("businessName");

  const savedState = await readMyobOauthState();

  if (!savedState || !returnedState || savedState.state !== returnedState) {
    await clearMyobOauthState();
    return NextResponse.redirect(
      new URL("/integrations?error=Invalid or expired MYOB OAuth state", request.url)
    );
  }

  if (error) {
    await createSyncRunForTenant(
      savedState.tenantId,
      "incremental_import",
      "error",
      {
        source: "myob_oauth_callback",
        oauthError: error
      },
      error
    );

    await clearMyobOauthState();
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(`MYOB returned an error: ${error}`)}`, request.url)
    );
  }

  if (!code) {
    await clearMyobOauthState();
    return NextResponse.redirect(
      new URL("/integrations?error=MYOB did not return an authorization code", request.url)
    );
  }

  try {
    const tokenResponse = await exchangeMyobAuthorizationCode(code);
    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      : null;

    await upsertMyobOauthTokenByTenantId(savedState.tenantId, {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenType: tokenResponse.token_type ?? null,
      scope: tokenResponse.scope ?? null,
      expiresAt
    });

    await upsertMyobConnectionByTenantId(savedState.tenantId, {
      environment: savedState.environment,
      companyFileId: businessId,
      companyName: businessName,
      status: "connected",
      connectedAt: new Date().toISOString(),
      disconnectedAt: null,
      lastSuccessfulSyncAt: null
    });

    await createSyncRunForTenant(
      savedState.tenantId,
      "incremental_import",
      "success",
      {
        source: "myob_oauth_callback",
        tokenExchange: true,
        businessId,
        businessName,
        scope: tokenResponse.scope ?? null,
        expiresIn: tokenResponse.expires_in ?? null
      },
      businessId ? null : "MYOB callback completed without a businessId/company file selection. Reconnect and ensure consent flow completes."
    );

    await clearMyobOauthState();

    const message = businessId
      ? `MYOB connection established for ${businessName ?? businessId}. Tokens stored and company file saved.`
      : "MYOB tokens stored, but no businessId/company file was returned. Reconnect and ensure the consent flow completes.";

    return NextResponse.redirect(
      new URL(`/integrations?message=${encodeURIComponent(message)}`, request.url)
    );
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Unknown MYOB OAuth callback failure";

    await createSyncRunForTenant(
      savedState.tenantId,
      "incremental_import",
      "error",
      {
        source: "myob_oauth_callback",
        tokenExchange: false
      },
      message
    );

    await clearMyobOauthState();
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
