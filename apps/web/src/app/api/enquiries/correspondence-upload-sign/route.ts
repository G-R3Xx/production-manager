import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById } from "@/server/enquiries";

const BUCKET = "enquiry-correspondence";
const MAX_CORRESPONDENCE_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type SignCorrespondenceUploadBody = {
  enquiryId?: unknown;
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
    .slice(0, 140);
  return cleaned || "enquiry-correspondence";
}

function extensionFromContentType(contentType: string): string {
  if (contentType.includes("rfc822")) return ".eml";
  if (contentType.includes("vnd.ms-outlook") || contentType.includes("x-msg")) return ".msg";
  if (contentType.includes("pdf")) return ".pdf";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("text")) return ".txt";
  return "";
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in again before attaching correspondence" }, { status: 401 });
  }

  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 401 });
  }

  let body: SignCorrespondenceUploadBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }

  const enquiryId = cleanText(body.enquiryId);
  const originalFileName = safeFileName(body.fileName);
  const contentType = cleanText(body.contentType) || "application/octet-stream";
  const fileSize = Number(body.fileSize ?? 0);

  if (!enquiryId) {
    return NextResponse.json({ error: "Choose an enquiry first" }, { status: 400 });
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "Select or drop an email/file first" }, { status: 400 });
  }

  if (fileSize > MAX_CORRESPONDENCE_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "Correspondence file is too large. Please keep uploads under 50MB." }, { status: 413 });
  }

  const enquiry = await getEnquiryById(activeTenant.tenantId, enquiryId);
  if (!enquiry) {
    return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  }

  const extension = originalFileName.includes(".") ? "" : extensionFromContentType(contentType);
  const storagePath = `${activeTenant.tenantId}/enquiries/${enquiryId}/correspondence/${Date.now()}-${originalFileName}${extension}`;
  const supabase = getSupabaseServiceRoleClient();

  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => undefined);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.token) {
    return NextResponse.json({ error: error?.message || "Could not prepare correspondence upload" }, { status: 500 });
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
