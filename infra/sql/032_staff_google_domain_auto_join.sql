-- Allow trusted Google email domains to auto-join an existing tenant/workspace.
-- This prevents @tenderedge.com.au staff sign-ins from accidentally creating new blank workspaces.

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

-- Best-effort seed for the Tender Edge workspace. If your tenant slug/name is different,
-- use Settings → Staff Google access and save tenderedge.com.au after deploying.
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
) matched;
