# Production Manager V26.11.02.03 — Courier + pass-through delivery pricing

Based on **V26.11.02.02**; retains staff-card access layout and internal quote cost breakdown.

## Quote builder

- Adds **Courier** alongside **Pickup, Delivery, Install** in the quick and guided quote builders, as a standalone service or linked dispatch line.
- Delivery and Courier each accept a dollar charge; the entered **ex-GST amount is charged as-is** (no markup, profit multiplier, customer A–F price-level adjustment, or quote-line discount).
- These lines carry `pricingSource: pass_through` and saved multipliers `1 / 1 / 1`, discount `0`, and itemised charge at the actual input rate.
- Other pricing (printing, materials, labour, machine time, installation labour, fixings, travel and access equipment) is unchanged.
- A standalone Delivery or Courier service uses the entered amount **per selected service quantity**; a dispatch fee added to a manufactured quote is a separate one-off line (quantity 1).
- For client quotes, the charge remains **ex GST**, with GST handled through the normal quote/invoice display.
- Managers/Owners no longer see markup/profit editors on standalone Delivery/Courier lines, and server actions block attempts to apply these adjustments.
- Both quote save paths validate/pass through the saved `deliveryCharge` field (also used as the amount for Courier for compatibility), overriding submitted calculated selling prices.

## Production

- Adds Courier as a distinct option in the production job dispatch editor and preserves it in the job record.
- Its production handoff remains in the **Delivery** board column, with a distinct `Ready for courier` label where generated; no new board column is required.

## Deployment

1. Replace source with V26.11.02.03, preserving your `.env` and any custom local config.
2. No SQL migration is needed for these changes. Prior migrations, including 062, remain as applicable.
3. Run `pnpm typecheck` in your Windows project checkout (or `pnpm install` first if needed), and then deploy.
4. Confirm: Quick Quote → Delivery $66 = $66 ex GST; Courier $66 = $66 ex GST; signage with Courier adds a separate $66 line; Install retains normal pricing; customer quote displays Courier properly.

**Existing saved quote prices are not silently rewritten.** When re-opening and saving an existing Delivery line in the updated builder, its calculated price will be normalised to the entered delivery charge. The feature affects newly saved or edited lines.

## Checks performed

- Strict isolated TypeScript check of pass-through pricing helper passed.
- Both new pass-through regression tests and existing quote-cost report tests passed.
- Source-level TypeScript/TSX syntax checks passed for all modified files.
- A complete six-package `pnpm typecheck` and end-to-end browser run were **not** possible here because the source ZIP contains no installed `node_modules` or live Supabase connection. Those checks are required in your local deployment environment.
