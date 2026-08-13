# Production Manager V26.08.13.07

## MYOB OAuth Bearer-header fix

- Traced the MYOB access token end-to-end: OAuth JSON response -> TEXT token storage -> refresh-token rotation -> `Authorization: Bearer <raw access_token>`. Production Manager was not URL-encoding, truncating, swapping or deliberately altering the token.
- Fixed the remaining Bearer-header failure at the Business API request boundary. AccountRight company-file requests can be routed from `api.myob.com` to a MYOB shard host such as `arl2.api.myob.com`; automatic cross-origin fetch redirects can remove sensitive headers such as `Authorization`.
- MYOB Business API redirects are now followed explicitly with `redirect: manual`, and the Bearer token, API key, API version and company-file token are reapplied to each trusted MYOB API hop.
- Redirect credentials are only forwarded over HTTPS to `api.myob.com` or `*.api.myob.com` under the `/accountright` path, with a four-hop limit. Untrusted redirect targets are rejected rather than receiving credentials.
- Added raw-token integrity guards so an accidentally stored `Bearer ` prefix or leading/trailing whitespace fails clearly instead of producing a misleading MYOB 31001 response.
- The existing pre-expiry refresh, one retry after a 401, rotated refresh-token persistence, shared-sandbox `APIDeveloper` company-file authentication, granular scopes, `/Info` health check, PM -> MYOB push workflows and Purchasing features remain in place.
- Successful sync summaries now retain the final MYOB company-file URL after any trusted routing hop, making the actual company-file host visible in integration diagnostics.

No database migration is required. Existing MYOB OAuth connections can be tested with **Run read-only MYOB sync** after installing this build.
