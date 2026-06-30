import "server-only";

import { pool } from "@production-manager/db";

export type TenantRoleValue = "owner" | "manager" | "staff" | "sales" | "installer" | "accounts";
export type MembershipStatusValue = "active" | "invited" | "disabled";

export type TenantUserRecord = {
  membershipId: string;
  tenantRole: TenantRoleValue;
  membershipStatus: MembershipStatusValue;
  userProfileId: string;
  authUserId: string;
  fullName: string;
  shortName: string;
  email: string;
  profileCreatedAt: string;
  profileUpdatedAt: string;
  membershipCreatedAt: string;
  membershipUpdatedAt: string;
};

export type TenantStaffSummary = {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  disabledUsers: number;
  activeAdmins: number;
};

export const TENANT_ROLE_OPTIONS: { value: TenantRoleValue; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Full workspace access and role management." },
  { value: "manager", label: "Manager", description: "Can manage operations and staff access." },
  { value: "staff", label: "Staff", description: "General production/staff access." },
  { value: "sales", label: "Sales", description: "Sales, enquiry and quote focused access." },
  { value: "installer", label: "Installer", description: "Install and field work focused access." },
  { value: "accounts", label: "Accounts", description: "Accounts/admin focused access." }
];

export const MEMBERSHIP_STATUS_OPTIONS: { value: MembershipStatusValue; label: string; description: string }[] = [
  { value: "active", label: "Active", description: "Can access this workspace." },
  { value: "invited", label: "Pending", description: "Registered but held for approval/testing." },
  { value: "disabled", label: "Disabled", description: "Cannot access this workspace." }
];

const ADMIN_ROLES = new Set<TenantRoleValue>(["owner", "manager"]);
const VALID_TENANT_ROLES = new Set<TenantRoleValue>(TENANT_ROLE_OPTIONS.map((option) => option.value));
const VALID_MEMBERSHIP_STATUSES = new Set<MembershipStatusValue>(MEMBERSHIP_STATUS_OPTIONS.map((option) => option.value));

function normaliseTenantRole(value: string): TenantRoleValue {
  const cleaned = value.trim().toLowerCase() as TenantRoleValue;
  if (!VALID_TENANT_ROLES.has(cleaned)) throw new Error("Please choose a valid staff role.");
  return cleaned;
}

function normaliseMembershipStatus(value: string): MembershipStatusValue {
  const cleaned = value.trim().toLowerCase() as MembershipStatusValue;
  if (!VALID_MEMBERSHIP_STATUSES.has(cleaned)) throw new Error("Please choose a valid staff status.");
  return cleaned;
}

export function canManageStaff(tenantRole: string | null | undefined): boolean {
  return ADMIN_ROLES.has(String(tenantRole ?? "").toLowerCase() as TenantRoleValue);
}

export function staffStatusLabel(status: string): string {
  return status === "invited" ? "Pending" : status.slice(0, 1).toUpperCase() + status.slice(1);
}

export async function listUsersForTenant(tenantId: string): Promise<TenantUserRecord[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  const result = await pool.query<TenantUserRecord>(
    `
      SELECT
        m.id AS "membershipId",
        m.tenant_role::text AS "tenantRole",
        m.status::text AS "membershipStatus",
        up.id AS "userProfileId",
        up.auth_user_id AS "authUserId",
        up.full_name AS "fullName",
        up.short_name AS "shortName",
        up.email AS "email",
        up.created_at::text AS "profileCreatedAt",
        up.updated_at::text AS "profileUpdatedAt",
        m.created_at::text AS "membershipCreatedAt",
        m.updated_at::text AS "membershipUpdatedAt"
      FROM app.memberships m
      INNER JOIN app.user_profiles up ON up.id = m.user_profile_id
      WHERE m.tenant_id = $1
      ORDER BY
        CASE m.status
          WHEN 'active' THEN 0
          WHEN 'invited' THEN 1
          ELSE 2
        END,
        CASE m.tenant_role
          WHEN 'owner' THEN 0
          WHEN 'manager' THEN 1
          ELSE 2
        END,
        up.full_name ASC,
        up.email ASC
    `,
    [tenantId]
  );

  return result.rows.map((row) => ({
    ...row,
    tenantRole: normaliseTenantRole(row.tenantRole),
    membershipStatus: normaliseMembershipStatus(row.membershipStatus)
  }));
}

