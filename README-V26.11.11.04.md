# Production Manager V26.11.11.04

**Base:** V26.11.11.03 · **Date:** 11 November 2026 (Australia)

## Fix: quote-line Rename error

The new inline **Rename → Save name** feature in V26.11.11.03 always returned **“Invalid quote line title request.”** even when the entered name was valid.

**Root cause:** The API route's UUID validation regular expression expected four UUID groups rather than the required five (`8-4-4-4-12` hexadecimal characters). Both `quoteId` and `lineId` are PostgreSQL UUIDs, so all normal requests failed validation with HTTP 400 **before** reaching the database.

**Correction:** `apps/web/src/app/api/quotes/line/title/route.ts` now validates all five UUID groups, matching the existing quick move/delete endpoint. No changes to quote storage, prices, authentication, tenant protection, UI flow or customer-facing output.

**Regression coverage:** `scripts/tests/quote-line-label-api.cjs` invokes the actual compiled API handler with valid quote and line UUIDs and a normal title, then tests reset, malformed inputs, length/control-character validation, blocked cross-site requests, sign-in, workspace and non-editable quote cases.

## Verification

- API regression test: passed (canonical UUIDs now accepted).
- Previous quote-line display-name regression: passed, including generated customer PDF and stable totals.
- 26 of 29 available regression suites passed (including API, quote, PDF, Gantt, material and calendar tests).
- Three older PostgreSQL/browser integration suites could not start because their test dependencies are not installed here.
- Source syntax checks: passed.
- Full application `pnpm typecheck` / live Supabase browser check: **not verified here** because the source ZIP does not include installed project dependencies. Run locally.

## Install

1. Extract V26.11.11.04 into your development checkout, preserving your environment settings.
2. Run `pnpm typecheck`.
3. Deploy, open a draft quote and rename any line (e.g. “Left Hand & Right Hand Windows”).
4. Check the new label in Client Quote and its PDF.

**No SQL migration required.** Existing quote lines and any prior saved overrides remain unchanged.
