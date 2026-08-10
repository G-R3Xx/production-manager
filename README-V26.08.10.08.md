# Production Manager V26.08.10.08

## Faster client quote line responses

- Quote line Approve / Cancel / Request changes controls now use optimistic client-side updates.
- Clicking a response no longer redirects or reloads the full public quote page.
- The selected line changes state immediately and shows a small Saving/Saved indicator while the server persists the response.
- Quote subtotal, GST and total update live after the save returns, without reloading the quote.
- Final accepted-quote artwork pack creation runs after the response so it does not hold up the client interaction.
- Quote lifecycle and line-response schema checks are cached per server process so repeated responses do not repeatedly execute ALTER TABLE / CREATE INDEX checks.
