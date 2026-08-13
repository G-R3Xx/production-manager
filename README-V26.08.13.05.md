# Production Manager V26.08.13.05

MYOB company-file authentication + automatic OAuth recovery.

- Adds the MYOB `x-myobapi-cftoken` company-file credential header to every read/write request.
- Existing sandbox connections are backfilled with the `APIDeveloper` company-file user and blank-password token; Integrations allows overriding the company-file username/password.
- OAuth access tokens are refreshed before expiry and a 401 request is refreshed/retried once automatically.
- Refresh-token rotation is persisted and concurrent 401 refreshes are de-duplicated.
- Adds `infra/sql/043_myob_company_file_auth.sql`; the integration server also applies the two columns defensively at runtime.
- Keeps all V26.08.13.03/.04 MYOB master-data push and Purchasing changes.
