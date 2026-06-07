create table if not exists app.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  myob_uid varchar(255) not null,
  display_name varchar(255) not null,
  company_name varchar(255),
  first_name varchar(120),
  last_name varchar(120),
  email varchar(255),
  phone varchar(80),
  is_active boolean not null default true,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, myob_uid)
);

create index if not exists customers_tenant_idx on app.customers (tenant_id);
create index if not exists customers_tenant_display_idx on app.customers (tenant_id, display_name);
