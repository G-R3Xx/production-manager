import { NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getSurveyRequestsActivityFingerprintForTenant } from "@/server/surveys";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return NextResponse.json({ error: "No active workspace" }, { status: 403 });

  const fingerprint = await getSurveyRequestsActivityFingerprintForTenant(tenant.tenantId);
  return NextResponse.json(
    { fingerprint },
    { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
  );
}
