# Production Manager V26.08.10.07

## Client quote line-by-line responses

- Moved each quote-line price inward to create a dedicated response area at the far right.
- Added per-line **Approve**, **Request changes**, and **Cancel** controls on the public client quote.
- Request changes captures a line-specific note so staff can see exactly what the client wants changed.
- Added persistent per-line client response status, note and response timestamp fields.
- Client-cancelled lines are excluded from the displayed quote subtotal/GST/total.
- The quote automatically becomes accepted when every line has been approved or cancelled and at least one line is approved; all-cancelled quotes become declined; any requested-change line keeps the quote in changes-requested state.
- MYOB export uses only approved lines once line-by-line responses are in use.
- Artwork approval prefill skips client-cancelled quote lines.
- Production Manager saved-line cards now show the client's line status and line-specific note.
- Added `infra/sql/039_quote_line_client_responses.sql`; runtime schema guards also add the columns automatically.
