import { NextRequest, NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getMyobConnectionByTenantId } from "@/server/integrations";
import { createMyobOauthStartUrl } from "@/server/myob-oauth";

export async function GET(request: NextRequest) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    return NextResponse.redirect(new URL("/integrations?error=No active tenant available", request.url));
  }

  const connection = await getMyobConnectionByTenantId(activeTenant.tenantId);
  const environment = connection?.environment ?? "sandbox";

  const result = await createMyobOauthStartUrl({
    tenantId: activeTenant.tenantId,
    environment
  });

  if (!result.ok) {
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(result.reason)}`, request.url)
    );
  }

  return NextResponse.redirect(result.authorizeUrl);
}
