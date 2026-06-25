# Enquiry optional client logo batch

This build lets staff add an optional client logo while creating a new enquiry.

## Changes

- Added `client_logo_url` and `client_logo_storage_path` to `app.enquiries`.
- Added an optional client logo upload / logo URL section to the New enquiry form.
- Uploaded enquiry logos are stored in the existing public `client-assets` bucket under the tenant/enquiry path.
- Enquiry cards now prefer the enquiry logo, then fall back to the linked client logo, then initials.
- Survey requests, quotes, artwork approvals, production jobs, dashboard activity and public quote/proof pages can now display the enquiry logo for new/unlinked clients.
- Install Scheduler survey jobs receive the enquiry logo when created from an enquiry.
