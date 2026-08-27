import { NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listNotificationsWithUnreadForTenant } from "@/server/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    return NextResponse.json(
      { notifications: [], unreadCount: 0 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const snapshot = await listNotificationsWithUnreadForTenant(activeTenant.tenantId);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
}
