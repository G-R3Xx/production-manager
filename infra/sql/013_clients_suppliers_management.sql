create table if not exists app.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  myob_uid varchar(255),
  display_name varchar(255) not null,
  contact_name varchar(255),
  email varchar(255),
  phone varchar(80),
  is_active boolean not null default true,
  notes text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_tenant_myob_uid_idx
  on app.suppliers (tenant_id, myob_uid)
  where myob_uid is not null;

create index if not exists suppliers_tenant_display_name_idx
  on app.suppliers (tenant_id, display_name);
