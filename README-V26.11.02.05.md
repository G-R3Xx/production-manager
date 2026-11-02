# Production Manager V26.11.02.05 — Staff Training & Certificates

**Base:** V26.11.02.04. Existing quote-polling performance optimisations, client contacts, quote cost report permission, staff cards, Courier and pass-through Delivery pricing are retained.

## What changed

**Staff & Roles → [staff member] → Manage training / certificates** (new section beneath each eligible staff card). A separate staff-specific page stores any number of records with:

- Type: licence/ticket, training course, qualification, induction or other.
- Name, issuing organisation, licence/certificate number, issue/completion date, optional expiry date, notes.
- Configurable advance warning: **0–365 days**, **30 days default**. With 0, no advance warning is created, but expiry-day and expired alerts still appear.
- Evidence: upload JPEG/PNG/WebP photos or PDF scans (up to 15 MB) using a direct signed Supabase upload. Thumbnail preview for images and private document links. Update/replace or delete each record; deletion requires confirmation.
- Expiring and expired status clearly shown on the staff certificate page.

## Notifications and privacy

- **In-app Alerts menu**, visible only to active workspace owners/managers. Existing notification system reused; ordinary staff cannot view licence alerts or private documents.
- On the first owner/manager Alerts refresh after a certificate enters its configured reminder window, one **expiring** alert appears. A separate **expired** alert is created on the first qualifying refresh after expiry. The expiry date is evaluated in `Australia/Sydney` local time.
- A database uniqueness gate avoids duplicate alerts across Vercel workers. The check is throttled to at most once per **five minutes per server instance** to avoid the site-wide performance regressions experienced previously.
- This is an **in-app, on-access** notification, **not** an unattended push notification, scheduled email or SMS. If nobody opens Production Manager, the alert is generated when a manager next uses the Alerts menu. Email/push notifications would require a separate scheduler and delivery system.
- Active workspace owners/managers can manage records; managers cannot edit an owner's certificates, consistent with Staff & Roles permissions.
- Evidence is stored in a **private** `staff-certificates` Supabase Storage bucket. Each document access requires server-side tenant/role checks and a short-lived signed URL; no permanent public URL is stored.

## REQUIRED deployment order

1. Run **`infra/sql/063_staff_certificates.sql`** in the **Supabase SQL Editor** before deploying. It creates the tenant-isolated certificate and alert-deduplication tables, indexes and a private Storage bucket.
2. Deploy V26.11.02.05 source.
3. Run `pnpm typecheck` from the project root (also run the normal build/deployment checks).
4. Go to **Settings → Staff & Roles**. Beneath each staff member, choose **Manage training / certificates**, add a sample record, attach a photo or PDF, and save.
5. Test a certificate with an expiry date inside its configured reminder window; the manager's **Alerts** menu should display the notice after refreshing (the scan is throttled for up to five minutes per server instance). Test with a non-admin account to confirm document and alert access are denied.

## Verification in this packaging environment

**Passed:** `scripts/tests/staff-certificates.cjs` (date/status logic, server-side tenant and role gates, private file access, alert deduplication and throttling checks); existing responsive staff cards, quote cost access, lightweight quote-status, Courier/Delivery pricing regression tests; TypeScript/TSX syntax transpilation for changed/new files; ZIP checksum/integrity check.

**Not run here:** complete `pnpm typecheck`, `pnpm build`, live database migration execution, Supabase Storage upload and live browser integration. Workspace dependencies are absent in the source archive, and no live tenant or database was modified. The existing `client-contacts.mjs` test requires a Node setup able to import TypeScript; Node 22 in this packaging environment refused `.ts` and that test could not run. These remain local/production verification steps, not proven successes.

No existing training/certificate records were imported or modified. Existing staff names, roles, quotation and costing data were not changed.
