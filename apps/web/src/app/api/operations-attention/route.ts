import { NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getOperationsAttentionSnapshotForTenant } from "@/server/operations-attention";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    return NextResponse.json({ attention: null, today: { taskCount: 0, installCount: 0, href: "/calendar" }, latest: null, activeJobs: 0 }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const snapshot = await getOperationsAttentionSnapshotForTenant(activeTenant.tenantId);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
}
