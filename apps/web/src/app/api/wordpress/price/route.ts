import { NextResponse } from "next/server";
import {
  apiKeyFromRequest,
  priceWordPressProductForConnection,
  resolveWordPressConnectionByApiKey
} from "@/server/wordpress";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const connection = await resolveWordPressConnectionByApiKey(apiKeyFromRequest(request));
  if (!connection) return NextResponse.json({ error: "Invalid Production Manager API key" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const productId = String(body.productId ?? "").trim();
  if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 });
  const result = await priceWordPressProductForConnection(connection, {
    productId,
    widthMm: body.widthMm == null ? undefined : Number(body.widthMm),
    heightMm: body.heightMm == null ? undefined : Number(body.heightMm),
    quantity: body.quantity == null ? undefined : Number(body.quantity),
    answers: body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? body.answers as Record<string, unknown>
      : {}
  });
  if (!result) return NextResponse.json({ error: "Website product not found" }, { status: 404 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
