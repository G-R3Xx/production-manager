# Production Manager V26.08.18.02

Typecheck hotfix for the redesigned printable job sheet.

- Uses the existing `ProductionStepRecord.checkedAt` completion timestamp when rendering procedure checkboxes.
- Removes the invalid `completedAt` reference introduced in V26.08.18.01.
- No production workflow, pricing, MYOB, artwork, email, website, or job-sheet layout behaviour changed.
