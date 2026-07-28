import { NextResponse } from "next/server";
import {
  apiKeyFromRequest,
  getWordPressCatalogForConnection,
  resolveWordPressConnectionByApiKey
} from "@/server/wordpress";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const connection = await resolveWordPressConnectionByApiKey(apiKeyFromRequest(request));
  if (!connection) return NextResponse.json({ error: "Invalid Production Manager API key" }, { status: 401 });
  const catalog = await getWordPressCatalogForConnection(connection);
  return NextResponse.json(catalog, {
    headers: { "Cache-Control": "private, max-age=0, no-store" }
  });
}
