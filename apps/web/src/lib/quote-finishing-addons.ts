/** Product-scoped, material-backed add-ons for the Quick/Custom quote wizard.
 * The choices deliberately use existing builder keys instead of material-name
 * guessing or introducing another manufacturing/process catalogue.
 */
export const QUOTE_FINISHING_PRODUCT_GROUPS = [
  { title: "Signage base products", options: [
    { key: "acrylic", label: "Acrylic" },
    { key: "acm", label: "ACM signs" },
    { key: "corflute", label: "Corflute signs" },
    { key: "pvc", label: "PVC / Foamboard" },
    { key: "banner", label: "Vinyl / Roll stock" },
    { key: "other_sheet", label: "Other sheet" }
  ] },
  { title: "Small-format products", options: [
    { key: "business_cards", label: "Business cards" },
    { key: "flyers", label: "Flyers" },
    { key: "brochures", label: "Brochures" },
    { key: "booklets", label: "Booklets" },
    { key: "duplicate_books", label: "Carbon-copy books" },
    { key: "stickers", label: "Stickers" }
  ] }
] as const;

export type QuoteFinishingProductKey = typeof QUOTE_FINISHING_PRODUCT_GROUPS[number]["options"][number]["key"];
const allowedKeys: ReadonlySet<string> = new Set(QUOTE_FINISHING_PRODUCT_GROUPS.flatMap((group) => group.options.map((option) => option.key)));

export function normalizeFinishingProducts(value: unknown): QuoteFinishingProductKey[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((key): key is QuoteFinishingProductKey => typeof key === "string" && allowedKeys.has(key)))];
}

export function finishingMaterialAvailable(material: { quoteAddOnEnabled?: boolean; quoteAddOnProducts?: readonly string[] | null }, productKey: string): boolean {
  return material.quoteAddOnEnabled === true && Boolean(productKey) && (material.quoteAddOnProducts ?? []).includes(productKey);
}

export function finishingAddOnUnitCost(purchaseCost: number, stockQuantity: number, purchaseUom: string, stockUom: string, wastagePercent = 0): number {
  const cost = Number.isFinite(purchaseCost) ? Math.max(0, purchaseCost) : 0;
  const costWithWaste = cost * (1 + Math.max(0, Number.isFinite(wastagePercent) ? wastagePercent : 0) / 100);
  return stockQuantity > 0 && purchaseUom.trim().toLowerCase() !== stockUom.trim().toLowerCase()
    ? costWithWaste / stockQuantity
    : costWithWaste;
}
