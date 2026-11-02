# Production Manager V26.11.02.11

Based on V26.11.02.10.

## Fix: remove duplicate Sub Job amounts from client quote section headings

- **Online public quote:** the blue Sub Job heading now contains only the Sub Job name (e.g. **Vehicle Wrap**). The duplicated `Sub Job: $X ex GST · $Y inc GST` text has been removed.
- **Printable online quote:** uses the same cleaned-up heading and preserves the separate Sub Job total row below the quote lines, showing ex-GST, GST and inc-GST totals.
- **Generated quote PDF:** the `SUB JOB` label above a quote line now contains only the section name; the duplicate amounts are no longer embedded in that label. The PDF's existing quote grand totals remain unchanged.
- No pricing, GST calculations, line records, permissions, or other features were changed.
- Version label updated to V26.11.02.11.

## Tests

- `node scripts/tests/quote-sub-job-heading.cjs` **passed**. It checks the exact online heading, confirms the separate totals row remains, and actually generates a quote PDF to verify its heading and overall total.
- `node scripts/tests/quote-sub-jobs.cjs`, `dispatch-pricing.cjs`, `quote-line-quick-actions.cjs` and `quote-status-performance.cjs` **passed**.
- The existing Sub Job test that asserted that duplicate prices should appear in the PDF header was updated to check the heading-only label.
- `ts.transpileModule` syntax checks on edited TS/TSX files **passed**.
- Full monorepo `pnpm typecheck` **not run in this environment** (the source ZIP does not include installed dependencies). Run it locally prior to deployment.

## Deployment

1. Unzip V26.11.02.11 and replace application source, preserving `.env` and local configuration.
2. Run `pnpm typecheck`, deploy, and refresh the online quote.
3. Check **Vehicle Wrap** heading displays only the section name; its total appears only in the separate row beneath its quote lines.
4. No new SQL migration required. Previously required migrations still apply.
