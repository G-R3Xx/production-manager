# Enquiry correspondence and urgency selector batch

## Summary

This batch adds housekeeping/workflow improvements to the Enquiries page.

## Changes

- Replaced free-text urgency with a dropdown selector: Low, Normal, High, Urgent, Critical.
- Added urgency badges on enquiry cards.
- Added an email correspondence attachment area to each active enquiry.
- Staff can drag/drop or choose saved correspondence files such as `.eml`, `.msg`, PDFs, text files, Word files and screenshots.
- Correspondence files upload directly to Supabase Storage through a signed upload URL before the enquiry record is updated.
- Attached correspondence appears as quick links on the enquiry card.

## Database

Run `infra/sql/026_enquiry_correspondence_attachments.sql` once in Supabase.
