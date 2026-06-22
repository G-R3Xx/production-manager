# Install Scheduler survey photos return batch

This batch extends the Production Manager ↔ Install Scheduler survey bridge so completed site survey photos come back with the survey details.

## Production Manager changes

- The Install Scheduler callback now includes photo links in the generated survey detail text.
- The Surveys page now extracts survey photos from the returned bridge payload.
- Survey request cards show a photo count when survey photos have returned.
- Opening a survey request displays returned photo thumbnails with links to the full Firebase Storage image.
- Annotated survey photos are labelled as annotated.

## Notes

No new SQL is required. Photos are stored in the existing `install_scheduler_payload` JSON field and are also included as URL lines in `survey_details` for quote notes.
