# Production Manager V26.11.05.04 — Standard sheet cutting / Materials typecheck fix

Based on V26.11.05.03. No SQL migration is required: the optional per-material rate is stored in the existing `catalog.materials.cost_json` JSONB field.

## Changes

### Corrected Materials table typecheck failure

- The Materials table now uses a single explicitly typed `QUOTE_FINISHING_PRODUCT_OPTIONS` list rather than a `flatMap` over two differently inferred literal tuples.
- This addresses the reported TS2322 and TS18046 errors at MaterialPriceManager.tsx around line 262.
- The product-key typecheck regression has been updated to check the corrected path.

### Automatic standard cutting labour for Corflute and ACM

- Guided sheet-signage quoting includes **5 minutes of standard cutting labour per parent sheet** by default for Corflute and ACM.
- It uses **calculated sheet-yield allocation**, not the separately rounded material-billing increment. Four signs per sheet allocate 5 ÷ 4 = **1.25 cutting minutes per sign**. Ten signs at 4-up allocate 2.5 sheet equivalents = 12.5 minutes total.
- The existing configured Jingwei-cutting labour rate is used for standard cutting (falling back to the default quotation labour rate). The labour cost appears as its own item in the internal cost breakdown and is included in the quote unit price.
- If **Jingwei cutting** is selected, the automatic standard cutting row is omitted, avoiding a double charge.
- The material's **standardCutMinutesPerSheet** setting is editable in the individual material form and the Material Price Manager table (`Cut min/sheet`). **Blank** = automatic default (5 for Corflute/ACM, 0 for other bases); **0** = disabled; positive number = per-sheet override. Range 0–240.
- Existing quote data remains intact; accepted quote pricing is not recalculated automatically.
- The saved quote snapshot retains the selected material's cutting setting when the line is reopened.

## Verification performed in this package

- Strict TypeScript check passed for `material-addon-label-types.ts` and `standard-sheet-cutting.ts` using the global TypeScript compiler.
- Syntax/TSX transpilation checks passed for the nine changed production source modules.
- Standard-sheet-cutting regression tests passed (Corflute, ACM, 4-up, single item, quantity 10, custom time, disabled time, Jingwei override, metadata and snapshot wiring).
- Existing material-add-on, materials-grid SQL-save, Courier/Delivery pricing, quote Sub Job, status polling, quick line actions, MYOB recovery and quote cost report tests passed.
- ZIP archive integrity and SHA-256 verified.

## Not completed here

- Full monorepo `pnpm typecheck` requires installing all dependencies in your own checkout; this source archive intentionally does not include `node_modules`.
- No live Supabase or browser pricing test was available. Please validate a representative 4-up Corflute/ACM quote using your actual labour rate before deploying to all staff.

## Local verification and deployment

1. Replace the source with this ZIP, preserving your local `.env` configuration. Existing database migration 064 etc. should already be in place.
2. Run `pnpm typecheck` and `pnpm build` in your Windows checkout.
3. In Materials, leave **Cut min/sheet** blank for default, use 0 to disable, or supply a custom number.
4. Create a Corflute or ACM guided quote and inspect the itemised cost breakdown. Compare a 4-up standard cut to a specialty Jingwei cut.

No SQL migration for V26.11.05.04.
