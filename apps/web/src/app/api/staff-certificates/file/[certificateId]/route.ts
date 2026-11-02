import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { canManageStaff } from "@/server/users";
import { getStaffCertificate, staffMemberInTenant } from "@/server/staff-certificates";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { STAFF_CERTIFICATE_BUCKET } from "@/lib/staff-certificate";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ certificateId: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorised", { status: 401 });
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant || tenant.membershipStatus !== "active" || !canManageStaff(tenant.tenantRole)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const { certificateId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(certificateId)) return new NextResponse("Not found", { status: 404 });
  const certificate = await getStaffCertificate(tenant.tenantId, certificateId);
  if (!certificate?.filePath) return new NextResponse("Not found", { status: 404 });
  const staff = await staffMemberInTenant(tenant.tenantId, certificate.membershipId);
  if (!staff || (tenant.tenantRole !== "owner" && staff.tenantRole === "owner")) return new NextResponse("Forbidden", { status: 403 });
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase.storage.from(STAFF_CERTIFICATE_BUCKET).createSignedUrl(certificate.filePath, 90);
  if (error || !data?.signedUrl) return new NextResponse("File unavailable", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
