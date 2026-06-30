# Staff Google domain auto-join batch

Adds safe Google sign-in behaviour for staff testing/usage.

## Behaviour

- A trusted email domain can be configured on Settings → Staff Google access.
- Staff signing in with that Google domain are automatically added to the current workspace.
- Default role is configurable; the intended default is `staff`.
- This prevents staff users from being sent through the first-tenant bootstrap flow and accidentally creating a new blank workspace.
- The auth callback sets the active workspace cookie to the matched workspace after Google sign-in.

## Tender Edge default

Migration `032_staff_google_domain_auto_join.sql` creates `app.tenant_domain_access` and attempts to seed `tenderedge.com.au` to the Tender Edge tenant when the tenant slug/name/settings clearly match Tender Edge.

If the seed does not match the tenant, open Settings and save:

- Allowed Google email domain: `tenderedge.com.au`
- Default role: `Staff`
- Auto join: enabled

Then staff should sign out and back in with Google.
