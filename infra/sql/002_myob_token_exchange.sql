create schema if not exists integration;

create table if not exists integration.myob_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  token_type varchar(100),
  scope text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists myob_oauth_tokens_tenant_idx
  on integration.myob_oauth_tokens (tenant_id);
