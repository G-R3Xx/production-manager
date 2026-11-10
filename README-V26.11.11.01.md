# Production Manager V26.11.11.01

Based on V26.11.10.01.

## Fix: Enquiries screen panels

The Enquiries page now explicitly places **New enquiry** in the left column and **Current enquiries** in the right column. The previous layout relied on automatic placement in an inline grid. The revised layout uses a content-width responsive grid with explicit columns/rows and minimum-width containment, preventing the right-hand enquiry list from appearing beneath the entry form while there is usable desktop space to its right.

- On a wide content area, New enquiry is a maximum of 420px wide; Current enquiries fills the remaining space.
- On a narrow content area (820px or less), the two panels intentionally stack vertically.
- The current-enquiries heading and filter links can wrap cleanly in narrower widths.
- Enquiry creation, existing client/contact selection, correspondence and action buttons remain unchanged.
- No database changes or SQL migrations.

## Verification

- `node scripts/tests/enquiries-responsive-layout.cjs` — PASS.
- TypeScript transpilation/syntax diagnostics of the changed `page.tsx` and application layout — PASS.
- Full workspace `pnpm typecheck` — not run here; installed Next.js/React dependencies are not included in this source archive.
- Live application/browser visual verification — not completed. Please verify at normal browser zoom after deployment.

## Installation

1. Extract the source ZIP into your Production Manager checkout, retaining your local `.env` and other deployment configuration.
2. Run `pnpm typecheck` from the repository root.
3. Deploy to your normal environment.
4. On Enquiries, confirm both panels are side by side at desktop widths, and intentionally stacked on a narrow/mobile view.
