import { NextResponse } from "next/server";
import { getAuthenticatedAppUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductionCompletionDeadlines, getProductionCompletionDeadline, updateProductionCompletionDeadline } from "@/server/production";
import { parseCompletionDate } from "@/lib/completion-dates";

export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"private, no-store"};

export async function GET(request: Request) {
  const user = await getAuthenticatedAppUser();
  if (!user) return NextResponse.json({error:"Sign in to view deadlines."},{status:401,headers});
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return NextResponse.json({error:"Workspace unavailable."},{status:401,headers});
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (jobId) {
    if (!/^[a-f0-9-]{36}$/i.test(jobId)) return NextResponse.json({error:"Invalid job."},{status:400,headers});
    const job = await getProductionCompletionDeadline(tenant.tenantId,jobId);
    return job ? NextResponse.json({job},{headers}) : NextResponse.json({error:"Job not found."},{status:404,headers});
  }
  const jobs = await listProductionCompletionDeadlines(tenant.tenantId);
  return NextResponse.json({jobs},{headers});
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedAppUser();
  if (!user) return NextResponse.json({error:"Sign in to change deadlines."},{status:401,headers});
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return NextResponse.json({error:"Workspace unavailable."},{status:401,headers});
  if (tenant.membershipStatus!=="active" || !["owner","manager"].includes(tenant.tenantRole)) {
    return NextResponse.json({error:"Only owners and managers can change completion dates."},{status:403,headers});
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    if (!/^[a-f0-9-]{36}$/i.test(jobId)) return NextResponse.json({error:"Invalid Production Job."},{status:400,headers});
    if (!("expectedDate" in body) || !("dueDate" in body)) return NextResponse.json({error:"Missing completion-date details."},{status:400,headers});
    const dueDate = parseCompletionDate(body.dueDate);
    const expectedDate = parseCompletionDate(body.expectedDate);
    const job = await updateProductionCompletionDeadline(tenant.tenantId, jobId, dueDate, expectedDate);
    if (!job) return NextResponse.json({error:"This deadline was changed elsewhere. Refresh and try again."},{status:409,headers});
    return NextResponse.json({job},{headers});
  } catch(error) {
    return NextResponse.json({error: error instanceof Error ? error.message : "Could not update deadline."},{status:400,headers});
  }
}
