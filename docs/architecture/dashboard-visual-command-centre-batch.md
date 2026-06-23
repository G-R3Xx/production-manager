# Dashboard visual command centre batch

This batch rebuilds the Dashboard into a visual command centre rather than a static landing page.

## Layout

- Top row: urgent action cards
- Middle: enquiry, survey, quote and quote value pipeline charts
- Bottom: recent activity and upcoming/needs-action work

## Data sources

The dashboard reads current tenant data from:

- enquiries
- survey requests
- quote drafts and quote lines
- materials
- clients

## Behaviour

The app still defaults to Enquiries. Dashboard is kept as a useful overview page for managers rather than the primary entry screen.

No new SQL is required.
