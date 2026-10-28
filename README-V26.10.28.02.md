# Production Manager V26.10.28.02 — Client-contact TypeScript correction

**Base version:** V26.10.28.01 (multiple contacts per client), which itself builds on V26.10.22.05. All previously delivered features are retained.

## Fixed

Corrected the five `TS2345` errors in `@production-manager/web:typecheck` reported after V26.10.28.01 was unpacked:

- `src/app/(app)/clients/page.tsx` lines 51 and 192
- `src/app/(app)/enquiries/actions.ts` line 91
- `src/app/(app)/enquiries/NewEnquiryForm.tsx` lines 117 and 161

The shared `ContactOwner` contract in `apps/web/src/lib/client-contacts.ts` incorrectly required `payloadJson` to have the weak type `{ contacts?: unknown }`. Existing `CustomerPayload` and `ClientOption` payloads do not explicitly declare that key, triggering TypeScript's weak-type assignment check, even though the runtime JSON payload may contain contacts.

The helper now accepts the already-existing payload shapes and safely narrows `payloadJson` before looking for `contacts`. No `any` or unchecked nested property access was added. The contact list, legacy fallback, validation and contact selection behaviour are unchanged.

## Verification

- Strict TypeScript compilation of the changed helper and `scripts/tests/client-contacts-types.ts`: **passed**.
- Compile-only regression coverage for both server-style customer records and enquiry client options: **passed**.
- Runtime client-contact regression checks (multiple contacts, legacy fallback, selection, empty lists, validation and malformed payloads): **passed**.
- ZIP integrity and changed-file comparison against V26.10.28.01: checked when packaging.

**Full monorepo `pnpm typecheck` could not run in the build environment** because the source package does not include the installed workspace dependencies. This correction directly addresses all five provided TS2345 diagnostics, but a clean app-wide typecheck remains necessary on your development PC.

## Install / verify

1. Replace the project with V26.10.28.02 or copy the changed files into your existing V26.10.28.01 checkout.
2. In `C:\Users\Glen\Documents\GitHub\production-manager`, run `pnpm typecheck`.
3. Start the app, open **Clients**, add contacts to a company and save it, then open **Enquiries** and switch contacts for that company.

**No Supabase SQL migration is required.** Existing customer, MYOB and enquiry data are untouched by the correction.
