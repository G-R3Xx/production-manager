# Production Manager V26.11.02.01 — Confidential Quote Cost Breakdown

**Based on:** V26.10.28.02. Previous multi-contact client/enquiry functionality and machine-save improvements are retained.

## What changed

- **Staff & roles**: owners/managers can enable **Show cost breakdown** on each staff member. Defaults to **off** for everybody, including owners/managers, until specifically enabled in their membership.
- **Quotes**: a separate **Show cost breakdown** button appears next to **Open client quote** when the selected user is enabled. It opens an **internal-only** report; the existing customer quote, quote PDF, and customer email are unchanged.
- **Cost report**: shows each quote line's recorded material/substrate, ink/print, artwork and labour, machine/equipment, consumables and other cost rows. For each saved component it shows its material/machine name, usage, unit, rate, cost per item, cost for the full quoted quantity and any saved usage/pricing notes. The list of selected machines is also shown when saved, even if no separate machine charge was recorded.
- **Commercial analysis**: itemised raw costs, markups, profit multiplier, price-level factor, quote discount, unit selling price, line selling total, estimated gross profit and gross margin. Includes summary by category and quote totals ex GST.
- **Historical accuracy**: **reads the pricing snapshot saved with each line**, not current material/equipment/staff rates. When historical/manual/imported quotes lack itemised costs, or the saved components fail to reconcile with the saved raw cost, the report **flags missing/inconsistent figures** and withholds unreliable aggregate margins instead of inventing costs.
- **Security**: the report is a normal authenticated app route. Direct navigation to `/quotes/<quote-id>/cost-breakdown` checks an active tenant membership **and the permission column on the server every request**, and fetches only quotes belonging to that tenant. Unauthorized requests return 404. No report contents are placed into the public quote, public PDF or email payload.
- **Performance**: the report is computed **only when the internal button is clicked**. Other quote pages fetch just a one-row permission Boolean when a quote is selected; they do not build this report.

## Database migration — REQUIRED

Before saving the new staff setting, run in your Supabase SQL Editor:

`infra/sql/062_quote_cost_breakdown_permission.sql`

The migration is idempotent; creates `app.memberships.quote_cost_breakdown_enabled boolean NOT NULL DEFAULT false`. This flag is workspace-specific, not global to an individual profile. Existing users remain denied unless you enable them.

## How to use

1. Apply migration 062.
2. Deploy the updated application.
3. Open **Staff & roles**; check **Show cost breakdown** for an authorized person; click their row's **Save**.
4. Sign in as that person and open any quote. Click the new **Show cost breakdown** button beside **Open client quote**.

**Important:** These are *estimated quoted production costs*, not actual stock withdrawals, payroll costs, and supplier invoices. Machine and labour rates are whatever was recorded when the quote line was last saved. Old quotes may require resaving their lines to capture detailed component snapshots; do not do that if you need to preserve original historical pricing. Quote line totals already include any applied manual quote discount; this report does not subtract it a second time.

## Tests and limitations

- Strict TypeScript check of the independent report calculation module: **passed**.
- Six cost calculation tests: **passed** (complete quote, missing historical components, unreconciled components, cancelled lines, manual price override, MYOB-matrix pricing).
- TypeScript transpile/syntax checks of all six changed/new TS/TSX files: **passed**.
- Source checks of the permission and server route wiring: **passed**.
- **Full `pnpm typecheck` was not run:** the source ZIP contains no installed workspace dependencies; this execution environment cannot download pnpm/dependencies. Please run `pnpm typecheck` in your Windows development checkout before deploying. A live Supabase and browser integration test were not possible here.

SQL 061 for machine timing remains optional from previous releases. SQL 062 is mandatory for this feature.
