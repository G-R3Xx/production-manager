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

Materials are purchased stock from suppliers. Products are sellable items. Product setup happens inside the Products page through product details, components and options. Components consume materials and labour; options drive quoting choices such as finished size, sides, laminate, cello, binding, cover colour, tape colour, duplicate/triplicate copies and copy colours.

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

## Latest rebuild: guided product setup flow

This package includes the guided Products rebuild. Product creation now stays on one clean screen and is organised as:

1. Base product details.
2. Components / materials used by the product.
3. Quote options selected later during quoting.

The Products page now has visible add/edit/remove/reorder controls for components and options, optional editable starter packs, and clearer separation between product setup and quoting. Tax remains GST by default and hidden from product creation.

