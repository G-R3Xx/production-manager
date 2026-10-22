# Production Manager V26.10.22.05

Based on V26.10.22.04, retaining the machine-save overlay fix and diagnostics.

## Editable staff names

Staff & roles (`/users`) now has Full name and Short name inputs in each editable row. They save with the row's existing Save button. Names are trimmed, required, length-checked (200 / 50 characters), and cannot contain an email address.

After deployment, open Staff & roles and set your own row to:

- Full name: **Glen Cloake**
- Short name: **Glen**

Click **Save**. Refresh any other already-open tabs that show the old name. Short names are read by task assignments and other staff selectors. Full names are used on other staff/calendar screens.

No SQL migration is needed. This release uses the existing profile columns. It does not change your login email, create a new user, or move any assignments. Profile names are shared wherever that user profile is used, including other memberships.

## Sign-in behaviour

Domain sign-in now preserves existing nonblank full and short names. Editing a name in Staff will therefore survive the next Google/domain sign-in. New registrations also ignore a provider display name that contains an email address and derive a readable name from the email's local part instead.

Existing email-valued names are not guessed or bulk-rewritten. Use the new fields to correct them explicitly.

## Permissions and saving

Existing owner/manager permissions, owner-account restrictions, and workspace membership checks remain in force. Names and membership settings commit in the same transaction; a failed name write rolls back the membership changes. Staff without management permission see names read-only. Saving invalidates cached name displays; other open browser tabs may need a refresh.

## Verification

- Full web TypeScript check passed: `node node_modules/typescript/bin/tsc --noEmit --incremental false -p apps/web/tsconfig.json`.
- Local PostgreSQL + Chromium integration test passed (`scripts/tests/staff-profile.cjs`):
  - Actual server action persists trimmed names and invalidates displays.
  - Profile identity, login email and existing assignment links remain intact.
  - Blank/overlong/email short names rejected.
  - Non-admin and cross-workspace writes denied; manager cannot edit an owner, but can edit staff.
  - A failed profile write rolls back membership changes.
  - Subsequent domain sign-in preserves edited names.
  - Email-valued provider names no longer create email short names for new registrations.
  - Rendered name inputs submit with the correct row's Save button; non-admin rendering remains read-only.

Tests used an isolated local PostgreSQL fixture and simulated authentication/cache boundaries. No live profile, database or deployment was modified here.
