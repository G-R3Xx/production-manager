# Production Manager V26.11.11.03

**Base:** V26.11.11.02 · **Date:** 11 November 2026 (Australia)

## Quote-line display-name override

Each saved quote line has a small **Rename** control beside its title in the internal Quotes editor. For example, two lines using the same *2 Year Print White* material can be displayed as **Chisholm — Window Graphics** and **Kambah — Window Graphics**.

- Click **Rename**, enter the new title, then **Save name** (or press Enter). No entire-page reload or global save overlay is used.
- **Cancel** discards changes; **Reset** restores the original product name.
- The override is individual to the quote line, is retained if its product options or quantity are edited later, and is shown in the customer-facing online quote and generated client quote PDF.
- This changes **only the displayed quote-line title**. The original `product_name`, product ID, materials, labour, equipment, pricing, quantities, markup, Sub Job assignment, artwork configuration and totals remain intact. The quote line's existing internal production identity is not renamed.
- The title can be up to **200 characters** on one line. Renaming is disabled on deleted or accepted quotes to avoid silently altering a finalised client quote.
- All previous V26.11.11.02 quote section behaviour and Gantt performance fixes remain intact.

## Data/storage

Uses the existing `sales.quote_lines.configuration_snapshot` JSONB property `quoteLineTitleOverride`. No new tables or migration.

The fast tenant-scoped endpoint `/api/quotes/line/title` changes only that property and line `updated_at`. Existing full-line update and bundle-save SQL preserve the override during later line edits. There is no change to `product_name` or `unit_price`.

## Updated source

- `apps/web/src/lib/quote-line-label.ts` — optional display title helper.
- `apps/web/src/app/(app)/quotes/QuoteLineLabelEditor.tsx` — inline rename/reset UI.
- `apps/web/src/app/(app)/quotes/page.tsx` — render the per-line editable label.
- `apps/web/src/app/api/quotes/line/title/route.ts` — authorised label-only API.
- `apps/web/src/server/quotes.ts` — tenant-scoped JSONB update and protection from overwrite on full line saves.
- `apps/web/src/app/public/quotes/[token]/page.tsx` — honour override on online quote.
- `apps/web/src/server/quote-pdf.ts` — honour override in client quote PDF.
- `apps/web/src/app/(app)/layout.tsx` — version updated.
- `scripts/tests/quote-line-label.cjs` — new regression tests.
- `scripts/tests/quote-sub-job-heading.cjs` — existing PDF test updated for helper import.

## Verification

- New label tests passed: independent labels, reset, fallback, tenant protection, preservation on full edits, React/API syntax, online quote wiring, PDF rendering and preserved totals.
- 23 available regression suites passed (quotes, projects/Gantt, calendar, materials and other flows).
- 2 unrelated machine suites could not start due to missing `@electric-sql/pglite` / `playwright`.
- Strict TypeScript check passed for the shared label helper and an isolated TypeScript/JSX check passed for the new editor component. TypeScript syntax checks passed for changed application files.
- **Full monorepo `pnpm typecheck` and a live authenticated browser test are not verified** in this source-only environment. Run locally before deployment.

## Install

1. Extract the full source ZIP over your development checkout (back up or commit local changes first).
2. Run `pnpm typecheck` and any local deployment checks.
3. Deploy as normal. **No SQL migration required.**
4. Open Quotes → select a draft quote → find a line → **Rename** → Save name → open Client Quote / generate PDF to verify.
