# Production Manager V26.10.21.05

## Material Price Manager

- Added **Reverse printable** directly to the in-app Material Editor grid.
- The checkbox uses the existing `reverse_printable` material field used by quote logic; no duplicate setting was introduced.
- Reverse printable is available for **Roll media** rows only, matching the detailed material editor.
- Changing a material away from Roll media automatically clears the reverse-printable flag.
- New roll materials can be marked reverse printable before the row is first saved.

## Database

No new migration is required for this build; the `reverse_printable` column already exists.
