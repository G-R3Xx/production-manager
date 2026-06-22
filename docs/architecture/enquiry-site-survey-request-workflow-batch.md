# Enquiry site survey request workflow batch

## Goal

Make the Enquiries → Site Survey path actually do useful work instead of feeling like a dead link.

## Changes

- Enquiries now have a real **Create site survey request** action.
- The action creates an `app.survey_requests` record directly from the enquiry.
- Existing client/contact/site/request information is copied into the survey request.
- The enquiry status is updated to `survey_requested`.
- If a survey already exists for the enquiry, the user is redirected to the existing survey instead of creating a duplicate.
- Survey cards can now be opened and edited from the Surveys page.
- Survey requests now capture:
  - status
  - due date
  - assigned staff
  - survey brief / notes
  - survey information collected
- Quote creation from a survey now carries both the original survey notes and the collected survey details into the quote draft notes.

## Current intended workflow

1. Create enquiry.
2. Click **Create site survey request**.
3. Open/edit the survey request.
4. Add site measurements, fixing notes, access notes and recommendations.
5. Mark the survey completed.
6. Create quote from the completed survey.

## Database

No new tables or columns are required. This uses the existing:

- `app.enquiries.status`
- `app.survey_requests.notes`
- `app.survey_requests.survey_details`
- `app.survey_requests.status`
- `app.survey_requests.completed_at`
