# Production Manager V26.11.11.05

**Base:** V26.11.11.04 · **Date:** 11 November 2026 (Australia)

## Fix: renaming a quote line must not expand its full editor

**Reported behaviour:** After clicking **Rename** and changing a quote-line display label, using **Save name** expanded the entire quote-line configuration editor. The same could occur on **Cancel** or **Reset**.

**Cause:** The inline label controls are inside a native HTML `<summary>` element (which controls opening/closing its parent `<details>`). The Rename button cancelled that native action, but the Save/Cancel/Reset controls only stopped click propagation. Stopping propagation alone does not cancel `<summary>`'s default toggle action.

**Correction:** The label editor now explicitly cancels the native `<summary>` click action for its editing subtree and each Save/Cancel/Reset control. Rename remains an inline, label-only operation; the quote-line details stay in their current open/closed state, and **View / edit** continues to operate normally.

There are **no changes** to title storage, quote-line pricing, materials, cost calculation, Sub Job assignments, customer quote/PDF output or the API endpoint. No automatic page refresh or global save overlay is introduced.

## Files changed

- `apps/web/src/app/(app)/quotes/QuoteLineLabelEditor.tsx` — stop native details toggling for label editing.
- `apps/web/src/app/(app)/layout.tsx` — update visible app version.
- `scripts/tests/quote-line-label-summary.cjs` — regression test for Rename, Save, Cancel, Reset, and editor click shielding.

## Verification

- New inline-label interaction test: passed.
- Existing quote-line title storage/API/PDF tests: passed.
- 16 selected tests for quote lines, Sub Jobs, pricing, material add-ons, and enquiry layout: passed.
- TypeScript/TSX syntax checks of affected source: passed.
- Release ZIP integrity and SHA-256: verified.
- Full monorepo `pnpm typecheck` and live-browser validation: **not performed** here because the source ZIP has no installed workspace dependencies.

## Install / test

1. Extract V26.11.11.05 into the development checkout, preserving your local `.env` settings.
2. Run `pnpm typecheck` before deployment.
3. Open a draft quote with a collapsed quote line.
4. Click **Rename**, enter a display label and choose **Save name**. The label should change **without opening** the full Quote Line editor.
5. Test **Cancel**, **Reset** (if an override exists), and **View / edit** independently.

**SQL migration:** None. The most recent database schema remains unchanged.
