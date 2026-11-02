import { NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getQuoteStatusSnapshotForTenant } from "@/server/quotes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const user = await getRequiredSessionUser();
  const authMs = performance.now() - startedAt;
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  const workspaceMs = performance.now() - startedAt - authMs;
  if (!tenant) return NextResponse.json({ error: "No active workspace" }, { status: 403 });
  const { id } = await params;
  // Guard malformed IDs before hitting Postgres; avoid noisy UUID cast errors.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const dataStartedAt = performance.now();
  const snapshot = await getQuoteStatusSnapshotForTenant(tenant.tenantId, id);
  const dbMs = Math.round(performance.now() - dataStartedAt);
  if (dbMs > 500 || performance.now() - startedAt > 750) {
    console.info("[quote-status-timing]", {
      authMs: Math.round(authMs),
      workspaceMs: Math.round(workspaceMs),
      dbMs,
      totalMs: Math.round(performance.now() - startedAt),
      vercelRegion: process.env.VERCEL_REGION ?? null,
    });
  }
  if (!snapshot) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "Server-Timing": `auth;dur=${authMs.toFixed(1)}, workspace;dur=${workspaceMs.toFixed(1)}, quote-status-db;dur=${dbMs}`,
    },
  });
}
