# Production Manager V26.08.13.08

## MYOB OAuth / read-only sync correction

- Corrected the MYOB `/Info` validation call. MYOB documents this endpoint as the global AccountRight API endpoint `https://api.myob.com/accountright/Info`; it must not be prefixed with the OAuth callback `businessId` / company-file GUID.
- The global `/Info` request now sends the OAuth Bearer token, API key and API version only. It does not send a company-file GUID or company-file credential token because it is not a company-file resource.
- Customer, supplier, inventory, sales, purchasing and other company-file calls remain scoped to `https://api.myob.com/accountright/{businessId}/...` and continue to use the company-file authentication token where required.
- Preserved the V26.08.13.07 token refresh, raw-token validation and trusted MYOB redirect handling.
- Preserved MYOB Price Level A-F pricing, PM-to-MYOB master-data push, Purchasing/PO functionality, bleed/spacing, decimal labour and all existing quote/artwork/public quote workflows.

## Why this matters

V26.08.13.07 was testing the token against `/accountright/{businessId}/Info`. That path does not match MYOB's documented Info endpoint. A 401/OAuthTokenIsInvalid from that malformed resource path was therefore not proof that the freshly issued Bearer token itself was corrupt. V26.08.13.08 tests the token against the documented global `/accountright/Info` path before proceeding to the actual company-file resources.
