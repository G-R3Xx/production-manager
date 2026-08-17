# Production Manager V26.08.17.11

## Production artwork control
- Added **Remove artwork file** to a production item's Print-ready artwork panel.
- Removal detaches the print-ready production file only; the approved Artwork Approval proof/revision is retained.
- The Print-ready file attached procedure step is reopened and job status is recalculated automatically.

## Performance pass
- Replaced unconditional app-wide 15-second `router.refresh()` calls with a lightweight 10-second activity pulse. Full server page data refreshes only when relevant quote/artwork/production/notification state actually changes.
- The activity refresh remains paused while a user is editing a field so unsaved form data is preserved.
- Combined notification list + unread-count loading into one database query on every app render.
- Production job detail pages now load the selected job directly instead of fetching every production job, artwork approval, quote, customer, enquiry and step summary first.
- Existing loading skeletons/navigation feedback remain unchanged.

MYOB, Purchasing, quote pricing, Gmail sending, artwork approval and job-sheet workflows are otherwise unchanged.
