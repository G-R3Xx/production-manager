import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getProductionItemByIdForTenant } from "@/server/production";

const BUCKET = "production-files";
const MAX_PRINT_READY_FILE_SIZE_BYTES = 250 * 1024 * 1024;

type SignPrintReadyUploadBody = {
  itemId?: unknown;
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
    .slice(0, 160);
  return cleaned || "print-ready-artwork";
}

function extensionFromContentType(contentType: string): string {
  if (contentType.includes("pdf")) return ".pdf";
  if (contentType.includes("illustrator")) return ".ai";
  if (contentType.includes("postscript")) return ".eps";
  if (contentType.includes("svg")) return ".svg";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("tiff")) return ".tif";
  return "";
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in again before uploading print-ready artwork" }, { status: 401 });
  }

  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 401 });
  }

  let body: SignPrintReadyUploadBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }

  const itemId = cleanText(body.itemId);
  const originalFileName = safeFileName(body.fileName);
  const contentType = cleanText(body.contentType) || "application/octet-stream";
  const fileSize = Number(body.fileSize ?? 0);

  if (!itemId) {
    return NextResponse.json({ error: "Select a production item first" }, { status: 400 });
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "Select a print-ready file first" }, { status: 400 });
  }

  if (fileSize > MAX_PRINT_READY_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "Print-ready artwork is over 250MB. Please package/compress it or upload a hosted link." }, { status: 413 });
  }

  const item = await getProductionItemByIdForTenant(activeTenant.tenantId, itemId);
  if (!item) {
    return NextResponse.json({ error: "Production item not found" }, { status: 404 });
  }

  const extension = originalFileName.includes(".") ? "" : extensionFromContentType(contentType);
  const storagePath = `${activeTenant.tenantId}/production/${item.jobId}/${itemId}/${Date.now()}-${originalFileName}${extension}`;
  const supabase = getSupabaseServiceRoleClient();

  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => undefined);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.token) {
    return NextResponse.json({ error: error?.message || "Could not prepare production file upload" }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return NextResponse.json({
    bucket: BUCKET,
    storagePath,
    token: data.token,
    publicUrl: publicData.publicUrl,
    fileName: originalFileName,
    fileType: contentType
  });
}
