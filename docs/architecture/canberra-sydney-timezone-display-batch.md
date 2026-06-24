# Canberra/Sydney timezone display batch

This batch forces user-facing timestamps to render in Australia/Sydney time so production checkoffs, artwork approvals, quote sync timestamps, dashboard activity and integration sync dates do not show UTC/server time on Vercel.

Changed areas:
- Production checkoff timestamps
- Production print-ready upload timestamps
- Production approved artwork timestamps
- Quotes MYOB sync timestamps
- Artwork approval timestamps
- Dashboard activity timestamps
- Public artwork approval dates
- Integration sync/token timestamps

Stored database timestamps remain unchanged as UTC/timestamptz. Only display formatting changed.
