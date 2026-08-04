# Production Manager V26.08.04.04

## WordPress invitation transport

- Sends client invitations through WordPress `admin-ajax.php`, the same host-compatible channel used by live product pricing.
- Sends the connection key in the encrypted HTTPS POST body instead of relying on REST authentication headers.
- Avoids managed-host REST authentication rules that returned a generic HTTP 401 before the plugin could respond.

Requires Tender Edge WordPress plugin V3.3.17.
