# Enquiry collapsed preview cards batch

## Purpose
Keep the enquiry list clean and quick to scan by showing only the compact enquiry preview until the user clicks the card.

## Changes
- Current and deleted enquiry list items now render as collapsed disclosure cards.
- The collapsed preview shows the same basic header details only:
  - client logo when available
  - client name
  - request summary
  - urgency badge
  - status badge
  - contact / phone / email / address line
- Correspondence, attachment previews, upload controls, survey actions, quote actions, restore and delete controls are hidden until the enquiry card is opened.
- The existing correspondence preview behaviour remains available inside the opened enquiry card.

## Notes
This change is intentionally presentation-only. It does not change enquiry storage, correspondence upload, survey creation, quote creation or delete/restore behaviour.
