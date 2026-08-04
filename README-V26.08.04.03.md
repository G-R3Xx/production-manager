# Production Manager V26.08.04.03

## WordPress client invitation authentication

- Sends the WordPress connection key through a dedicated `X-Tender-Edge-Key` header.
- Retains Bearer authentication as a fallback for hosts that forward it.
- Prevents GoDaddy/Apache configurations from stripping the client invitation credentials and returning HTTP 401.

Requires Tender Edge WordPress plugin V3.3.16.
