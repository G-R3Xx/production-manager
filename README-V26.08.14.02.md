# Production Manager V26.08.14.02

## Typecheck fix — purchase-order PDF response

- Fixes the `@production-manager/web:typecheck` failure in the new Purchase Order PDF download route.
- Next.js/DOM `Response` typing rejected the PDF generator's `Uint8Array<ArrayBufferLike>` as `BodyInit`.
- The route now copies current PDF bytes into a fresh `Uint8Array` before constructing the `Response`, matching the already-working archived-PDF branch and preserving the generated PDF bytes unchanged.
- No Purchase Order workflow, MYOB sync, supplier email, PDF layout, pricing, purchasing, client/supplier/material sync or other application behaviour was changed.

## Validation notes

See delivery response for the exact validation performed in the build environment.
