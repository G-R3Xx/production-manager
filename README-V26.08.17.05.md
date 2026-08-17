# Production Manager V26.08.17.05

## Production MYOB redirect fix
- Fixed the Production job **Send to MYOB Item Order** action showing `NEXT_REDIRECT` after a successful MYOB sync.
- The MYOB API/database work is now completed inside the error boundary, while the successful Next.js redirect is performed outside it so the framework redirect signal cannot be mistaken for an application error.

## Safe live refresh
- Added a lightweight app-wide server-data refresh every 15 seconds using Next.js `router.refresh()` rather than a full browser reload.
- This refreshes current server-backed data such as Alerts, quote responses, artwork approvals/change requests, production status and sync state while preserving the current route and scroll position.
- Auto-refresh pauses whenever a form has unsaved edits or an input/textarea/select/contenteditable control is focused, so typed page data is not overwritten.
- Form submit/reset clears the local dirty guard so fresh server data can resume after a save.

## Preserved
- Artwork proof watermarking and approval workflow from V26.08.17.04.
- MYOB Item Orders, Purchasing, Gmail email workflows, quote lifecycle and production/job-sheet features remain intact.
