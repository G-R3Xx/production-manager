# Production Manager V26.11.05.01

Based on **V26.11.03.01**, retaining accepted-quote MYOB client recovery, Sub Jobs, improved quote-line Move/Delete, quote performance, staff certificates, courier pass-through pricing, and prior fixes.

## Material-controlled finishing add-ons

The **Materials > Edit material** form now has a **Quote finishing add-on** section:

1. Tick **Offer this material as an optional add-on in the quote builder**.
2. Tick one or more **Signage base products** (Acrylic, ACM signs, Corflute signs, PVC/Foamboard, Vinyl/Roll stock, Other sheet) or **Small-format products** (Business cards, Flyers, Brochures, Booklets, Carbon-copy books, Stickers).
3. Save the material. The material's card shows its allowed base products.
4. In the **Quick / Custom guided quote builder**, choose an eligible product. The **Finishing** step (or **Small-format finishing** step) will list the configured add-on. Tick it and set **Qty / finished item**.

**Example — Stutcards:** Edit *Stutcards*, enable the option, tick **Corflute signs** only. When quoting a corflute item, select Stutcards and enter 2 per finished sign. At quote qty 10, PM costs 20 Stutcards using the saved material's purchase cost/pack quantity and wastage. It applies existing line markups, profit and price-level rules; no separate manual pricing setup is needed.

- Multiple eligible add-ons may be selected on the same quote line.
- The selected quantity, material identity, unit cost breakdown, and full material snapshot are preserved on saved lines. Edit/reopen can restore selected materials even if hidden later.
- Production/artwork specifications now list selected finishing materials with per-item quantities.
- Existing specialised **Eyelets** (placement quantity, labour, equipment) and **Standoffs** flows remain. These are excluded from the new generic add-on list to avoid duplicate charges. Existing name-based standoff choices remain backward compatible; when standoff material has product eligibility configured, that eligibility applies to the standoff selector.
- Existing quotes and prices are not bulk-modified. No automatic selection: staff must opt into each add-on per quote line.
- This release covers the existing *Signage* and *Small format* product families. Plan/poster printing (which can use MYOB matrix prices) has not been changed.

## Deployment

**No SQL migration is required.** The new material settings are saved in each material's existing `catalog.materials.cost_json` JSONB field, with an explicit per-product allowlist.

1. Replace source with V26.11.05.01 and install/restore workspace dependencies if necessary.
2. Run `pnpm typecheck` in the repository root, then `pnpm build` as appropriate.
3. Deploy and edit **Materials > Stutcards**, enable the finishing add-on and tick **Corflute signs**.
4. Create a test Corflute quote and verify quantity, preview price, itemised cost report, saved quote and edit/reopen.

## Tests and limitations

Passed locally: strict TypeScript check of the new shared helper; TS/TSX syntax checks for changed files; material/add-on eligibility and snapshot regression tests; artwork specification test; existing Sub Job, quote quick-action, performance-status, quote cost report, permission and Delivery/Courier pricing regression suites.

**Not run here:** Full Next.js / monorepo `pnpm typecheck`, live Supabase/MYOB queries, live browser use and integration deployment (the source ZIP does not contain installed dependencies). Please run the full local check prior to deployment. This is a code update, not a live deployment.
