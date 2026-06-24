# Enquiry intake correspondence and client prefill batch

## Purpose

Improve the new enquiry intake flow so staff can attach the email/request correspondence while creating the enquiry, not only after it exists.

## Changes

- Replaced the static new enquiry form with a client-aware intake form.
- Selecting an existing client now prefills:
  - client / business name
  - contact name
  - phone
  - email
  - default site address, falling back to billing address
- Prefilled fields remain editable before creating the enquiry.
- Added an email correspondence drop zone directly inside the new enquiry form.
- Pending correspondence uploads directly to Supabase Storage before the enquiry is created.
- When the enquiry is submitted, uploaded pending correspondence is attached to the newly created enquiry record.
- Existing enquiry cards still keep their correspondence drop zone for attaching follow-up email trails later.
- Urgency remains a dropdown selector.

## Upload flow

1. Staff drag an email/message/PDF/screenshot into the new enquiry form.
2. Browser requests a signed upload URL from `/api/enquiries/intake-correspondence-upload-sign`.
3. File uploads directly to Supabase Storage.
4. Hidden form fields carry the uploaded file details into `createEnquiryAction`.
5. After the enquiry row is created, the correspondence record is attached to that enquiry.

No database change is required beyond the existing enquiry correspondence table.
