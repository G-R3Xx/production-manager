# Production Manager V26.08.13.04

## MYOB OAuth reliability

- Uses MYOB&apos;s documented secure OAuth endpoints directly instead of deriving them from the Business API base URL.
- Sends the requested MYOB granular scopes during the authorization-code token exchange.
- Uses the documented secure MYOB token endpoint for refreshes.
- Adds a 20-second timeout to the initial token exchange.
- Integrations now explains that MYOB 2FA happens entirely on MYOB&apos;s secure site and that company-file selection/return occurs only after successful MYOB sign-in.
- No MYOB data records are deleted or modified by this OAuth plumbing change.
