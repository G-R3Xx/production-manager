# Production Manager V26.08.10.12

Artwork quote-line sync correction.

- Accepted quotes now treat every non-cancelled artwork-capable line as accepted artwork scope, including quotes accepted per line.
- Line response values are normalised before artwork scope checks.
- Artwork sync reports source quote number/status plus approved/cancelled/pending counts when nothing can be synced.
- Artwork workspace shows the exact source quote and line-status counts above Proofs.
- Approval jobs are ordered by the source quote creation date, newest quote first, so syncing an older job no longer pushes it above a newer quote.
- Syncing quote lines no longer changes the approval-job sort order just because the Sync button was pressed.
- Client artwork view and send/release validation use the same accepted-scope rules as the internal artwork workspace.
