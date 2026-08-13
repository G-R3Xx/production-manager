-- Company-file credentials required by the MYOB Business API in addition to OAuth.
-- Store the base64 company-file credential token, never expose it back to the browser.

ALTER TABLE integration.myob_connections
  ADD COLUMN IF NOT EXISTS company_file_username varchar(255),
  ADD COLUMN IF NOT EXISTS company_file_auth_token text;

-- Shared developer sandboxes commonly use the APIDeveloper company-file user.
-- Existing sandbox connections can therefore work immediately; users can override this
-- in Integrations if their sandbox/company file uses different credentials.
UPDATE integration.myob_connections
SET company_file_username = COALESCE(company_file_username, 'APIDeveloper'),
    company_file_auth_token = COALESCE(company_file_auth_token, encode(convert_to('APIDeveloper:', 'UTF8'), 'base64'))
WHERE environment = 'sandbox'
  AND company_file_auth_token IS NULL;
