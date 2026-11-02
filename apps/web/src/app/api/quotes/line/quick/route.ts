import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { assignQuoteLineSubJob } from "@/server/quote-sub-jobs";
import { deleteQuoteLineBundleForTenant } from "@/server/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const started = performance.now();
  const sameSite = request.headers.get("sec-fetch-site");
  if (sameSite === "cross-site") return NextResponse.json({ ok: false, error: "Cross-site requests are not allowed." }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const quoteId = String(payload.quoteId ?? "");
    const lineId = String(payload.lineId ?? "");
    const mode = String(payload.mode ?? "");
    const subJobId = String(payload.subJobId ?? "");
    if (!uuid.test(quoteId) || !uuid.test(lineId) || (mode !== "move" && mode !== "delete") || (mode === "move" && subJobId && !uuid.test(subJobId))) {
      return NextResponse.json({ ok: false, error: "Invalid quote line request." }, { status: 400 });
    }

    const authStarted = performance.now();
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    const tenant = await resolveActiveTenantForAuthUserId(user.id);
    if (!tenant) return NextResponse.json({ ok: false, error: "No active workspace." }, { status: 403 });
    const authMs = Math.round(performance.now() - authStarted);

    const dbStarted = performance.now();
    const removedIds = mode === "delete"
      ? await deleteQuoteLineBundleForTenant(tenant.tenantId, quoteId, lineId)
      : [];
    const ok = mode === "delete"
      ? removedIds.includes(lineId)
      : await assignQuoteLineSubJob(tenant.tenantId, quoteId, lineId, subJobId || null);
    const dbMs = Math.round(performance.now() - dbStarted);
    const totalMs = Math.round(performance.now() - started);
    console.info("[quote-line-quick-action]", { mode, authMs, dbMs, totalMs, region: process.env.VERCEL_REGION ?? null });
    if (!ok) return NextResponse.json({ ok: false, error: "Quote line or section not found.", authMs, dbMs, totalMs }, { status: 404 });
    return NextResponse.json({ ok: true, removedIds, authMs, dbMs, totalMs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[quote-line-quick-action] failed", error);
    return NextResponse.json({ ok: false, error: "The change could not be saved. Please try again." }, { status: 500 });
  }
}
