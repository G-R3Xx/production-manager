# Artwork workspace overhaul batch — V26.08.10.09

## Workflow

1. Quote is accepted (including partial line-by-line acceptance).
2. Artwork approval pack uses only artwork-relevant quote lines that remain in the accepted scope.
3. Quote lines become proof slots; staff replaces each placeholder with the finished proof.
4. Every proof must belong to the current artwork revision before the pack can be sent or internally approved.
5. Staff marks the pack sent and shares the existing public link.
6. Client reviews the proof pack and either approves/signs or requests changes.
7. Change requests return the pack to staff. Starting the next revision increments the revision, preserves the same public link and makes prior-revision proof files stale until replaced.
8. Client approval releases the artwork to production using the existing production-job creation path.

## Internal page

- Persistent approval queue on the left, prioritised by action-required status.
- Compact job header with quote/client/value/status.
- Workflow strip: Quote approved → Proofs ready → Sent → Viewed → Approved.
- Proof readiness and missing quote-line slots visible at a glance.
- Direct proof replacement inside each proof card.
- Compact approval details sidebar; advanced fields are collapsed.
- Change-request callout with Start next revision action.
- Sending/direct approval blocked while required proofs are missing, placeholders, or from an older revision.
- Out-of-scope/cancelled pages stay available for history but are excluded from the current client pack.

## Public client page

- Responsive branded header and compact revision/status information.
- Proof jump navigation when there are multiple pages.
- Large proof area with production details alongside on desktop and stacked on mobile.
- Separate Approve and Request changes modes.
- Signature/confirmation required only for approval.
- Draft revisions are not exposed to clients; `?preview=1` is used from the internal Client preview action.
- Changes-requested state acknowledges the response and waits for the next revision instead of accepting repeated decisions.

## Data

`infra/sql/040_artwork_revision_proof_tracking.sql` adds `proof_revision` to `sales.artwork_approval_pages`. Existing non-placeholder proofs are backfilled to the current approval revision. Runtime schema preparation applies the same change defensively and is cached per app process.
