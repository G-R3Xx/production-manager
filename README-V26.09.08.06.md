# Production Manager V26.09.08.06

## MYOB invoice status-sync fix

Fixes the PostgreSQL error `inconsistent types deduced for parameter $3` that could appear after MYOB had already successfully created or recovered an invoice.

### Changes
- Explicitly casts the shared invoice-status SQL parameter as `varchar` in the PM job stage/status update.
- Prevents a secondary PM dashboard/job-stage refresh failure from changing a confirmed MYOB invoice back to `Sync error`.
- Existing invoices already showing a MYOB number can be repaired by clicking **Refresh MYOB status** after deploying this build; PM will clear the stale sync error and update the job invoice state.
- No database migration required.

App version updated to **V26.09.08.06**.
