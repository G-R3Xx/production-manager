/** Deterministic, historical cost report: ONLY uses values saved on quote lines.
 * No current material, machine or staff rates are fetched or substituted. */
export type CostCategory = "Materials" | "Ink" | "Labour" | "Machines" | "Finishing / consumables" | "Other";

export type QuoteCostLineInput = {
  productName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  clientResponseStatus: string;
  clientRevisionExcluded?: boolean;
  configurationSnapshot: Record<string, unknown>;
  optionSummary?: string | null;
};

export type CostPart = {
  category: CostCategory;
  label: string;
  detail: string;
  amountPerUnit: number;
  unit: string;
  rate: number;
  costPerUnit: number;
  lineCost: number;
  note: string;
};

export type CostedLine = {
  name: string;
  qty: number;
  unitPrice: number;
  revenue: number;
  parts: CostPart[];
  rawCostPerUnit: number | null;
  totalCost: number | null;
  grossProfit: number | null;
  marginPercent: number | null;
  active: boolean;
  complete: boolean;
  pricingSource: string;
  savedPricing: Array<{ label: string; value: string }>;
  warnings: string[];
  optionSummary: string;
  machineSelections: string[];
};

export type CostReport = {
  lines: CostedLine[];
  revenue: number;
  knownCost: number;
  grossProfit: number | null;
  marginPercent: number | null;
  complete: boolean;
  categoryTotals: Record<CostCategory, number>;
};

const categories: CostCategory[] = ["Materials", "Ink", "Labour", "Machines", "Finishing / consumables", "Other"];
export const COST_CATEGORIES: readonly CostCategory[] = categories;
const obj = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown): string => typeof value === "string" ? value : "";
const numeric = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const moneyText = (value: unknown): string => {
  const n = numeric(value);
  return n === null ? "Not saved" : String(n);
};

export function costCategory(label: string): CostCategory {
  const text = label.toLowerCase();
  if (/ink|toner|\b(?:cmyk|mono|carbon book)(?: \+ special)? print\b/.test(text)) return "Ink";
  if (/labour|labor|artwork|design time|setup time|install time|finishing time/.test(text)) return "Labour";
  if (/machine|click|printer run|press run/.test(text)) return "Machines";
  if (/material|stock|substrate|vinyl|film|laminat|paper|card|media|board|acrylic|acm|corflute|ncr/.test(text)) return "Materials";
  if (/finish|eyelet|fixing|tape|silicone|screw|consumable|coating|standoff/.test(text)) return "Finishing / consumables";
  return "Other";
}

