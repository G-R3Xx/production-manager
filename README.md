# Production Manager

Fresh rebuild of the Production Manager platform.

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
