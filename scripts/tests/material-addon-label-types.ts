/**
 * Compile-only regression for typed Material quote finishing product labels.
 * Run from repository root:
 *   tsc --noEmit --strict --target es2022 --module commonjs --moduleResolution node scripts/tests/material-addon-label-types.ts
 */
import { QUOTE_FINISHING_PRODUCT_OPTIONS, type QuoteFinishingProductKey } from "../../apps/web/src/lib/quote-finishing-addons";

const savedProducts: QuoteFinishingProductKey[] = ["corflute"];
const labels: string[] = QUOTE_FINISHING_PRODUCT_OPTIONS
  .filter((option) => savedProducts.includes(option.key))
  .map((option) => option.label);
void labels;
