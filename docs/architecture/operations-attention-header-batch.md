# Operations attention header

## Goal
Use the otherwise-empty application header space to surface the next operational action without duplicating the full Alerts popover or adding another large dashboard card.

## Behaviour
- Client component: `OperationsAttentionBar`.
- Data endpoint: `GET /api/operations-attention`.
- Data is fetched after mount, every 60 seconds, and again when the window regains focus so it cannot slow initial page rendering.
- Priority order is overdue → changes requested → due today → artwork approved → new enquiry → quote required → invoice required.
- Job navigation uses the canonical `app.jobs.current_href` value, so the call to action opens the current workflow screen rather than a generic alerts page.
- Effective due dates prefer the current process assignment due date, matching the dashboard behaviour.
- Today counts include current job processes due today plus open manual tasks due today. Install count uses the dispatch assignment date for jobs whose dispatch type is `install`.
- Latest alert uses the most recent notification returned by the existing notification store and normalises quote links to the current quote selection URL format.

## Performance
The header is intentionally client-loaded. It reuses existing indexed job/task/assignment/notification reads and does not add work to server-side page rendering.
