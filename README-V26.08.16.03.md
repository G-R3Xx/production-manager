# Production Manager V26.08.16.03

## Artwork quote-line auto population fix

- Accepted quote lines now automatically materialise as Artwork Approval proof slots.
- Structured quote lines use their saved `configurationSnapshot.flowType` instead of relying only on product-name keyword guessing.
- Service-only pickup / delivery / install lines remain excluded from artwork scope.
- Legacy production quote lines without a recognised flow type fall back to a normal signage proof slot rather than being silently dropped.
- Opening an older Artwork Approval self-heals any missing proof slots from the currently accepted quote scope.
- **Sync quote lines** uses the same corrected scope logic and remains available as a manual repair / refresh action.
- Cancelled quote lines remain excluded.

No Purchasing, MYOB Order, Gmail, quote pricing or Production Job Sheet workflow was changed.
