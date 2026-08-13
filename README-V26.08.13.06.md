# Production Manager V26.08.13.06

## MYOB read-only sync scope fix

- Fixed the misleading `OAuthTokenIsInvalid` failure in the MYOB read-only health check.
- The health check no longer calls `/Company/Preferences`, which requires the separate `sme-company-settings` scope that Production Manager does not request.
- It now uses the MYOB `/Info` endpoint covered by the already-granted `sme-company-file` scope.
- Customer, supplier and inventory checks continue to use their matching granted scopes.
- Improved 401 diagnostics to distinguish endpoint-scope/API-key/token problems from company-file credential problems.
- Future OAuth authorization-code exchanges follow MYOB's June 2026 guide and do not repeat the scope list during the token exchange.
- No OAuth reconnect is required for an already connected V26.08.13.05 connection; install and run the read-only sync again.
