import { NextResponse } from "next/server";
import {
  apiKeyFromRequest,
  ingestWordPressOrder,
  type WordPressOrderPayload,
  resolveWordPressConnectionByApiKey
} from "@/server/wordpress";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const connection = await resolveWordPressConnectionByApiKey(apiKeyFromRequest(request));
  if (!connection) return NextResponse.json({ error: "Invalid Production Manager API key" }, { status: 401 });
  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const result = await ingestWordPressOrder(connection, payload as WordPressOrderPayload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Order import failed" }, { status: 400 });
  }
}
