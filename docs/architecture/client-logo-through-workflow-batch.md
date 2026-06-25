# Client Logo Through Workflow Batch

## Purpose
Make client identity easier to recognise as work moves through Production Manager.

## Changes
- Added a shared `ClientLogoBadge` component.
  - Shows the client logo when the client record has one.
  - Falls back to client initials when no logo is saved.
- Enquiries now use the shared client logo/initial badge.
- Survey requests now show the client badge on:
  - source enquiry preview
  - survey request cards
- Quotes now show the client badge on:
  - survey/source cards
  - linked client card
  - quote switcher cards
  - selected quote header
- Artwork approvals now show the client badge on:
  - approval switcher cards
  - imported quote/client details
  - selected approval header
  - proof preview client sidebar
- Public artwork approval pages now also show the client badge in the header and proof sidebar.
- Production now shows the client badge on:
  - production job cards
  - approved artwork ready-to-start cards
  - selected production job header
- Dashboard recent activity and upcoming work lists now use client badges where the record is linked to a client.

## Notes
This does not require a database migration. Existing workflow records already carry either `linked_customer_id` or a quote reference that links back to the client record. The logo is resolved from the client record at render time.
