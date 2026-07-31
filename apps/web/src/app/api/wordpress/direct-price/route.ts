import { NextResponse } from "next/server";
import {
  priceWordPressProductForConnection,
  verifyWordPressPublicPricingToken
} from "@/server/wordpress";

export const dynamic = "force-dynamic";

function corsHeaders(origin: string): Record<string, string> {
  return origin ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "3600",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  } : { "Cache-Control": "no-store" };
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.text()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const productId = String(body.productId ?? "").trim();
  const token = String(body.token ?? "").trim();
  const requestOrigin = request.headers.get("origin") ?? "";
  if (!productId || !token) {
    return NextResponse.json({ error: "Pricing token and productId are required" }, { status: 400 });
  }

  const verified = await verifyWordPressPublicPricingToken(token, productId, requestOrigin);
  if (!verified) {
    return NextResponse.json({ error: "This pricing session has expired. Refresh the product page." }, {
      status: 401,
      headers: corsHeaders(requestOrigin)
    });
  }

  const result = await priceWordPressProductForConnection(verified.connection, {
    productId,
    widthMm: body.widthMm == null ? undefined : Number(body.widthMm),
    heightMm: body.heightMm == null ? undefined : Number(body.heightMm),
    quantity: body.quantity == null ? undefined : Number(body.quantity),
    answers: body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? body.answers as Record<string, unknown>
      : {}
  });

  if (!result) {
    return NextResponse.json({ error: "Website product not found" }, {
      status: 404,
      headers: corsHeaders(verified.payload.origin)
    });
  }
  return NextResponse.json(result, { headers: corsHeaders(verified.payload.origin) });
}
