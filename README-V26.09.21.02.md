# Production Manager V26.09.21.02

Australian release date: 21 September 2026.

This hotfix replaces V26.09.21.01.

## Fixes

- Prevents dashboard and other Server Component renders from failing while the new staff labour-rate database field is awaiting migration.
- Prevents company and quote reads from failing while the new profit-tier or email-history field is awaiting migration.
- Makes the optional weather endpoint return a normal unavailable state instead of HTTP 500/502 when company settings or Open-Meteo cannot be reached.
- Keeps the Canberra time display available when weather data is unavailable.
- Preserves existing quote email sending if email-history storage has not been migrated yet.

## Required database migration

Run `infra/sql/049_quote_pricing_staff_email_history.sql` once in the Supabase SQL Editor. It is idempotent and creates:

- `app.tenant_settings.profit_tiers_json`
- `app.memberships.quote_labour_rate`
- `sales.quote_drafts.email_history_json`

The app remains readable if deployment completes before the migration, but the migration is required to save and retain the new profit tiers, individual staff labour rates and quote email history.

## Verification

- TypeScript typecheck completed successfully.
- Next.js production build completed successfully.
