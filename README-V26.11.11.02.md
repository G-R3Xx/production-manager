# Production Manager V26.11.11.02

Based on V26.11.11.01. Code-only repair for quote lines being saved under **General / Unassigned** after creating a new Sub Job (for example, **Kambah**).

## What changed

- **New quote lines follow the latest saved Sub Job.** The server now obtains the newest authorised quote section at save time and applies it to new lines, rather than trusting a possibly stale hidden field from a previously opened builder.
- **Linked charges follow the same section.** Associated Delivery, Courier and access-equipment lines inherit the resolved section from the parent quote line.
- **Existing lines stay in their sections when edited.** Changing an existing Chisholm line after starting Kambah does not move it to Kambah. The existing **Move** control remains the way to reassign an existing line.
- **Both quote builders refresh their section context.** The new-line builder remounts when the quote's active section changes, covering both the Saved Product and Quick/Custom/Catalogue workflows.
- The extra section lookup reuses the existing database connection, is tenant/membership scoped and runs only for **new** lines. No new database connection or full-page refresh was introduced by this fix.

## Already-saved General lines

This fix does **not** relocate previously saved lines, as some may intentionally be under General / Unassigned. Use the line's **Move** dropdown to place the two existing lines into **Kambah**. Newly created lines will automatically be put into the newest section.

## Deployment

1. Replace the source files with V26.11.11.02.
2. Run `pnpm typecheck` in the Windows project checkout before deployment.
3. Deploy and test a quote: create a new Sub Job (Kambah), add a Quick/Custom line and a Saved Product line, verify both appear under Kambah. Then add another section and repeat.

**No SQL migration required.** Existing Sub Job migration 064 must already be applied.

## Verification carried out in the source-only environment

- New automated test `scripts/tests/quote-sub-job-save-default.cjs` passes: stale/empty form section, authoritative new-section selection, linked dispatch/access inheritance, existing-line edits, tenant scoping and both builder paths.
- Existing Sub Job grouping and client/PDF heading regression tests pass.
- 23 available regression suites passed in total, covering quotes, materials, Projects, Calendar, Enquiries, Staff and related workflows.
- Global strict TypeScript check of the pure quote Sub Job helper passed; changed TypeScript and TSX files have no parser errors.
- Full monorepo `pnpm typecheck` is **not verified** here because this source-only archive does not contain installed Next.js/React dependencies.
- Live Supabase/database and browser verification are **not verified** here; those tests must be performed in the deployed environment.

This fix does not change prices, quote totals, client PDFs, production links or MYOB integration.
