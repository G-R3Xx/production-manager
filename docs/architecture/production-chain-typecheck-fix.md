# Production chain typecheck fix

This batch tightens the new Production page/action typings after the first production workflow build.

## Fixes

- Fixed the Production route loading component prop mismatch.
- Added a typed redirect helper for production server actions so tenant checks narrow correctly.
- Tightened selected production item/step array types to avoid readonly fallback tuple errors.
- Added an explicit file input change event type for print-ready uploads.

## No SQL changes

Uses the Production SQL from `infra/sql/024_production_chain_print_ready_checkoff.sql`.
