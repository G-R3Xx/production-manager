# Production Manager V26.11.02.12

Based on V26.11.02.11.

## Fixed: internal quote editor heading

The blue Sub Job section heading under **Quote lines** now displays only the Sub Job title (e.g. **Vehicle Wrap**). The repeated line count, ex-GST subtotal and inc-GST total have been removed from the heading as requested.

The **separate Sub Job total bar after the section's quote lines** remains unchanged, including ex GST, GST and inc GST. Client quote/PDF headings are still title-only. No quote pricing or section calculations changed.

## Verification

- Updated `scripts/tests/quote-sub-job-heading.cjs` to ensure the **internal** heading stays title-only as well as the public quote, PDF heading and total bars.
- Sub Job grouping/rounding and linked-line tests passed.
- Other applicable quote-line, quote-status and permission tests passed.
- TSX syntax transpilation checks passed for the edited files.
- **Full `pnpm typecheck` was not run**; the archive does not contain installed dependencies. Run it in your Windows repository before deployment.

## Installation

Replace source with this archive, install/deploy as usual, then verify the quote editor's blue Sub Job header shows just the section name. Clear/reload existing browser tabs after deployment to see the updated render.

**No new SQL migration required.**
