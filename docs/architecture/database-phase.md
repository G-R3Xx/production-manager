# Database phase

This phase introduces:

- a root `drizzle.config.ts`
- direct SQL bootstrap script for first schema apply
- shared tenant query helpers in `packages/db`
- active tenant resolution from authenticated user id

## Why both SQL and Drizzle now?

For the first pass, the fastest route is:

1. apply `infra/sql/001_init.sql`
2. verify bootstrap can create tenant + membership rows
3. then start using generated Drizzle migrations as the schema evolves

That avoids blocking the first working auth/bootstrap flow while still standardising on Drizzle for the ongoing schema lifecycle.
