# Production Manager V26.11.11.06

**Base:** V26.11.11.05 | **Date:** 11 November 2026 (Australia)

## Fix: typing a quote-line display name must not expand its full editor

**Reported issue:** While typing into **Rename**, the entire quote-line configuration editor expanded or collapsed in response to keystrokes (especially spaces), even though clicking the Rename/Save/Cancel controls had previously been protected.

**Cause:** The Rename input was still a descendant of the native HTML `<summary>` element that toggles the surrounding `<details>`. Preventing the click event did not reliably prevent keyboard activation or native browser behaviour.

**Correction:**

- Move the **QuoteLineLabelEditor** into a plain, separate title row *outside* the native `<details>/<summary>` pair. The full-line details keep their own independently operable **View / edit** summary.
- Keep line summary, quantity, markup, profit, Sub Job, Move/Delete, and expanded quote-line configuration intact under the details element.
- Remove the old click shield on the name-input wrapper; it was no longer needed and could also interfere with input focus/caret placement.
- Preserve the existing inline API save, the current price/cost values, material identity, client titles and PDF output.

## Changed source files

- `apps/web/src/app/(app)/quotes/page.tsx` — dedicated title row outside the `<details>` element.
- `apps/web/src/app/(app)/quotes/QuoteLineLabelEditor.tsx` — remove no-longer-needed input click cancellation.
- `apps/web/src/app/(app)/layout.tsx` — update visible version to V26.11.11.06.
- `scripts/tests/quote-line-label-summary.cjs` — verify the input is not nested under `<details>/<summary>` in the TSX parse tree and simulate typing all characters including spaces.

## Checks completed

- **15 quote/material/enquiry regression suites passed**, including label API, generated PDF, quote sections, pricing, add-ons and MYOB recovery.
- TypeScript/TSX **syntax transpilation** passed for changed components.
- **Chromium DOM smoke test** passed: entering `Left Hand & Right Hand Windows` with spaces does not open the collapsed details panel; **View / edit** still opens it. This used a representative DOM layout, not the deployed Next.js application.
- Release ZIP contents, integrity and SHA-256 checked.

**Outstanding:** Full workspace `pnpm typecheck` and end-to-end testing against your live app/database. This source ZIP excludes `node_modules`, so the full monorepo typecheck was not run here.

## Install

1. Extract the updated ZIP over your existing checkout, keeping local `.env` files and credentials.
2. Run `pnpm typecheck`.
3. Deploy and try **Rename** on a collapsed draft quote line. Enter text including spaces; the full edit panel should stay collapsed while you type and when you save.
4. Use **View / edit** to open full configuration intentionally.

**SQL migration:** None.
