# Production Manager

Production Manager is a multi-tenant production workflow app for print/signage operations.

## Current workflow

The main app workflow is intentionally focused on:

- Clients
- Suppliers
- Materials
- Products
- Quotes
- Integrations

Materials are purchased stock from suppliers. Products are sellable items. Normal product setup happens inside the five-tab Product editor. The Build tab now combines the material, ordered production actions, optional machine/labour resources and customer choices on one page. Technical Production Steps and Manufacturing Methods remain available under Settings for advanced maintenance.

Tax code defaults to `GST` for products and is not shown on product creation.

## Core architecture

- Next.js + React + TypeScript
- Supabase (Postgres, Auth, Storage, selected Realtime)
- Cloud Run workers/services for heavy jobs and integrations
- Cloud Tasks for async dispatch
- Drizzle ORM for schema and migrations
- Multi-tenant SaaS from day one

## Apps

- `apps/web` — main application
- `apps/worker` — Cloud Run integration/worker service

## Packages

- `packages/db` — schema, migrations, db client
- `packages/domain` — business types and contracts
- `packages/ui` — shared UI
- `packages/integrations` — MYOB and external adapters

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

## Latest UI rebuild

- PrintOS-style UI rebuild: production-hub shell, dashboard, quote-card product setup, and collapsed advanced stock/process rows. See `docs/architecture/printos-style-ui-rebuild-batch.md`.
