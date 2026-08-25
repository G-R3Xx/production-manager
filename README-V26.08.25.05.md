# Production Manager V26.08.25.05

## V26.08.25.05

- Quote creation now keeps the originating enquiry visible directly on the selected quote, including the enquiry request, client/contact/site details, photos, email previews and other correspondence.
- Added a direct jump back to the matching enquiry record.
- Fixed quote editing being interrupted by live auto-refresh. Opening the Add Quote Line editor or a saved quote-line editor now pauses background refresh until the editor is closed.
- Hardened the global unsaved-form detector so Server Action forms are treated as editable regardless of the browser-reported form method.
- Added an in-editor notice confirming that live refresh is paused while unsaved quote-line selections are being entered.
