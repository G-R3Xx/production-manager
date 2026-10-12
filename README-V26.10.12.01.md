# Production Manager V26.10.12.01

Based on V26.09.21.05.

- Selecting an existing customer now immediately displays their saved logo in the new enquiry form, on desktop and tablet.
- Changing customers updates the preview; selecting New / unlinked client clears it. Customers without logos show their initials.
- New enquiries inherit the linked customer's saved logo URL and storage reference. A pasted URL or uploaded image overrides it for that enquiry.
- No database migration is required. Deploy the source as usual. Existing enquiries are not modified.

Validation: focused runtime checks passed for both form modes, customer switching, missing logos, unlinked clients, tenant-scoped customer lookup, and URL/upload override precedence. Changed TypeScript/TSX syntax checks passed. These checks use mocked server dependencies; no live database or browser session was available. Full workspace typecheck and production build were not run because dependency installation is blocked by the pre-existing pantoner@1.1.2 lockfile entry missing tarball integrity. The dependency policy and lockfile were left unchanged.
