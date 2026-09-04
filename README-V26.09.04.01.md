# Production Manager V26.09.04.01

Artwork Approval PDF fidelity fix.

- Restores every non-PMS specification value in the emailed Artwork Approval PDF (the PDF renderer was calculating the values but not writing their text into the content stream).
- Adds defensive fallback from the linked quote line and page summaries for older artwork revisions.
- Preserves PMS colours even for legacy revisions when the revision-specific PMS snapshot is absent.
- Updates PDF specification icons to closely match the icons used on the online Artwork Approval page.
- Updates the proof watermark to use the workspace/Tender Edge name, repeated diagonal treatment and the same PROOF ONLY / brand / quote structure as the online preview.
- Keeps the approved V26.09.03.03 cover-page design unchanged.
