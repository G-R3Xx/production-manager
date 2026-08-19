import { NextResponse } from "next/server";
import { getQuoteDraftByPublicToken, listQuoteLines, quoteActivityFingerprint } from "@/server/quotes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await getQuoteDraftByPublicToken(token);
  if (!quote || quote.status === "deleted") return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const lines = await listQuoteLines(quote.id);
  return NextResponse.json(
    { fingerprint: quoteActivityFingerprint(quote, lines) },
    { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
  );
}
