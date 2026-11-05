export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductionCompletionDeadlines } from "@/server/production";
import { CompletionCalendar } from "./CompletionCalendar";

function todayInSydney(): string {
  const parts = new Intl.DateTimeFormat("en-AU", {timeZone:"Australia/Sydney", year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const get = (key:string) => parts.find(part => part.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export default async function CalendarPage() {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  const jobs = await listProductionCompletionDeadlines(tenant.tenantId);
  return <CompletionCalendar initialJobs={jobs} today={todayInSydney()}
    canEdit={tenant.membershipStatus === "active" && ["owner","manager"].includes(tenant.tenantRole)}/>;
}
