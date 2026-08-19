import { NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getArtworkApprovalById } from "@/server/quotes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return NextResponse.json({ error: "No active workspace" }, { status: 403 });

  const { id } = await params;
  const approval = await getArtworkApprovalById(tenant.tenantId, id);
  if (!approval) return NextResponse.json({ error: "Artwork approval not found" }, { status: 404 });

  return NextResponse.json(
    {
      updatedAt: approval.updatedAt,
      status: approval.status,
      viewedAt: approval.viewedAt,
      approvedAt: approval.approvedAt,
      changesRequestedAt: approval.changesRequestedAt
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
