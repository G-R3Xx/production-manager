import { NextResponse } from "next/server";
import { artworkApprovalStatusFingerprint, getArtworkApprovalByPublicToken, listArtworkApprovalPages } from "@/server/quotes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const approval = await getArtworkApprovalByPublicToken(token);
  if (!approval || approval.status === "deleted") return NextResponse.json({ error: "Artwork approval not found" }, { status: 404 });
  const pages = await listArtworkApprovalPages(approval.id);
  return NextResponse.json(
    { fingerprint: artworkApprovalStatusFingerprint(approval, pages) },
    { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
  );
}
