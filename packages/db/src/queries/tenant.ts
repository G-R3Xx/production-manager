import { sql } from "drizzle-orm";
import { db } from "../client";
import { memberships, tenants, userProfiles } from "../schema/app";

export type TenantMembershipRecord = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantRole: string;
  membershipStatus: string;
  userProfileId: string;
  shortName: string;
  fullName: string;
  email: string;
};

export async function getTenantMembershipsByAuthUserId(
  authUserId: string
): Promise<TenantMembershipRecord[]> {
  const rows = await db
    .select({
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      tenantRole: memberships.tenantRole,
      membershipStatus: memberships.status,
      userProfileId: userProfiles.id,
      shortName: userProfiles.shortName,
      fullName: userProfiles.fullName,
      email: userProfiles.email
    })
    .from(userProfiles)
    .innerJoin(memberships, sql`${memberships.userProfileId} = ${userProfiles.id}`)
    .innerJoin(tenants, sql`${tenants.id} = ${memberships.tenantId}`)
    .where(sql`${userProfiles.authUserId} = ${authUserId}`)
    .orderBy(tenants.name);

  return rows;
}

export async function getFirstActiveTenantForAuthUserId(authUserId: string) {
  const rows = await getTenantMembershipsByAuthUserId(authUserId);
  return (
    rows.find((row) => row.membershipStatus === "active") ?? null
  );
}
