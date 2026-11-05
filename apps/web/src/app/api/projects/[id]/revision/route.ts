import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getProjectRevision } from "@/server/project-timelines";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedAppUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return NextResponse.json({ error: "Workspace not found" }, { status: 401 });
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return NextResponse.json({error:"Invalid project"},{status:400});
  const revision = await getProjectRevision(tenant.tenantId, id);
  if (!revision) return NextResponse.json({error:"Project not found"},{status:404});
  return NextResponse.json({ revision }, { headers: { "Cache-Control": "private, no-store" } });
}
