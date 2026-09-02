# Production Manager V26.09.02.03

## Artwork approval PDF email attachments

- Artwork approval emails now include a **PDF proof pack** for clients whose security policies block external web approval links.
- The generated PDF starts with a **Tender Edge / company-branded cover page** showing the job, client, quote number, revision and proof list.
- PNG and JPG proof images are compiled directly into the PDF pack as full proof pages.
- If a proof was originally uploaded as a PDF, the original PDF is attached alongside the branded proof pack so the source artwork is preserved exactly.
- The artwork email still includes the web approval link, but now also tells locked-down clients they can **reply by email with APPROVED or requested changes**.
- Staff can then use the existing **Approve internally** workflow to record an emailed approval in Production Manager.
- Proof attachments are checked before sending. Unsupported proof formats produce a clear error instead of emailing an incomplete pack.
- Combined PDF attachments are capped at 18MB for reliable Gmail delivery; staff are prompted to export smaller proofs when the pack exceeds that limit.
- The artwork email button now makes it clear that it sends the **client link + PDF**.
- Retains V26.09.02.02 public Artwork Approval Print button and printable PMS swatches.
