import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { getTenantMembershipsByAuthUserId, type TenantMembershipRecord } from "@production-manager/db";
import { ACTIVE_TENANT_COOKIE } from "@/server/bootstrap/constants";

export type ActiveTenantContext = TenantMembershipRecord | null;

export const getMembershipsForAuthUserId = cache(async function getMembershipsForAuthUserId(authUserId: string): Promise<TenantMembershipRecord[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  return getTenantMembershipsByAuthUserId(authUserId);
});

export async function getStoredActiveTenantId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_TENANT_COOKIE)?.value ?? null;
}

export async function setStoredActiveTenantId(tenantId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearStoredActiveTenantId(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_TENANT_COOKIE);
}

export async function resolveActiveTenantForAuthUserId(
  authUserId: string
): Promise<ActiveTenantContext> {
  const memberships = await getMembershipsForAuthUserId(authUserId);

  if (memberships.length === 0) {
    return null;
  }

  const activeStatuses = memberships.filter((row) => row.membershipStatus === "active");
  const storedTenantId = await getStoredActiveTenantId();

  if (storedTenantId) {
    const matched = activeStatuses.find((row) => row.tenantId === storedTenantId);
    if (matched) {
      return matched;
    }
  }

  return activeStatuses[0] ?? memberships[0] ?? null;
}