export async function getTenantStaffSummary(tenantId: string): Promise<TenantStaffSummary> {
  if (!process.env.DATABASE_URL) {
    return { totalUsers: 0, activeUsers: 0, pendingUsers: 0, disabledUsers: 0, activeAdmins: 0 };
  }

  const result = await pool.query<TenantStaffSummary>(
    `
      SELECT
        COUNT(*)::int AS "totalUsers",
        COUNT(*) FILTER (WHERE status = 'active')::int AS "activeUsers",
        COUNT(*) FILTER (WHERE status = 'invited')::int AS "pendingUsers",
        COUNT(*) FILTER (WHERE status = 'disabled')::int AS "disabledUsers",
        COUNT(*) FILTER (WHERE status = 'active' AND tenant_role IN ('owner', 'manager'))::int AS "activeAdmins"
      FROM app.memberships
      WHERE tenant_id = $1
    `,
    [tenantId]
  );

  return result.rows[0] ?? { totalUsers: 0, activeUsers: 0, pendingUsers: 0, disabledUsers: 0, activeAdmins: 0 };
}

export async function updateTenantUserMembershipByAdmin(input: {
  tenantId: string;
  membershipId: string;
  requesterUserProfileId: string;
  requesterTenantRole: string;
  tenantRole: string;
  membershipStatus: string;
}): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const requesterRole = normaliseTenantRole(input.requesterTenantRole);
  const nextRole = normaliseTenantRole(input.tenantRole);
  const nextStatus = normaliseMembershipStatus(input.membershipStatus);

  if (!canManageStaff(requesterRole)) {
    throw new Error("Only owners and managers can edit staff roles.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const targetResult = await client.query<{
      membershipId: string;
      userProfileId: string;
      tenantRole: TenantRoleValue;
      membershipStatus: MembershipStatusValue;
      email: string;
      fullName: string;
    }>(
      `
        SELECT
          m.id AS "membershipId",
          m.user_profile_id AS "userProfileId",
          m.tenant_role::text AS "tenantRole",
          m.status::text AS "membershipStatus",
          up.email AS "email",
          up.full_name AS "fullName"
        FROM app.memberships m
        INNER JOIN app.user_profiles up ON up.id = m.user_profile_id
        WHERE m.id = $1
          AND m.tenant_id = $2
        FOR UPDATE
      `,
      [input.membershipId, input.tenantId]
    );

    const target = targetResult.rows[0];
    if (!target) {
      throw new Error("Staff member was not found in this workspace.");
    }

    const requesterMembershipResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM app.memberships
        WHERE tenant_id = $1
          AND user_profile_id = $2
          AND status = 'active'
          AND tenant_role IN ('owner', 'manager')
        LIMIT 1
      `,
      [input.tenantId, input.requesterUserProfileId]
    );

    if (!requesterMembershipResult.rows[0]?.id) {
      throw new Error("Your account no longer has permission to edit staff roles.");
    }

    const targetIsRequester = target.userProfileId === input.requesterUserProfileId;

    if (requesterRole !== "owner" && target.tenantRole === "owner") {
      throw new Error("Only an owner can edit another owner account.");
    }

    if (requesterRole !== "owner" && nextRole === "owner") {
      throw new Error("Only an owner can promote another user to owner.");
    }

    if (targetIsRequester && nextStatus !== "active") {
      throw new Error("You cannot disable or pause your own active account.");
    }

    const activeAdminResult = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM app.memberships
        WHERE tenant_id = $1
          AND status = 'active'
          AND tenant_role IN ('owner', 'manager')
      `,
      [input.tenantId]
    );

    const activeAdminCount = Number(activeAdminResult.rows[0]?.count ?? 0);
    const targetCurrentlyActiveAdmin = target.membershipStatus === "active" && ADMIN_ROLES.has(target.tenantRole);
    const targetWillRemainActiveAdmin = nextStatus === "active" && ADMIN_ROLES.has(nextRole);

    if (targetCurrentlyActiveAdmin && !targetWillRemainActiveAdmin && activeAdminCount <= 1) {
      throw new Error("You must keep at least one active owner or manager in the workspace.");
    }

    await client.query(
      `
        UPDATE app.memberships
        SET tenant_role = $2::tenant_role,
            status = $3::membership_status,
            updated_at = NOW()
        WHERE id = $1
          AND tenant_id = $4
      `,
      [input.membershipId, nextRole, nextStatus, input.tenantId]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
