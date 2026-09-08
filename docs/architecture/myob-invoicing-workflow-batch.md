# MYOB invoicing workflow batch

## Purpose
Production Manager owns the operational job workflow; MYOB remains the commercial/accounting source of truth. PM prepares and triggers invoices and stores enough MYOB identifiers/status data to make invoicing visible from the job.

## Roles
Invoice creation/view is limited to tenant roles `owner`, `manager`, and `accounts`. Production staff can complete work and cause a job to become invoice-required without receiving invoice creation access.

## Flow
1. Quote is accepted and linked to a PM Job.
2. The accepted quote has/receives its MYOB Item Order mapping.
3. Deposits/progress claims may be raised before production completion.
4. Production completion moves the job to `invoice_required`.
5. Authorised staff open `/jobs/{jobId}/invoice` and select an invoice mode.
6. PM creates a local invoice draft with `myob_sync_status=syncing`, then pushes it to MYOB.
7. MYOB UID, number, status, total and balance are saved against the PM invoice.
8. Job invoice state becomes `partially_invoiced`, `invoiced`, or `paid` based on issued invoice value/status.
9. MYOB status can be refreshed from the invoice history.

## Invoice modes
- `full_remaining`: first full invoice; converts the linked MYOB Item Order when safe.
- `selected_lines`: chosen quote line quantities only.
- `deposit`: advance invoice by percentage or fixed amount.
- `progress`: progress claim by percentage or fixed amount.
- `final_balance`: remaining quote quantities plus an automatic negative advance-credit line where deposits/progress have already been issued.
- `variation`: client-approved extra work outside accepted quote; does not consume accepted quote remaining value.

## Remaining-value rules
Only MYOB-synced/issued (`issued`, `part_paid`, `paid`) PM invoices count toward job billing. Quote-line invoice lines consume quote-line quantities. Deposit/progress invoice amounts consume accepted job monetary value without consuming quote quantities. The final invoice credits the cumulative fixed advance amount. Variation invoices are reported in total prior invoicing but excluded from the accepted-quote remaining calculation.

## MYOB Order conversion
For the first `full_remaining` invoice, if the PM job has a linked MYOB Item Order and the invoice consists only of quote lines, PM fetches the actual order and compares its subtotal with the PM invoice subtotal. If they differ by more than two cents, conversion is blocked for reconciliation. If they match, PM POSTs an Item Invoice based on the Order and supplies `Order: { UID }` to preserve the MYOB conversion trail.

## Safety
- Recalculate invoiceable value on the server at submission.
- Reject selected quantities greater than the remaining quote-line quantity.
- Reject deposit/progress values beyond accepted-job remaining value.
- Keep MYOB sync failures as local drafts and expose explicit retry.
- Unique partial index permits only one `syncing` invoice per job at a time.
- Do not automatically email the client from invoice creation.

## Database
Migration: `infra/sql/046_invoice_workflow.sql`. Existing `app.invoices` / `app.invoice_lines` groundwork is extended with job linkage, invoice type, MYOB sync/status fields, source order identifiers, final flag, creator and invoice-line source kind.
