# Production Manager V26.08.17.01

- Artwork Approval **Email client link** now sends directly from Production Manager through the shared Gmail SMTP sender instead of opening a local mail application.
- Artwork emails use the branded Tender Edge email layout and horizontal logo, include the project/job name, quote number, revision and direct approval link.
- The approval is marked sent only after Gmail accepts the email. Failed email sends leave the artwork approval unsent and return the SMTP error in Production Manager.
- Existing artwork proof/revision logic, quote lifecycle, MYOB integration, Purchasing and PO email workflows are unchanged.
