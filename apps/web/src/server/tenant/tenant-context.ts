import { getTenantMembershipsByAuthUserId } from "@production-manager/db";
import { getAuthenticatedAppUser } from "@/server/auth/session";
import {
  getActiveTenantIdFromCookie,
  setActiveTenantIdCookie
} from "@/server/tenant/active-tenant";

export type TenantMembershipSummary = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantRole: string;
  membershipStatus: string;
};

export type TenantContextResult =
  | {
      status: "anonymous";
      user: null;
      memberships: [];
      activeTenantId: null;
      activeMembership: null;
    }
  | {
      status: "needs_bootstrap";
      user: {
        id: string;
        email: string | null;
      };
      memberships: [];
      activeTenantId: null;
      activeMembership: null;
    }
  | {
      status: "ready";
      user: {
        id: string;
        email: string | null;
      };
      memberships: TenantMembershipSummary[];
      activeTenantId: string;
      activeMembership: TenantMembershipSummary;
    }
  | {
      status: "db_error";
      user: {
        id: string;
        email: string | null;
      };
      memberships: [];
      activeTenantId: null;
      activeMembership: null;
      errorMessage: string;
    };

export async function getTenantContext(): Promise<TenantContextResult> {
  const user = await getAuthenticatedAppUser();

  if (!user) {
    return {
      status: "anonymous",
      user: null,
      memberships: [],
      activeTenantId: null,
      activeMembership: null
    };
  }

  try {
    const membershipsRaw = await getTenantMembershipsByAuthUserId(user.id);

    const memberships: TenantMembershipSummary[] = membershipsRaw.map((row) => ({
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      tenantSlug: row.tenantSlug,
      tenantRole: row.tenantRole,
      membershipStatus: row.membershipStatus
    }));

    if (memberships.length === 0) {
      return {
        status: "needs_bootstrap",
        user,
        memberships: [],
        activeTenantId: null,
        activeMembership: null
      };
    }

    const cookieTenantId = await getActiveTenantIdFromCookie();
    const activeMembership =
      memberships.find((membership) => membership.tenantId === cookieTenantId) ??
      memberships[0];

    if (cookieTenantId !== activeMembership.tenantId) {
      await setActiveTenantIdCookie(activeMembership.tenantId);
    }

    return {
      status: "ready",
      user,
      memberships,
      activeTenantId: activeMembership.tenantId,
      activeMembership
    };
  } catch (error) {
    return {
      status: "db_error",
      user,
      memberships: [],
      activeTenantId: null,
      activeMembership: null,
      errorMessage: error instanceof Error ? error.message : "Unknown database error"
    };
  }
}
