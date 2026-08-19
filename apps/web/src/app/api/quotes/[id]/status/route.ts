import { NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getQuoteDraftById } from "@/server/quotes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return NextResponse.json({ error: "No active workspace" }, { status: 403 });
  const { id } = await params;
  const quote = await getQuoteDraftById(tenant.tenantId, id);
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  return NextResponse.json(
    { updatedAt: quote.updatedAt, status: quote.status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
