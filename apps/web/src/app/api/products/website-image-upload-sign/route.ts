import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getProductById } from "@/server/products";

const BUCKET = "product-assets";
const MAX_IMAGE_SIZE_BYTES = 12 * 1024 * 1024;

type SignWebsiteImageBody = {
  productId?: unknown;
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
  return cleaned || "product-image";
}

function extensionFromContentType(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("avif")) return ".avif";
  return "";
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in again before uploading product images." }, { status: 401 });
  }

  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 401 });
  }

  let body: SignWebsiteImageBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid image upload request." }, { status: 400 });
  }

  const productId = cleanText(body.productId);
  const originalFileName = safeFileName(body.fileName);
  const contentType = cleanText(body.contentType) || "application/octet-stream";
  const fileSize = Number(body.fileSize ?? 0);

  if (!productId) {
    return NextResponse.json({ error: "Product not found." }, { status: 400 });
  }
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "The selected file is not an image." }, { status: 415 });
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "Choose an image first." }, { status: 400 });
  }
  if (fileSize > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json({ error: "Product images must be 12 MB or smaller." }, { status: 413 });
  }

  const product = await getProductById(activeTenant.tenantId, productId);
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const imageId = randomUUID();
  const extension = originalFileName.includes(".") ? "" : extensionFromContentType(contentType);
  const storagePath = `${activeTenant.tenantId}/products/${productId}/website/${Date.now()}-${imageId}-${originalFileName}${extension}`;
  const supabase = getSupabaseServiceRoleClient();

  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => undefined);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.token) {
    return NextResponse.json({ error: error?.message || "Could not prepare the product image upload." }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return NextResponse.json({
    bucket: BUCKET,
    storagePath,
    token: data.token,
    publicUrl: publicData.publicUrl,
    imageId
  });
}
