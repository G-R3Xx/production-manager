# Production Manager V26.08.17.02

## Client artwork approval presentation

- Replaced the embedded browser/Acrobat PDF viewer on the public artwork-approval page with a clean PDF.js canvas preview.
- PDF proofs render without browser PDF toolbars, sidebars, Acrobat prompts or viewer chrome.
- Added `View larger` fullscreen proof viewing while retaining `Open original` as a secondary action.
- Quote-backed artwork pages no longer repeat the entire production process inside `Description`.
- Production details are now presented as concise dedicated fields.
- Added customer-facing `Print media` using the selected roll material snapshot, including the material customer-facing name when configured.
- Added separate `Laminate` and optional `Backing` fields.
- `Stock` now represents the base substrate instead of hiding the selected roll media inside a generic process summary.
- `Finishing` excludes laminate/coating so it contains actual finishing operations such as Jingwei cutting.
- Existing proof/revision/approval behaviour is unchanged.

## Validation

- Modified TS/TSX files were syntax/transpile checked with TypeScript 5.8.3.
- Static assertions cover clean PDF canvas rendering, no embedded iframe/object viewer, customer-facing media, separate laminate and concise description behaviour.
- `unzip -t` passed for the release archive.
- Full `pnpm typecheck` could not be run in the packaging environment because the source archive contains no `node_modules` and pnpm is unavailable.
