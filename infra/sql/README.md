# Database bootstrap

## First local database apply

You can apply the initial SQL directly against Postgres before moving to generated Drizzle migrations.

### Option A — psql

```bash
psql "$DATABASE_URL" -f infra/sql/001_init.sql
```

### Option B — Supabase SQL editor

Paste the contents of `infra/sql/001_init.sql` into the SQL editor and run it.

## Drizzle workflow

Generate migrations:

```bash
pnpm db:generate
```

Apply migrations:

```bash
pnpm db:migrate
```

Open Drizzle Studio:

```bash
pnpm db:studio
```

- `002_myob_token_exchange.sql` — adds tenant-scoped MYOB OAuth token storage for token exchange + callback persistence.

- 014_suppliers_legacy_columns_fix.sql — repair migration for older app.suppliers tables missing contact/email/phone/status/notes fields.

- `038_wordpress_product_publishing.sql` — adds website publishing fields to products, tenant-scoped WordPress API connections, and idempotent WooCommerce order tracking.

- `039_quote_line_client_responses.sql` — adds persistent per-line client quote response status, notes and timestamps for approve/change/cancel workflows.
