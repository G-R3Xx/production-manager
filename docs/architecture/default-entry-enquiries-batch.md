# Default entry now opens Enquiries

Changed the root app route so the first marketing-style screen is no longer shown.

## Behaviour

- `/` checks the current Supabase session.
- If signed in, `/` redirects to `/enquiries`.
- If not signed in, `/` redirects to `/sign-in?next=/enquiries`.
- Sign-in defaults to `/enquiries` if no explicit `next` value is supplied.
- Auth callback also defaults to `/enquiries`.
- App-level required session redirects now point unauthenticated users to sign-in with Enquiries as the next page.

This means Production Manager behaves more like an internal business app: open the app, land on Enquiries, or sign in first.
