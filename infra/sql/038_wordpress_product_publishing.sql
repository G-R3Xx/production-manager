ALTER TABLE catalog.products
  ADD COLUMN IF NOT EXISTS production_recipe_id uuid REFERENCES catalog.production_recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS website_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS website_mode varchar(30) NOT NULL DEFAULT 'quote_only',
  ADD COLUMN IF NOT EXISTS website_slug varchar(200),
  ADD COLUMN IF NOT EXISTS website_category varchar(200),
  ADD COLUMN IF NOT EXISTS website_short_description text,
  ADD COLUMN IF NOT EXISTS website_description text,
  ADD COLUMN IF NOT EXISTS website_image_url text,
  ADD COLUMN IF NOT EXISTS website_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS website_sync_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS website_published_at timestamptz;

CREATE INDEX IF NOT EXISTS products_website_catalog_idx
  ON catalog.products (tenant_id, website_enabled, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS integration.wordpress_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES app.tenants(id) ON DELETE CASCADE,
  site_url text,
  api_key text NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'connected',
  last_catalog_pull_at timestamptz,
  last_order_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wordpress_connections_api_key_idx
  ON integration.wordpress_connections (api_key);

CREATE TABLE IF NOT EXISTS integration.wordpress_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  external_order_id varchar(160) NOT NULL,
  quote_id uuid REFERENCES sales.quote_drafts(id) ON DELETE SET NULL,
  order_status varchar(60),
  order_total numeric(14,2),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_order_id)
);
