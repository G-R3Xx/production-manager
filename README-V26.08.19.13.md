# Production Manager V26.08.19.13

- Fixes the MYOB quote dead end when an accepted quote has no linked Production Manager client.
- Adds a prominent PM client selector directly inside the MYOB order section.
- Suggests an exact PM client match using the quote client name or email.
- Carries the selected client link through the quote, enquiry, survey, canonical Job and Production job records.
- After the PM client is linked, exposes the existing MYOB customer selector and Create in MYOB fallback in the same section.
- Prevents Send to MYOB from appearing until both the PM client and MYOB customer mappings are ready.
