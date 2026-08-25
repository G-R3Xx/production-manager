# Production Manager V26.08.25.04

## V26.08.25.04
- Fixed enquiry correspondence image previews so uploaded images always stay fully inside the card instead of being forced into a full-width, height-clamped image box.
- Image previews now preserve their natural aspect ratio, remain centred, and use `max-width: 100%` / `max-height: 360px` so portrait and landscape files are shown in full without clipping to the right.
- The original image remains clickable for full-size viewing.
- Carries forward the native inline Microsoft Outlook `.msg` correspondence preview support introduced in V26.08.25.03.

No database migration is required.
