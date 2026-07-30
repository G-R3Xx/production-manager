# Production Manager V26.07.30.02

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

Materials are purchased stock from suppliers. Products are reusable internal quote and production templates. Normal product setup starts in the default **Guided builder**, where staff move through a Quick Quote-style client-side builder for substrate, normal size and quantity, print method, finishing and fulfilment without a page reload between steps. Production Manager creates the technical recipe and standard quote fields in the background. Machine, labour, Production Step and Manufacturing Method maintenance remains under Settings for advanced use. WordPress publishing is optional and is not required for quoting or production.

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
