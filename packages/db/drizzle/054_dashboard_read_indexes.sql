-- Dashboard read-path indexes. These are intentionally narrow and support the
-- active-job snapshot introduced in V26.10.21.02.
CREATE INDEX IF NOT EXISTS memberships_tenant_status_profile_idx
  ON app.memberships (tenant_id, status, user_profile_id);

CREATE INDEX IF NOT EXISTS customers_tenant_updated_idx
  ON app.customers (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS quote_lines_dashboard_parent_idx
  ON sales.quote_lines (quote_id)
  WHERE COALESCE(configuration_snapshot ->> 'parentLineId', '') = ''
    AND COALESCE(client_response_status, 'pending') <> 'cancelled';
