# Production Manager V26.07.30.06

## Reliable website image saving

- Fixes the Product → Website save failure introduced by the multi-image gallery.
- Product image files now upload directly from the browser to Supabase using short-lived signed upload URLs.
- The Website settings server action receives only the saved image URLs and metadata, avoiding large multipart submissions through Vercel.
- Upload progress is shown beside the Add image files control.
- Website settings cannot be submitted while image uploads are still running.
- Individual upload failures are shown on the page instead of crashing the Product editor.
- Database save failures now redirect back to the Website tab with the real error message rather than the generic “This page couldn’t load” screen.
- Existing featured images, image URLs, ordering and alt text remain compatible.
- No database migration or WordPress plugin update is required.

Visible application/catalogue version: `V26.07.30.06`.
