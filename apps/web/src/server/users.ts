import "server-only";

import { pool } from "@production-manager/db";

export type TenantUserRecord = {
  membershipId: string;
  tenantRole: string;
  membershipStatus: string;
  userProfileId: string;
  authUserId: string;
  fullName: string;
  shortName: string;
  email: string;
};

export async function listUsersForTenant(tenantId: string): Promise<TenantUserRecord[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  const result = await pool.query<TenantUserRecord>(
    `
      SELECT
        m.id AS "membershipId",
        m.tenant_role AS "tenantRole",
        m.status AS "membershipStatus",
        up.id AS "userProfileId",
        up.auth_user_id AS "authUserId",
        up.full_name AS "fullName",
        up.short_name AS "shortName",
        up.email AS "email"
      FROM app.memberships m
      INNER JOIN app.user_profiles up ON up.id = m.user_profile_id
      WHERE m.tenant_id = $1
      ORDER BY up.full_name ASC, up.email ASC
    `,
    [tenantId]
  );

  return result.rows;
}
