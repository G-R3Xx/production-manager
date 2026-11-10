import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { updateQuoteLineTitleOverrideForTenant } from "@/server/quotes";
import { QUOTE_LINE_TITLE_MAX_LENGTH } from "@/lib/quote-line-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ ok: false, error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  try {
    const data = await request.json() as Record<string, unknown>;
    const quoteId = typeof data.quoteId === "string" ? data.quoteId : "";
    const lineId = typeof data.lineId === "string" ? data.lineId : "";
    if (!UUID.test(quoteId) || !UUID.test(lineId) || typeof data.title !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid quote line title request." }, { status: 400 });
    }
    const trimmed = data.title.trim();
    if (trimmed.length > QUOTE_LINE_TITLE_MAX_LENGTH || /[\x00-\x1f\x7f]/.test(trimmed)) {
      return NextResponse.json({ ok: false, error: `Use a single-line title up to ${QUOTE_LINE_TITLE_MAX_LENGTH} characters.` }, { status: 400 });
    }
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
    const tenant = await resolveActiveTenantForAuthUserId(user.id);
    if (!tenant) return NextResponse.json({ ok: false, error: "No active workspace." }, { status: 403 });
    const savedTitle = await updateQuoteLineTitleOverrideForTenant(tenant.tenantId, quoteId, lineId, trimmed || null);
    if (savedTitle === undefined) {
      return NextResponse.json({ ok: false, error: "Quote line not found, or this accepted/deleted quote cannot be renamed." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, title: savedTitle }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[quote-line-title] save failed", error);
    return NextResponse.json({ ok: false, error: "Could not save the quote line title." }, { status: 500 });
  }
}
