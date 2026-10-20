# Production Manager V26.10.20.06

Australian release date: 20 October 2026.

## Quote email reliability

- Moves client quote email sending out of the quote-page Server Action navigation path and into a dedicated `/api/quotes/email` endpoint.
- Runs the quote-email endpoint in the Node.js runtime, prefers the Sydney region and allows a 60-second execution window for PDF generation, image retrieval and SMTP delivery.
- The email recipient modal now submits in-place. A send/PDF/SMTP failure is shown inside the modal instead of replacing the Production Manager page with a browser load-error screen.
- Successful sends close the modal and return to a clean selected-quote URL, removing stale survey/message query parameters.
- Existing quote-email history, PDF attachment generation, public quote links and one-off recipient override behaviour are retained.
- Adds server logging via `[quote-email-api]` with elapsed time and runtime region for diagnosis.

## Verification

- Updated TypeScript/TSX files passed TypeScript 5.8.3 syntax/transpile diagnostics.
