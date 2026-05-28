import "server-only";

import { pool } from "@production-manager/db";
import { slugifyTenantName } from "@/server/bootstrap/slug";

export type BootstrapResult =
  | { ok: true; tenantId: string; slug: string }
  | { ok: false; message: string };

export type BootstrapInput = {
  authUserId: string;
  email: string;
  fullName: string;
  shortName: string;
  tenantName: string;
  tenantSlug?: string;
};

export async function createInitialTenantBootstrap(
  input: BootstrapInput
): Promise<BootstrapResult> {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      message:
        "DATABASE_URL is not configured yet. Auth is wired, but bootstrap needs the Postgres connection next."
    };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const profileResult = await client.query<{
      id: string;
    }>(
      `
        INSERT INTO app.user_profiles (auth_user_id, full_name, short_name, email)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (auth_user_id)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          short_name = EXCLUDED.short_name,
          email = EXCLUDED.email,
          updated_at = NOW()
        RETURNING id
      `,
      [input.authUserId, input.fullName, input.shortName, input.email]
    );

    const userProfileId = profileResult.rows[0]?.id;

    if (!userProfileId) {
      await client.query("ROLLBACK");
      return { ok: false, message: "Could not create or load the user profile." };
    }

    const membershipCheck = await client.query<{ tenant_id: string }>(
      `
        SELECT tenant_id
        FROM app.memberships
        WHERE user_profile_id = $1
          AND status = 'active'
        LIMIT 1
      `,
      [userProfileId]
    );

    if (membershipCheck.rowCount && membershipCheck.rows[0]?.tenant_id) {
      await client.query("COMMIT");
      return {
        ok: true,
        tenantId: membershipCheck.rows[0].tenant_id,
        slug: input.tenantSlug ?? slugifyTenantName(input.tenantName)
      };
    }

    const desiredSlug = slugifyTenantName(input.tenantSlug || input.tenantName);
    const slugResult = await client.query<{ slug: string }>(
      `
        SELECT CASE
          WHEN EXISTS (SELECT 1 FROM app.tenants WHERE slug = $1)
          THEN $1 || '-' || substring(md5(random()::text), 1, 6)
          ELSE $1
        END AS slug
      `,
      [desiredSlug]
    );
    const finalSlug = slugResult.rows[0]?.slug ?? desiredSlug;

    const tenantResult = await client.query<{ id: string }>(
      `
        INSERT INTO app.tenants (slug, name)
        VALUES ($1, $2)
        RETURNING id
      `,
      [finalSlug, input.tenantName]
    );

    const tenantId = tenantResult.rows[0]?.id;

    if (!tenantId) {
      await client.query("ROLLBACK");
      return { ok: false, message: "Could not create the tenant record." };
    }

    await client.query(
      `
        INSERT INTO app.tenant_settings (tenant_id, trading_name, email)
        VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id)
        DO NOTHING
      `,
      [tenantId, input.tenantName, input.email]
    );

    await client.query(
      `
        INSERT INTO app.memberships (tenant_id, user_profile_id, tenant_role, status)
        VALUES ($1, $2, 'owner', 'active')
      `,
      [tenantId, userProfileId]
    );

    await client.query("COMMIT");

    return {
      ok: true,
      tenantId,
      slug: finalSlug
    };
  } catch (error) {
    await client.query("ROLLBACK");

    const message =
      error instanceof Error
        ? error.message
        : "Bootstrap failed while writing the tenant records.";

    return { ok: false, message };
  } finally {
    client.release();
  }
}
