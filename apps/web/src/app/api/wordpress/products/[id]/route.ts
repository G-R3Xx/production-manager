import { NextResponse } from "next/server";
import {
  apiKeyFromRequest,
  getWordPressProductForConnection,
  resolveWordPressConnectionByApiKey
} from "@/server/wordpress";

type Context = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: Context) {
  const connection = await resolveWordPressConnectionByApiKey(apiKeyFromRequest(request));
  if (!connection) return NextResponse.json({ error: "Invalid Production Manager API key" }, { status: 401 });
  const { id } = await context.params;
  const product = await getWordPressProductForConnection(connection, id);
  if (!product) return NextResponse.json({ error: "Website product not found" }, { status: 404 });
  return NextResponse.json({ product }, { headers: { "Cache-Control": "private, max-age=0, no-store" } });
}
