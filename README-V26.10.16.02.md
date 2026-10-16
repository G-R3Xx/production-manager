# Production Manager V26.10.16.02

Australian release date: 16 October 2026.

This hotfix replaces V26.10.16.01.

## Quote entry layouts

- Keeps the existing work-down-the-page **List** quote builder.
- Adds the **Visual catalogue** layout with product graphics, search, filtering and pagination.
- Saved products and Quick / Custom lines open the existing builders in a popup so both layouts share the same pricing and quote-line logic.
- Owners and managers can choose **List** or **Visual catalogue** per user under **Settings → Staff & roles**.
- Existing users default to **List**.

## Database migration — required

Run `infra/sql/051_quote_entry_layout.sql` once in the Supabase SQL Editor before saving a user's Quote layout.

It safely creates:

- `app.memberships.quote_entry_layout`

The migration is idempotent and may be run more than once.

V26.10.16.02 also replaces the raw PostgreSQL "column does not exist" message with a clear migration instruction if the database has not yet been updated.
