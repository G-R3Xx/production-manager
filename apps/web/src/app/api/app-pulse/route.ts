import { NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getAppActivityPulseForTenant } from "@/server/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    return NextResponse.json({ pulse: "" }, { headers: { "Cache-Control": "no-store" } });
  }
  const pulse = await getAppActivityPulseForTenant(activeTenant.tenantId);
  return NextResponse.json({ pulse }, { headers: { "Cache-Control": "no-store" } });
}
