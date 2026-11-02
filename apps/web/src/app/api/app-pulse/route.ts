import { NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getAppActivityPulseForTenant, type AppPulseScope } from "@/server/notifications";

export const dynamic = "force-dynamic";

const VALID_SCOPES = new Set<AppPulseScope>(["dashboard", "calendar", "enquiries", "production", "all"]);

export async function GET(request: Request) {
  const startedAt = performance.now();
  const user = await getRequiredSessionUser();
  const authMs = performance.now() - startedAt;
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  const workspaceMs = performance.now() - startedAt - authMs;
  if (!activeTenant) {
    return NextResponse.json({ pulse: "" }, { headers: { "Cache-Control": "no-store" } });
  }
  const requestedScope = new URL(request.url).searchParams.get("scope") as AppPulseScope | null;
  const scope: AppPulseScope = requestedScope && VALID_SCOPES.has(requestedScope) ? requestedScope : "all";
  const pulseStartedAt = performance.now();
  const pulse = await getAppActivityPulseForTenant(activeTenant.tenantId, scope);
  const pulseMs = performance.now() - pulseStartedAt;
  const totalMs = performance.now() - startedAt;
  if (pulseMs > 500 || totalMs > 750) {
    console.info("[app-pulse-timing]", {
      scope,
      authMs: Math.round(authMs),
      workspaceMs: Math.round(workspaceMs),
      pulseMs: Math.round(pulseMs),
      totalMs: Math.round(totalMs),
      vercelRegion: process.env.VERCEL_REGION ?? null,
    });
  }
  return NextResponse.json({ pulse }, {
    headers: {
      "Cache-Control": "no-store",
      "Server-Timing": `auth;dur=${authMs.toFixed(1)}, workspace;dur=${workspaceMs.toFixed(1)}, activity-db;dur=${pulseMs.toFixed(1)}`,
    },
  });
}
