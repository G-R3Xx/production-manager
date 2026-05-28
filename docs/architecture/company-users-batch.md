# Company + Users batch

This batch layers real tenant-aware pages onto the working auth/bootstrap foundation.

Included:
- Company settings page backed by `app.tenant_settings`
- Users page backed by tenant memberships and `app.user_profiles`
- Tenant-aware dashboard summary
- Sidebar tenant switcher and sign-out
- Drizzle schema-aware DB client
- `drizzle-orm` dependency added to the web app

Apply this over the working project state where:
- Supabase auth is working
- workspace bootstrap has already been confirmed
- `.env.local` is already configured in `apps/web/.env.local`
