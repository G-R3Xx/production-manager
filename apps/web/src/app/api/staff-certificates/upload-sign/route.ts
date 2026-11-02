import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { canManageStaff } from "@/server/users";
import { staffMemberInTenant } from "@/server/staff-certificates";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { MAX_CERTIFICATE_FILE_SIZE, STAFF_CERTIFICATE_BUCKET, STAFF_CERTIFICATE_MIME_TYPES } from "@/lib/staff-certificate";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant || tenant.membershipStatus !== "active" || !canManageStaff(tenant.tenantRole)) {
    return NextResponse.json({ error: "Only active managers or owners can upload staff certificates." }, { status: 403 });
  }
  let body: { membershipId?: unknown; fileName?: unknown; fileSize?: unknown; contentType?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const membershipId = String(body.membershipId ?? "");
  const type = String(body.contentType ?? "");
  const size = Number(body.fileSize ?? 0);
  const staff = /^[0-9a-f-]{36}$/i.test(membershipId) ? await staffMemberInTenant(tenant.tenantId, membershipId) : null;
  if (!staff || (tenant.tenantRole !== "owner" && staff.tenantRole === "owner")) {
    return NextResponse.json({ error: "Staff member not found or access denied." }, { status: 404 });
  }
  if (!STAFF_CERTIFICATE_MIME_TYPES.some((mime) => mime === type) || !Number.isFinite(size) || size <= 0 || size > MAX_CERTIFICATE_FILE_SIZE) {
    return NextResponse.json({ error: "Choose a JPG, PNG, WebP or PDF under 15MB." }, { status: 400 });
  }
  const ext = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const fileName = String(body.fileName ?? "certificate").trim().slice(0, 255).replace(/[\u0000-\u001f]/g, "") || "certificate";
  const storagePath = `${tenant.tenantId}/${membershipId}/${randomUUID()}.${ext}`;
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase.storage.from(STAFF_CERTIFICATE_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.token) return NextResponse.json({ error: error?.message || "Could not prepare upload. Apply migration 063 first." }, { status: 500 });
  return NextResponse.json({ bucket: STAFF_CERTIFICATE_BUCKET, storagePath, token: data.token, fileName }, { headers: { "Cache-Control": "private, no-store" } });
}
