import { NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getAppActivityPulseForTenant, type AppPulseScope } from "@/server/notifications";

export const dynamic = "force-dynamic";

const VALID_SCOPES = new Set<AppPulseScope>(["dashboard", "calendar", "enquiries", "production", "all"]);

export async function GET(request: Request) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    return NextResponse.json({ pulse: "" }, { headers: { "Cache-Control": "no-store" } });
  }
  const requestedScope = new URL(request.url).searchParams.get("scope") as AppPulseScope | null;
  const scope: AppPulseScope = requestedScope && VALID_SCOPES.has(requestedScope) ? requestedScope : "all";
  const pulse = await getAppActivityPulseForTenant(activeTenant.tenantId, scope);
  return NextResponse.json({ pulse }, { headers: { "Cache-Control": "no-store" } });
}
