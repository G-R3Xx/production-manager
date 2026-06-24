# Enquiry inline email preview batch

## Summary
- Added visible correspondence cards inside each enquiry instead of filename-only chips.
- `.eml` email uploads are parsed on attach/create and store subject, from, to, date and a readable body preview against the enquiry correspondence record.
- Existing `.eml` / text correspondence with no saved preview attempts a browser-side inline preview from the stored file URL.
- Image attachments show a visual preview card, while PDFs retain a clear original-file open link.

## Files changed
- `apps/web/src/app/(app)/enquiries/page.tsx`
- `apps/web/src/app/(app)/enquiries/EnquiryCorrespondencePreview.tsx`
- `apps/web/src/app/(app)/enquiries/EnquiryCorrespondenceDropzone.tsx`
- `apps/web/src/app/(app)/enquiries/NewEnquiryForm.tsx`
- `apps/web/src/app/(app)/enquiries/emailPreview.ts`
- `apps/web/src/app/(app)/enquiries/actions.ts`
- `apps/web/src/server/enquiries.ts`
- `infra/sql/026_enquiry_correspondence_attachments.sql`

## Behaviour
- Email correspondence attached during enquiry creation or after enquiry creation is now readable directly on the enquiry card.
- The original uploaded file remains attached and can still be opened.
- If an older attachment has no stored preview, the enquiry page tries to load and parse it client-side.
- `.msg` files remain stored/openable as originals; browser-side readable preview is best for `.eml` files.
