# Production Manager V26.11.03.01

Based on V26.11.02.12. Restores the missing manual PM-client linking path for an already accepted quote, enabling the existing MYOB Item Order workflow.

## Fix: accepted quote has no PM client link

When an accepted quote has no valid linked Production Manager client (or has an unconfirmed mismatch), the Quotes screen shows a prominent **MYOB Order blocked — link the accepted quote to a client** panel, without requiring users to expand the hidden admin panel.

Owners/managers can:

1. Select an existing active PM client in a dropdown (an exact-name/email suggested match is labelled, but never auto-selected).
2. Tick the explicit confirmation checkbox.
3. Click **Link client** to save the relationship, or **Link & create MYOB Order** to both link and invoke the existing MYOB Order creation/retry flow.

The selected customer is recorded on the accepted quote, linked enquiry/survey and existing PM/production job. No duplicate production job or quote is created. The accepted quote's original customer-facing client name, contact, pricing, line items, tax and approval state are not altered.

If the client has an MYOB mapping, the existing MYOB integration uses it. If it has no mapping, the existing MYOB workflow attempts to match or create the customer. Ambiguous MYOB matches must be resolved manually in **More quote details & admin** on the quote screen; this release does not automatically choose among multiple matches.

Existing MYOB Item Orders are protected: the recovery transaction refuses a quote already marked synced or containing an order UID, and refuses concurrent in-progress syncs (with the same ten-minute stale-sync window as existing retry logic). Database changes are tenant-scoped and transactional. Only owners/managers can invoke the new action. Customer must be active.

A failed MYOB request **does not undo the successfully saved PM client link**; the error is shown and can be addressed before retrying. Confirmation of existing or newly generated MYOB Order numbers uses the existing MYOB response. The UI also handles valid alternate trading names through an explicit manager-confirmed client link instead of replacing the historic accepted quote name.

## Verification

- `node scripts/tests/accepted-quote-client-recovery.cjs` — passed (quote editor/UI wiring and TS syntax, transactional record linkage, refusal of already-synced/in-progress orders, invalid client, draft quote).
- Existing Sub Job, quote-line quick actions, public/internal quote heading/PDF, quote-status polling, courier/delivery pricing and quote-cost permission tests — passed.
- **Full `pnpm typecheck` and live MYOB/Supabase integration testing are outstanding**, as this ZIP contains source without installed dependencies or the user's MYOB account connection. Run typecheck in the local repo before deployment and test on a non-production accepted quote if possible.

## Installation

1. Extract source files over V26.11.02.12 (retain your local environment/secrets).
2. Run `pnpm typecheck`.
3. Deploy V26.11.03.01.
4. Open the accepted quote under Quotes, select the customer in the new recovery panel and use **Link & create MYOB Order**. Confirm the MYOB Order number and linked job.

**No new SQL migration required** beyond the previously installed migrations.
