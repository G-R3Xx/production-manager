# Production Manager V26.08.17.07

## Typecheck fix — shared PDF.js browser loader
- Fixed the local `pnpm typecheck` failure caused by the public artwork approval preview and printable job-sheet preview both declaring their own incompatible global `window.pdfjsLib` types.
- Both PDF preview components now use one shared `pdfjs-browser.ts` loader and one shared set of PDF.js TypeScript interfaces.
- Removed the duplicate global `Window` declarations that caused TS2717 / TS2719 / TS2345 errors.
- The shared PDF document type includes `numPages`, so the multi-page client proof preview and the first-page job-sheet preview use the same compatible document contract.
- No new npm package or lockfile change is required; the existing PDF.js browser loading behaviour is preserved.

## Preserved
- Approved artwork preview on printable job sheets from V26.08.17.06.
- Client-facing proof watermarking, clean PDF preview, artwork approvals, automatic refresh, MYOB Item Orders, Purchasing, Gmail email workflows, quote lifecycle and production features remain intact.
