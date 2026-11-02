# Production Manager V26.11.02.08 — sequential Sub Job entry

Based on **V26.11.02.07**. This release changes only the new quote-line section-selection workflow and its supporting UI, preserving previous quote-line prices, links and assignments.

## New quote-entry workflow

1. Open an overall quote.
2. Above **Create quote line**, enter the name of the first section and choose **+ Start next Sub Job**.
3. The selected/current section updates immediately; the quote-line builder opens automatically after creation.
4. Create as many saved-product or quick/custom quote lines as needed. **All subsequent new lines are assigned to the current (most recently created) section**, including linked dispatch/access items.
5. Enter another section name and choose **+ Start next Sub Job**. Subsequent new lines now go into that section.
6. Repeat for additional sections. The quote remains one document with one total.

The form no longer asks the user to select a Sub Job every time a new line is created. The current section is displayed above and inside the quote builder. Existing lines can still be reassigned from their own section selector. Quote lines created before any section exists are General / Unassigned, and existing unassigned lines are not moved retroactively. Renaming a section preserves all assignments; removing a section preserves its quote lines as General / Unassigned, and the previous section (if any) becomes current. Current section is derived from the persisted section ordering on each page render, not from local browser memory; it is shared for all editors of the same quote.

Creating a section now returns to the **Create quote line** area rather than the Sub Jobs management area, with the builder open. Section management (rename/remove) remains above the builder.

## Changed files

- `apps/web/src/lib/quote-sub-jobs.ts`: current section helper using persisted sort order.
- `apps/web/src/app/(app)/quotes/QuoteLineStartBuilder.tsx`: automatic section assignment for both list and visual catalogue (saved/quick) entries, current-section indication instead of selection dropdown.
- `apps/web/src/app/(app)/quotes/page.tsx`: next-section creation form adjacent to line builder and current section status.
- `apps/web/src/app/(app)/quotes/actions.ts`: return to quote builder after section creation.
- `apps/web/src/app/(app)/layout.tsx`: version updated.
- `scripts/tests/quote-sub-jobs.cjs`: new tests for sequential section selection.

## Deployment and tests

- **No new SQL migration.** Use existing migration `064_quote_sub_jobs.sql` from V26.11.02.06.
- Tested: focused sequential Sub Job scenarios, both quote entry layouts' save wiring, section grouping, linked dispatch/access inheritance, cancelation subtotals, missing historical data, quote-status performance, cost report, pass-through Delivery/Courier pricing, staff layout and certificate alerts.
- Strict standalone TypeScript check passed for the section helper, and syntax/transpilation checks passed on changed TSX/TS files.
- Full monorepo `pnpm typecheck` and browser/live Supabase integration were **not run** here because the source archive does not include installed dependencies or a connected project database. Run these checks in the Windows checkout before deployment.

From the project root, run:

```powershell
pnpm typecheck
```

If it passes, deploy normally. Note that the section selected for subsequent new lines is the **latest section in the current quote**, even if multiple staff edit that quote at the same time. Existing saved lines are unaffected by other staff creating new sections.
