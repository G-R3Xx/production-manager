# Housekeeping safe-delete workflow batch

Adds housekeeping controls so operational records can be removed from the active workspace without breaking historical links or quote/artwork relationships.

## Behaviour

- Enquiries, survey requests, quotes, artwork approvals and products are now soft-deleted with `status = 'deleted'`.
- Deleted records are hidden from the normal active lists.
- Each section has an Active / Deleted toggle so clutter can be cleaned up and restored if needed.
- Materials use the existing `active` flag as their safe delete/restore control.
- Clients already use the existing client payload safe-delete workflow and remain available in the Clients Deleted filter.

## Sections covered

- Enquiries: delete / restore.
- Surveys: delete / restore without clearing survey notes or Install Scheduler payload.
- Quotes: delete / restore; deleted quotes cannot be edited until restored.
- Artwork approvals: delete / restore; deleted approvals are hidden from the active workflow.
- Materials: delete / restore by active flag; inactive materials only appear in the Everything filter.
- Products: delete / restore with `status = deleted`.
- Clients: existing archive / restore / safe delete remains in place.

## Why safe delete instead of hard delete

Hard-deleting quotes, artwork approvals or survey requests can break linked enquiries, client public links, quote lines, proof pages, and Install Scheduler return data. The active workspace now stays clean while keeping records recoverable.
