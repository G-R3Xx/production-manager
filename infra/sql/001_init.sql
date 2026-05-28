CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS catalog;

DO $$ BEGIN
  CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE global_role AS ENUM ('platform_admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tenant_role AS ENUM ('owner', 'manager', 'staff', 'sales', 'installer', 'accounts');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM ('active', 'invited', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'approved', 'declined', 'expired', 'converted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE department AS ENUM ('signage', 'small_format', 'installation', 'general');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE product_family AS ENUM (
    'rigid_signage',
    'roll_media',
    'banners',
    'stickers_labels',
    'window_wall_graphics',
    'vehicle_graphics',
    'display_products',
    'small_format_print'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('draft', 'active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE calculator_type AS ENUM ('configurator_template');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE material_type AS ENUM (
    'sheet_media',
    'roll_media',
    'roll_laminate',
    'card_stock',
    'paper_stock',
    'cello_stock',
    'binding',
    'finishing',
    'fixing',
    'item',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE template_status AS ENUM ('draft', 'active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(120) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  status tenant_status NOT NULL DEFAULT 'active',
  timezone varchar(100) NOT NULL DEFAULT 'Australia/Sydney',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE,
  full_name varchar(200) NOT NULL,
  short_name varchar(50) NOT NULL,
  email varchar(255) NOT NULL,
  global_role global_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  user_profile_id uuid NOT NULL REFERENCES app.user_profiles(id) ON DELETE CASCADE,
  tenant_role tenant_role NOT NULL,
  status membership_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_profile_id)
);

CREATE TABLE IF NOT EXISTS app.tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE CASCADE,
  company_legal_name varchar(200),
  trading_name varchar(200),
  abn varchar(50),
  phone varchar(50),
  email varchar(255),
  address text,
  default_currency varchar(3) NOT NULL DEFAULT 'AUD',
  quote_terms text,
  proof_terms text,
  job_terms text,
  myob_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  quote_number varchar(50) NOT NULL,
  customer_id uuid,
  status quote_status NOT NULL DEFAULT 'draft',
  title varchar(200),
  attention_name varchar(200),
  site_address text,
  valid_until timestamptz,
  requested_install_date timestamptz,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_total numeric(12,2) NOT NULL DEFAULT 0,
  grand_total numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES app.quotes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  product_id uuid,
  qty numeric(12,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  cost_total numeric(12,2) NOT NULL DEFAULT 0,
  display_title varchar(255) NOT NULL,
  display_subtitle text,
  selection_summary text NOT NULL,
  configurator_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  sku varchar(100),
  name varchar(200) NOT NULL,
  department department NOT NULL,
  product_family product_family NOT NULL,
  status product_status NOT NULL DEFAULT 'draft',
  calculator_type calculator_type NOT NULL DEFAULT 'configurator_template',
  default_template_id uuid,
  tax_code varchar(50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.configurator_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  department department NOT NULL,
  product_family product_family NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status template_status NOT NULL DEFAULT 'draft',
  definition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  constraints_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  type material_type NOT NULL,
  name varchar(200) NOT NULL,
  supplier_id uuid,
  stock_uom varchar(20) NOT NULL,
  purchase_uom varchar(20) NOT NULL,
  purchase_to_stock_factor numeric(12,4) NOT NULL DEFAULT 1,
  width_mm integer,
  height_mm integer,
  depth_microns integer,
  gsm integer,
  finish varchar(100),
  cost_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_profile_id ON app.memberships(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_id ON app.memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant_id ON app.quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quote_lines_quote_id ON app.quote_lines(quote_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON catalog.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_configurator_templates_tenant_id ON catalog.configurator_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_materials_tenant_id ON catalog.materials(tenant_id);


do $$
begin
  if not exists (select 1 from pg_type where typname = 'myob_environment') then
    create type myob_environment as enum ('sandbox', 'live');
  end if;
  if not exists (select 1 from pg_type where typname = 'myob_connection_status') then
    create type myob_connection_status as enum ('disconnected', 'connected', 'error');
  end if;
  if not exists (select 1 from pg_type where typname = 'integration_system') then
    create type integration_system as enum ('myob');
  end if;
  if not exists (select 1 from pg_type where typname = 'external_entity_type') then
    create type external_entity_type as enum ('customer', 'supplier', 'product', 'invoice', 'tax_code', 'account', 'quote', 'order');
  end if;
  if not exists (select 1 from pg_type where typname = 'sync_state') then
    create type sync_state as enum ('pending', 'synced', 'stale', 'error');
  end if;
  if not exists (select 1 from pg_type where typname = 'sync_run_job_type') then
    create type sync_run_job_type as enum ('full_import', 'incremental_import', 'push_customers', 'push_products', 'push_invoices', 'reconcile');
  end if;
  if not exists (select 1 from pg_type where typname = 'sync_run_status') then
    create type sync_run_status as enum ('queued', 'running', 'success', 'error');
  end if;
end $$;

create table if not exists integration.myob_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  environment myob_environment not null default 'sandbox',
  company_file_id varchar(255),
  company_name varchar(255),
  status myob_connection_status not null default 'disconnected',
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_successful_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists myob_connections_tenant_idx on integration.myob_connections (tenant_id);

create table if not exists integration.external_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  system integration_system not null default 'myob',
  entity_type external_entity_type not null,
  local_id uuid not null,
  external_id varchar(255) not null,
  sync_state sync_state not null default 'pending',
  last_synced_at timestamptz,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_mappings_tenant_idx on integration.external_mappings (tenant_id);

create table if not exists integration.sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  integration_name integration_system not null default 'myob',
  job_type sync_run_job_type not null,
  status sync_run_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  summary_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sync_runs_tenant_idx on integration.sync_runs (tenant_id);
