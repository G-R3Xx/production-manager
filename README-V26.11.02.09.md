# Production Manager V26.11.02.09 — Sub Job quote totals

Based on **V26.11.02.08**, retaining sequential Sub Job entry and all previous functions.

## What's changed

Each Sub Job now displays its own financial total, separately from the overall quote:

- **Sub Job subtotal (ex GST)** — the sum of active quote lines in that section.
- **Sub Job GST (10%)** — allocated to cents across sections so the displayed tax figures reconcile to the quote's overall GST.
- **Sub Job total (inc GST)** — subtotal plus that section's GST.

The **Quotes** editor displays these totals alongside Sub Jobs in the section-management list, at the section heading, and in a clear **Sub Job total** strip after its final quote line. The **online client quote** shows the same totals after the last line of each section; the client-facing PDF displays the section ex-GST and inc-GST amounts in its section heading. The existing overall quote total remains unchanged.

Only active quote line values contribute to each section's total. Cancelled lines contribute $0. The public quote and PDF continue to omit cancelled, excluded and not-yet-configured lines. Linked Delivery/Courier and access-equipment items continue to contribute to their assigned Sub Job. Historical unassigned lines appear in **General / Unassigned** if any exist.

The feature computes totals from already saved line prices; it does not apply markup or change prices, discounts, job assignments, quote numbering or MYOB orders. No new database columns or SQL are required.

## Changed files

- `apps/web/src/lib/quote-sub-jobs.ts`: GST and inc-GST totals per section, with deterministic cents allocation and preserved line grouping.
- `apps/web/src/app/(app)/quotes/page.tsx`: section totals in the editor and at the end of each section.
- `apps/web/src/app/public/quotes/[token]/page.tsx`: section totals in the online client quote and browser print view.
- `apps/web/src/server/quote-pdf.ts`: include Sub Job total inc GST in the section heading.
- `apps/web/src/app/(app)/layout.tsx`: version label.
- `scripts/tests/quote-sub-jobs.cjs`: section-tax, cancellation, negative credit, reconciliation and output checks.

## Verification

Passed here:

- `node scripts/tests/quote-sub-jobs.cjs` (including line assignment, inheritance and total reconciliation)
- `node scripts/tests/quote-status-performance.cjs`
- `node scripts/tests/dispatch-pricing.cjs`
- `node scripts/tests/quote-cost-report.cjs`
- `node scripts/tests/quote-cost-access.cjs`
- `node scripts/tests/staff-certificates.cjs`
- `node scripts/tests/staff-responsive-layout.cjs`
- `tsc --noEmit --strict --skipLibCheck --target ES2022 --module CommonJS apps/web/src/lib/quote-sub-jobs.ts`
- TypeScript/TSX syntax/transpilation on changed files

**Full `pnpm typecheck` and live browser/database PDF visual checks were not performed here**, because the source ZIP has no installed workspace dependencies or live Supabase connection. Run `pnpm typecheck` in your normal Windows checkout and inspect one multi-section quote and its PDF before deploying to staff.

**SQL:** None. Existing migration 064 is sufficient.
