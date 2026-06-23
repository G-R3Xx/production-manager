import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getArtworkApprovalById, listArtworkApprovalPages } from "@/server/quotes";

const BUCKET = "artwork-approvals";
const MAX_PROOF_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type SignProofUploadBody = {
  approvalId?: unknown;
  pageId?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  fileSize?: unknown;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function safeFileName(value: unknown): string {
  const cleaned = cleanText(value)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "proof-artwork";
}

function extensionFromContentType(contentType: string): string {
  if (contentType.includes("pdf")) return ".pdf";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return ".png";
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in again before uploading proof artwork" }, { status: 401 });
  }

  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 401 });
  }

  let body: SignProofUploadBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }

  const approvalId = cleanText(body.approvalId);
  const pageId = cleanText(body.pageId);
  const originalFileName = safeFileName(body.fileName);
  const contentType = cleanText(body.contentType) || "application/octet-stream";
  const fileSize = Number(body.fileSize ?? 0);

  if (!approvalId) {
    return NextResponse.json({ error: "Select an artwork approval first" }, { status: 400 });
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "Select a proof file first" }, { status: 400 });
  }

  if (fileSize > MAX_PROOF_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "Proof artwork is too large. Please keep uploads under 50MB, or paste a hosted proof URL instead." }, { status: 413 });
  }

  const approval = await getArtworkApprovalById(activeTenant.tenantId, approvalId);
  if (!approval) {
    return NextResponse.json({ error: "Artwork approval not found" }, { status: 404 });
  }

  if (pageId) {
    const pages = await listArtworkApprovalPages(approvalId);
    if (!pages.some((page) => page.id === pageId)) {
      return NextResponse.json({ error: "Artwork page not found" }, { status: 404 });
    }
  }

  const extension = originalFileName.includes(".") ? "" : extensionFromContentType(contentType);
  const storagePath = `${activeTenant.tenantId}/artwork-approvals/${approvalId}/${pageId || "new-page"}/${Date.now()}-${originalFileName}${extension}`;
  const supabase = getSupabaseServiceRoleClient();

  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => undefined);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.token) {
    return NextResponse.json({ error: error?.message || "Could not prepare proof upload" }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return NextResponse.json({
    bucket: BUCKET,
    storagePath,
    token: data.token,
    publicUrl: publicData.publicUrl,
    fileName: originalFileName
  });
}
