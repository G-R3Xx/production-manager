# Production Manager V26.11.02.06 — Quote Sub Jobs

**Base version:** V26.11.02.05. This release adds optional quote sections without converting a quote into multiple separate jobs or changing existing quote-line IDs, prices, artwork references or production approvals.

## Feature

- Quotes retain the overall **Job Name**. Beneath it, the new **Sub Jobs** area creates any number of named sections (e.g., `Vehicle 123 Wrap`, `Vehicle 456 Signage`). A section can be renamed or removed. Removing a section keeps its quote lines, moving them to **General / Unassigned**.
- In **both** quote entry layouts (list and visual catalogue), choose **Add line under Sub Job** before creating a saved-product or quick/custom line. This selection is saved with the quote line and inherited by linked Delivery/Courier and access-equipment lines.
- Existing quote lines can be moved between sections using the **Move** selector on each parent line. Child service/dispatch lines move with the parent. Sub Job names and section subtotals appear on the saved-lines screen.
- The customer-facing **online quote** displays section headings and subtotals while retaining per-line approval/changes/cancellation controls. The attached **quote PDF** groups lines by section and shows the section name and subtotal at its first line. Section names are also displayed per line in the restricted internal cost breakdown report.
- The grand total, GST, MYOB connection, quote number and overall Job Name are unchanged. Existing quotes with no sections still render as before. Existing lines without a section are listed as **General / Unassigned** if sections are present.
- A Sub Job is a **quote section**, not a separately scheduled production job or a separate MYOB order. Production continues to use the existing individual quote lines and artwork references.

## REQUIRED deployment order

1. Open **Supabase SQL Editor** and execute **`infra/sql/064_quote_sub_jobs.sql`** **before deploying** the code. This creates the `sales.quote_sub_jobs` table and its quote/ordering index. It does **not** rewrite existing quotes, lines, pricing or production data.
2. Deploy the source in `Production-Manager-V26.11.02.06.zip` (the ZIP also contains the migration).
3. Run `pnpm typecheck` and your normal build/CI process on your machine before production deployment.
4. In Quotes, open a draft, add two Sub Jobs, assign lines in each, and verify section totals in **Quote lines**, **Client Quote** and the emailed PDF. Check the result in both user quote-entry layouts.
5. Test editing a line, moving it to another section, and removing a section: all original quote lines, pricing, linked dispatch/access items and approvals should remain intact.

## Local verification completed

- Passed standalone strict TypeScript check for the new section-grouping helper (`tsc --strict --target es2022 --module esnext --moduleResolution bundler --noEmit ...`).
- Passed TS/TSX syntax transpilation of all changed modules.
- Passed `scripts/tests/quote-sub-jobs.cjs`: section sorting/grouping, parent-child inheritance, cancelled-line subtotal exclusion, unassigned and legacy lines, both builders, SQL authorisation wiring and PDF section-label wiring.
- Passed pre-existing tests: `staff-certificates.cjs`, `staff-responsive-layout.cjs`, `quote-cost-access.cjs`, `quote-status-performance.cjs`, `dispatch-pricing.cjs`, `quote-cost-report.cjs`.

**Not verified here:** a full monorepo `pnpm typecheck` / production build, live Supabase SQL migration, or browser/PDF integration against a real tenant. The source ZIP does not contain installed workspace dependencies and this environment has no connected live Supabase database. Do not interpret the syntax checks as a full typecheck.

**Performance:** the quote page adds one small, quote-scoped indexed query for its section titles; the existing lightweight quote-status polling is retained. No new frequent polling was introduced.
