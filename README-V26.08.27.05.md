# Production Manager V26.08.27.05

## V26.08.27.05

### Typecheck fix
- Re-exported `ArtworkSpecificationSnapshot` and `ArtworkSpecificationItem` from `lib/artworkSpecification` so the server quote workflow can import the snapshot type from the shared artwork-specification module.

### Artwork Approval sign specification panel

- Artwork Approval proofs now include a professional client-facing **Sign specification** panel inspired by signage documentation schedules.
- Uses purpose-built monochrome line icons for substrate, imaging/print, roll-to-roll laminate, backing, cut/shape, mounting, finished size and quantity.
- No spray/paint finishing language is used. Finishing is represented as the selected **roll-to-roll laminate** (including the configured customer-facing material name).
- Customer-facing material names are used throughout the approval specification; internal SKUs, supplier names, calculated sheet/linear-metre usage and pricing details are not shown.
- Standoff material and quantity, eyelet/mounting information, cut/shape details, print mode/colour, dimensions and quantity are included only when relevant.
- The same specification panel is visible to staff in the Artwork Approvals workspace and to the client on the public approval page.
- Specification data is snapshotted into each proof page's existing payload JSON and stored by approval revision. Once a revision has captured a specification, normal quote-line sync will not overwrite that revision's approved specification.
- Starting/sending a new revision captures a new revision-specific specification while preserving prior revision snapshots for audit history.
- Final client sign-off wording now explicitly confirms materials, laminate/finish and mounting details as part of the approval.

No destructive database migration is required; the existing `payload_json` field on artwork approval pages is used for revision snapshots.