function buildLine(input: QuoteCostLineInput): CostedLine {
  const snapshot = obj(input.configurationSnapshot);
  const pricing = obj(snapshot.pricingSnapshot);
  const qty = numeric(input.quantity) ?? 0;
  const unitPrice = numeric(input.unitPrice) ?? 0;
  const revenue = numeric(input.lineTotal) ?? 0;
  const active = input.clientResponseStatus !== "cancelled";
  const warnings: string[] = [];
  const breakdown = pricing.pricingBreakdown;
  let complete = Array.isArray(breakdown);
  const parts: CostPart[] = [];

  if (!complete) warnings.push("No itemised costing snapshot was saved for this line. Cost and margin unavailable.");
  if (Array.isArray(breakdown)) {
    for (const [index, value] of breakdown.entries()) {
      const item = obj(value);
      const amount = numeric(item.amount);
      const rate = numeric(item.rate);
      const cost = numeric(item.cost);
      if (!str(item.label).trim() || amount === null || rate === null || cost === null || amount < 0 || rate < 0 || cost < 0) {
        complete = false;
        warnings.push(`Cost component ${index + 1} has missing or invalid saved figures.`);
        continue;
      }
      if (Math.abs(amount * rate - cost) > 0.025) warnings.push(`${str(item.label)}: saved component cost differs from quantity × rate (possible rounded/minimum charge).`);
      parts.push({
        category: /^(?:min|person-min|hour|hours|hr)$/i.test(str(item.unit)) ? "Labour" : costCategory(str(item.label)),
        label: str(item.label),
        detail: str(item.detail),
        amountPerUnit: amount,
        unit: str(item.unit),
        rate,
        costPerUnit: cost,
        lineCost: cost * qty,
        note: str(item.note)
      });
    }
  }

  const rawCostPerUnit = numeric(pricing.rawCost);
  if (rawCostPerUnit === null || rawCostPerUnit < 0) {
    complete = false;
    warnings.push("Saved raw unit cost is missing or invalid.");
  }
  const componentTotal = parts.reduce((sum, part) => sum + part.costPerUnit, 0);
  if (rawCostPerUnit !== null && complete && Math.abs(componentTotal - rawCostPerUnit) > 0.025) {
    complete = false;
    warnings.push(`Components add to $${componentTotal.toFixed(2)} per unit but saved raw cost is $${rawCostPerUnit.toFixed(2)}. Cannot reconcile.`);
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    complete = false;
    warnings.push("Invalid saved line quantity.");
  }
  if (Math.abs(unitPrice * qty - revenue) > 0.025) warnings.push("Saved line total differs from unit price × quantity. The stored line total is used for revenue.");
  if (snapshot.unitPriceOverridden === true) warnings.push("Unit selling price was manually overridden. Saved cost is still itemised below.");
  if (str(pricing.pricingSource) === "myob_item_matrix") warnings.push("MYOB matrix controls the selling price; this is not a cost-plus calculation.");
  if (!active) warnings.push("Cancelled line: excluded from overall totals.");
  if (input.clientRevisionExcluded) warnings.push("Marked excluded from client revision; verify whether it should remain in the commercial quote.");

  const markup = moneyText(pricing.markupMultiplier);
  const profit = moneyText(pricing.profitMultiplier);
  const level = moneyText(pricing.priceLevelFactor);
  const discount = moneyText(pricing.manualQuoteDiscountPercent);
  const pricingSource = str(pricing.pricingSource) || "Not saved";
  const totalCost = complete && rawCostPerUnit !== null ? rawCostPerUnit * qty : null;
  const grossProfit = totalCost === null ? null : revenue - totalCost;
  const marginPercent = grossProfit === null || revenue <= 0 ? null : grossProfit / revenue * 100;
  const machineCosting = obj(pricing.machineCosting);
  const machineSelections = Array.from(new Set(Object.entries(machineCosting)
    .filter(([key, value]) => key.endsWith("Name") && typeof value === "string" && value.trim())
    .map(([, value]) => String(value).trim())));
  return {
    name: input.productName,
    qty,
    unitPrice,
    revenue,
    parts,
    rawCostPerUnit,
    totalCost,
    grossProfit,
    marginPercent,
    active,
    complete,
    pricingSource,
    savedPricing: [
      { label: "Markup multiplier", value: markup },
      { label: "Profit multiplier", value: profit },
      { label: "Price-level factor", value: level },
      { label: "Quote discount %", value: discount },
      { label: "Automatically calculated unit price", value: moneyText(pricing.autoUnitPrice) },
      { label: "Labour rate $/hr", value: moneyText(pricing.labourRate) },
      { label: "Ink rate $/m²", value: moneyText(pricing.inkRatePerSqm) }
    ],
    warnings,
    optionSummary: input.optionSummary ?? "",
    machineSelections
  };
}

export function buildQuoteCostReport(lines: readonly QuoteCostLineInput[]): CostReport {
  const all = lines.map(buildLine);
  const active = all.filter((line) => line.active);
  const revenue = active.reduce((sum, line) => sum + line.revenue, 0);
  const complete = active.every((line) => line.complete);
  const knownCost = active.reduce((sum, line) => sum + (line.totalCost ?? 0), 0);
  const categoryTotals = Object.fromEntries(categories.map((category) => [category, active.reduce((sum, line) => sum + (line.complete ? line.parts.filter((part) => part.category === category).reduce((partSum, part) => partSum + part.lineCost, 0) : 0), 0)])) as Record<CostCategory, number>;
  const grossProfit = complete ? revenue - knownCost : null;
  return {
    lines: all,
    revenue,
    knownCost,
    grossProfit,
    marginPercent: grossProfit !== null && revenue > 0 ? grossProfit / revenue * 100 : null,
    complete,
    categoryTotals
  };
}
