# Artwork proof direct upload crash fix

This batch fixes artwork proof uploads crashing the Artwork Approvals page on Vercel.

## What changed

- Proof files are now uploaded directly from the browser to Supabase Storage using a signed upload URL.
- The app no longer sends large proof images/PDFs through a Next.js server action request body.
- The server action now receives only the uploaded proof URL/path and updates the artwork proof page.
- The global loading overlay can now be dismissed if a client-side upload fails.
- Proof uploads are limited to 50MB with a clear error message.
- Artwork proof previews now handle PDF proof files with an embedded PDF preview/link instead of always forcing an image tag.
- Artwork pages now safely handle older rows with missing production type values.
- Next server action upload body limit was raised as a fallback for older/manual proof forms.

## Reason

Large proof artwork files can exceed server-action/serverless request limits and cause the generic "This page couldn't load" screen after selecting a proof file. Direct-to-storage upload avoids that route entirely.
