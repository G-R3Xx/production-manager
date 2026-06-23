# Quote review/send + artwork approval workflow

This batch connects the quote calculation flow to the next business steps.

## Added

- Quote review panel on the Quotes page.
- Quote number/status/line totals/response status summary.
- Public client-facing quote link.
- Mark quote as sent.
- Mailto helper for sending the quote link to the client.
- Public quote page at `/public/quotes/[token]`.
- Client responses: accept, request changes, decline.
- In-app artwork approval pack created from a quote.
- Artwork proof pages by URL.
- Public artwork approval page at `/public/artwork-approvals/[token]`.
- Client artwork responses: approve or request changes.

## Notes

This is the first practical quote lifecycle pass. It intentionally uses public links and mailto buttons rather than adding a full email service yet. That keeps the workflow usable immediately while leaving room for later automated email delivery.

The SQL file is:

`infra/sql/020_quote_review_send_artwork_approval_workflow.sql`

The server also creates the needed columns/tables defensively at runtime.
