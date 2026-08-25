# Production Manager V26.08.25.03

## V26.08.25.03
- Added native inline preview parsing for Microsoft Outlook `.msg` email files when attaching correspondence to an enquiry.
- `.msg` files now extract and save the email subject, sender, recipients, sent/delivery date and readable body text, matching the existing `.eml` inline preview workflow.
- The parser runs locally in the browser and reads the Outlook Compound File / MSG property streams directly, so no external email-conversion service or extra package is required.
- Existing `.msg` enquiry attachments that do not already have saved preview metadata are also parsed on demand when the enquiry is opened.
- Updated both new-enquiry attachment flows and existing-enquiry correspondence uploads to explicitly accept Outlook `.msg` MIME types.
- If an unusual/corrupt `.msg` cannot be parsed, the original attachment remains available and the UI clearly shows that the inline preview could not be read.

No database migration is required.
