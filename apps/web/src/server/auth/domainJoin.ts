import "server-only";

import { pool } from "@production-manager/db";

export type TenantRoleValue = "owner" | "manager" | "staff" | "sales" | "installer" | "accounts";

export type TenantDomainAccessSettings = {
  id: string | null;
  emailDomain: string;
  defaultRole: TenantRoleValue;
  autoJoin: boolean;
  status: "active" | "disabled";
};

export type DomainAutoJoinResult =
  | { status: "not_configured" }
  | { status: "invalid_email" }
  | { status: "joined"; tenantId: string; tenantName: string; tenantSlug: string }
  | { status: "already_member"; tenantId: string; tenantName: string; tenantSlug: string }
  | { status: "error"; message: string };

const VALID_TENANT_ROLES: TenantRoleValue[] = [
  "owner",
  "manager",
  "staff",
  "sales",
  "installer",
  "accounts"
];

function normaliseEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function getEmailDomain(value: string | null | undefined): string {
  const email = normaliseEmail(value);
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) return "";
  return email.slice(atIndex + 1).replace(/^www\./, "");
}

function normaliseDomain(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/^@/, "");
}

function titleCase(value: string): string {
  return value
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function deriveFullName(email: string, suppliedName?: string | null): string {
  const cleaned = String(suppliedName ?? "").trim();
  if (cleaned) return cleaned.slice(0, 200);

  const localPart = email.split("@")[0] ?? "Team Member";
  return titleCase(localPart) || "Team Member";
}

function deriveShortName(fullName: string, email: string): string {
  const fromName = fullName.split(/\s+/).filter(Boolean)[0];
  const fromEmail = email.split("@")[0];
  return String(fromName || fromEmail || "Staff").slice(0, 50);
}

function normaliseRole(value: string | null | undefined): TenantRoleValue {
  const cleaned = String(value ?? "staff").trim().toLowerCase() as TenantRoleValue;
  return VALID_TENANT_ROLES.includes(cleaned) ? cleaned : "staff";
}

export async function ensureTenantDomainAccessTable(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app.tenant_domain_access (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
      email_domain varchar(255) NOT NULL,
      default_role varchar(30) NOT NULL DEFAULT 'staff' CHECK (default_role IN ('owner', 'manager', 'staff', 'sales', 'installer', 'accounts')),
      status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      auto_join boolean NOT NULL DEFAULT true,
      created_at timestamp with time zone NOT NULL DEFAULT NOW(),
      updated_at timestamp with time zone NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS tenant_domain_access_active_domain_unique
      ON app.tenant_domain_access (lower(email_domain))
      WHERE status = 'active';

    CREATE INDEX IF NOT EXISTS tenant_domain_access_tenant_idx
      ON app.tenant_domain_access (tenant_id);
  `);

  await seedTenderEdgeDomainAccessIfPossible();
}

async function seedTenderEdgeDomainAccessIfPossible(): Promise<void> {
  await pool.query(`
    INSERT INTO app.tenant_domain_access (tenant_id, email_domain, default_role, status, auto_join)
    SELECT matched.id, 'tenderedge.com.au', 'staff', 'active', true
    FROM (
      SELECT t.id
      FROM app.tenants t
      LEFT JOIN app.tenant_settings ts ON ts.tenant_id = t.id
      WHERE NOT EXISTS (
        SELECT 1
        FROM app.tenant_domain_access existing
        WHERE lower(existing.email_domain) = 'tenderedge.com.au'
          AND existing.status = 'active'
      )
        AND t.status = 'active'
        AND (
          lower(t.slug) IN ('tender-edge', 'tenderedge', 'tender-edge-signs')
          OR regexp_replace(lower(t.name), '[^a-z0-9]+', '', 'g') LIKE '%tenderedge%'
          OR regexp_replace(lower(COALESCE(ts.trading_name, '')), '[^a-z0-9]+', '', 'g') LIKE '%tenderedge%'
          OR regexp_replace(lower(COALESCE(ts.company_legal_name, '')), '[^a-z0-9]+', '', 'g') LIKE '%tenderedge%'
          OR lower(COALESCE(ts.email, '')) LIKE '%@tenderedge.com.au'
        )
      ORDER BY
        CASE
          WHEN lower(t.slug) IN ('tender-edge', 'tenderedge') THEN 0
          WHEN lower(COALESCE(ts.email, '')) LIKE '%@tenderedge.com.au' THEN 1
          ELSE 2
        END,
        t.created_at ASC
      LIMIT 1
    ) matched
  `);
}

export async function getTenantDomainAccessSettingsByTenantId(
  tenantId: string
): Promise<TenantDomainAccessSettings | null> {
  if (!process.env.DATABASE_URL) return null;

  await ensureTenantDomainAccessTable();

  const result = await pool.query<{
    id: string;
    emailDomain: string;
    defaultRole: TenantRoleValue;
    autoJoin: boolean;
    status: "active" | "disabled";
  }>(
    `
      SELECT
        id,
        email_domain AS "emailDomain",
        default_role::text AS "defaultRole",
        auto_join AS "autoJoin",
        status
      FROM app.tenant_domain_access
      WHERE tenant_id = $1
      ORDER BY
        CASE WHEN status = 'active' THEN 0 ELSE 1 END,
        updated_at DESC,
        created_at DESC
      LIMIT 1
    `,
    [tenantId]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    emailDomain: row.emailDomain,
    defaultRole: normaliseRole(row.defaultRole),
    autoJoin: Boolean(row.autoJoin),
    status: row.status === "disabled" ? "disabled" : "active"
  };
}

export async function saveTenantDomainAccessSettingsByTenantId(
  tenantId: string,
  input: {
    emailDomain: string | null | undefined;
    defaultRole: string | null | undefined;
    autoJoin: boolean;
  }
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  await ensureTenantDomainAccessTable();

  const emailDomain = normaliseDomain(input.emailDomain);
  const defaultRole = normaliseRole(input.defaultRole);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (!emailDomain) {
      await client.query(
        `
          UPDATE app.tenant_domain_access
          SET status = 'disabled', auto_join = false, updated_at = NOW()
          WHERE tenant_id = $1
        `,
        [tenantId]
      );
      await client.query("COMMIT");
      return;
    }

    const taken = await client.query<{ tenantId: string; tenantName: string }>(
      `
        SELECT tda.tenant_id AS "tenantId", t.name AS "tenantName"
        FROM app.tenant_domain_access tda
        INNER JOIN app.tenants t ON t.id = tda.tenant_id
        WHERE lower(tda.email_domain) = $1
          AND tda.status = 'active'
          AND tda.tenant_id <> $2
        LIMIT 1
      `,
      [emailDomain, tenantId]
    );

    if (taken.rowCount && taken.rows[0]) {
      throw new Error(
        `That Google email domain is already linked to ${taken.rows[0].tenantName}.`
      );
    }

    await client.query(
      `
        UPDATE app.tenant_domain_access
        SET status = 'disabled', auto_join = false, updated_at = NOW()
        WHERE tenant_id = $1
          AND lower(email_domain) <> $2
      `,
      [tenantId, emailDomain]
    );

    const existing = await client.query<{ id: string }>(
      `
        SELECT id
        FROM app.tenant_domain_access
        WHERE tenant_id = $1
          AND lower(email_domain) = $2
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [tenantId, emailDomain]
    );

    if (existing.rows[0]?.id) {
      await client.query(
        `
          UPDATE app.tenant_domain_access
          SET email_domain = $2,
              default_role = $3,
              status = 'active',
              auto_join = $4,
              updated_at = NOW()
          WHERE id = $1
        `,
        [existing.rows[0].id, emailDomain, defaultRole, input.autoJoin]
      );
    } else {
      await client.query(
        `
          INSERT INTO app.tenant_domain_access (tenant_id, email_domain, default_role, status, auto_join)
          VALUES ($1, $2, $3, 'active', $4)
        `,
        [tenantId, emailDomain, defaultRole, input.autoJoin]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureDomainAutoJoinForAuthUser(input: {
  authUserId: string;
  email: string | null | undefined;
  fullName?: string | null;
}): Promise<DomainAutoJoinResult> {
  if (!process.env.DATABASE_URL) return { status: "not_configured" };

  const email = normaliseEmail(input.email);
  const emailDomain = getEmailDomain(email);
  if (!email || !emailDomain) return { status: "invalid_email" };

  try {
    await ensureTenantDomainAccessTable();

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const domainResult = await client.query<{
        tenantId: string;
        tenantName: string;
        tenantSlug: string;
        defaultRole: TenantRoleValue;
      }>(
        `
          SELECT
            t.id AS "tenantId",
            t.name AS "tenantName",
            t.slug AS "tenantSlug",
            tda.default_role::text AS "defaultRole"
          FROM app.tenant_domain_access tda
          INNER JOIN app.tenants t ON t.id = tda.tenant_id
          WHERE lower(tda.email_domain) = $1
            AND tda.status = 'active'
            AND tda.auto_join = true
            AND t.status = 'active'
          ORDER BY tda.created_at ASC
          LIMIT 1
        `,
        [emailDomain]
      );

      const domainAccess = domainResult.rows[0];
      if (!domainAccess) {
        await client.query("ROLLBACK");
        return { status: "not_configured" };
      }

      const fullName = deriveFullName(email, input.fullName);
      const shortName = deriveShortName(fullName, email);

      const profileResult = await client.query<{ id: string }>(
        `
          INSERT INTO app.user_profiles (auth_user_id, full_name, short_name, email)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (auth_user_id)
          DO UPDATE SET
            full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), app.user_profiles.full_name),
            short_name = COALESCE(NULLIF(app.user_profiles.short_name, ''), EXCLUDED.short_name),
            email = EXCLUDED.email,
            updated_at = NOW()
          RETURNING id
        `,
        [input.authUserId, fullName, shortName, email]
      );

      const userProfileId = profileResult.rows[0]?.id;
      if (!userProfileId) {
        throw new Error("Could not create or load user profile for domain sign-in.");
      }

      const existingMembership = await client.query<{ id: string; status: string }>(
        `
          SELECT id, status
          FROM app.memberships
          WHERE tenant_id = $1
            AND user_profile_id = $2
          ORDER BY created_at ASC
          LIMIT 1
        `,
        [domainAccess.tenantId, userProfileId]
      );

      if (existingMembership.rows[0]?.id) {
        await client.query(
          `
            UPDATE app.memberships
            SET status = 'active', updated_at = NOW()
            WHERE id = $1
          `,
          [existingMembership.rows[0].id]
        );

        await client.query("COMMIT");
        return {
          status: "already_member",
          tenantId: domainAccess.tenantId,
          tenantName: domainAccess.tenantName,
          tenantSlug: domainAccess.tenantSlug
        };
      }

      await client.query(
        `
          INSERT INTO app.memberships (tenant_id, user_profile_id, tenant_role, status)
          VALUES ($1, $2, $3, 'active')
        `,
        [domainAccess.tenantId, userProfileId, normaliseRole(domainAccess.defaultRole)]
      );

      await client.query("COMMIT");
      return {
        status: "joined",
        tenantId: domainAccess.tenantId,
        tenantName: domainAccess.tenantName,
        tenantSlug: domainAccess.tenantSlug
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not complete domain auto-join."
    };
  }
}
