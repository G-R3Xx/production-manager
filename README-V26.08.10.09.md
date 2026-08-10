# Production Manager V26.08.10.09

## Artwork workflow overhaul

- Rebuilt the internal Artwork page as an Artwork Workspace rather than a stack of setup forms.
- Added a persistent approval-job rail, compact project header and Quote approved → Proofs ready → Sent → Viewed → Approved workflow strip.
- Proof slots now come only from the approved client quote scope when line-by-line quote responses are in use; cancelled/change-requested/pending lines are not added to artwork.
- Proof cards clearly distinguish placeholder artwork from a real uploaded proof and allow direct replacement in place.
- Missing proof slots and incomplete proof files block send/direct approval so placeholders cannot accidentally reach production or the client.
- Client-cancelled/out-of-scope proof pages are preserved for history but excluded from the active approval pack.
- Approval setup is now a compact side panel with advanced fields collapsed.
- Added revision workflow: after a client change request, Start next revision increments A→B→C (or numeric revisions), clears the previous response/signature timestamps and keeps the same public link.
- Each proof now records the revision it belongs to. Starting Revision B makes Revision A proofs visibly stale until each one is replaced, preventing an old proof from being accidentally re-sent as a new revision.
- Re-sending a revision now refreshes sent/viewed state for the current revision.
- Rebuilt the public artwork approval page with compact branding, proof navigation, larger artwork area, clearer production details and a dedicated decision panel.
- Approval and change-request modes are separated: signatures only appear for approval, while change requests only ask for the required change notes.
- Draft revisions are preview-only and cannot be client-approved until staff marks them sent.
- After a client requests changes, the client page acknowledges the request and waits for the next revision rather than allowing repeated responses.

Database migration: `infra/sql/040_artwork_revision_proof_tracking.sql` adds `sales.artwork_approval_pages.proof_revision`. The server also applies/backfills this defensively at runtime.
