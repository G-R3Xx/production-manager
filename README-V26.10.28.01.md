# Production Manager V26.10.28.01 — Multiple contacts per client

Built from **V26.10.22.05**. Retains the prior machine-save overlay fix, editable staff names, and all other features.

## What's new

- **Clients:** Each company can now have multiple named contacts, each with a separate email and phone. Add, edit, remove and mark one contact as the default; click **Save client details** to persist changes.
- **Existing customers:** A customer's existing first/last name, email and phone appear automatically as a *legacy/default contact* until the contact list is saved. This avoids a migration and preserves existing MYOB customer data.
- **New enquiries:** After selecting a client, the **Contact person** dropdown shows only that company's contacts. The default is selected initially. Selecting another person fills contact name, phone and email; these remain editable on the enquiry.
- **Manual entries:** "Other / enter contact manually" is available for unsaved contacts. Unlinked enquiries still work.
- **Enquiry history:** Selected name/email/phone are snapshotted onto the enquiry, so a later change to the address book does not silently rewrite historical enquiry contacts.
- **Security:** The server checks that a submitted contact ID belongs to the selected client in the active tenant. Client/contact details are never loaded cross-tenant.
- **Performance:** Only enquiry forms request the extra contact array in the lightweight customer-options query. Quotes retain the original slimmer query. Tablet mode now uses the same lightweight options query instead of full MYOB customer payloads.

## Storage, compatibility and MYOB

- Contacts are saved under `app.customers.payload_json.contacts`, a JSONB field already in the existing schema. **No SQL migration required.**
- MYOB's existing company-level first name, last name, email, phone and price-level fields remain unchanged. The additional PM contact list is not pushed into MYOB and is retained during normal import/upsert operations via the existing JSONB merge.
- An explicitly empty saved contacts list suppresses legacy fallback; this allows staff to remove all contacts intentionally.
- Company contacts are currently managed from the client editor and saved with the other client fields; there is no automatic creation of a new company contact from a manually typed enquiry name.
- Contacts have a name, email, phone, and one default marker, with a 100-contact limit per company. A contact must have a name; email and phone are optional.

## Deployment

1. Deploy this source as usual. No SQL migration is required.
2. Open **Clients** and select a company.
3. In **Company contacts**, add people and designate the default contact. Save client details.
4. Open **Enquiries** (desktop or tablet), choose that company, then choose the contact. Verify name/email/phone populate before submitting.

## Verification performed in this environment

- `tsc --noEmit --strict --target es2022 --module esnext apps/web/src/lib/client-contacts.ts` — passed.
- TypeScript/TSX syntax-transpilation diagnostics across 12 modified source files — **0 errors**.
- `node --experimental-strip-types scripts/tests/client-contacts.mjs` — passed all included model assertions (legacy fallback, multiple contacts, defaults, removing contacts, validation, contact selection).
- **Full Next.js/monorepo typecheck and browser integration tests could not be run here**: the source ZIP contains no `node_modules`, and network access to retrieve pnpm and packages was unavailable. Before deploying, run `pnpm install --frozen-lockfile` and `pnpm typecheck` on the development machine, followed by a UI smoke test.

No live MYOB account, Supabase production database or deployment was modified.
