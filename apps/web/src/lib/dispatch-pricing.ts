/** Pickup is free; Delivery and Courier are charged at the exact entered amount. */
export function isPassThroughDispatchService(value: unknown): boolean {
  return value === "delivery" || value === "courier";
}

/** Never treat a manufactured product with 'delivery' in its name as a dispatch charge. */
export function isPassThroughQuoteLine(snapshot: unknown, productName?: string | null): boolean {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const details = snapshot as Record<string, unknown>;
    if (details.flowType === "service" && isPassThroughDispatchService(details.serviceType)) return true;
  }
  return /^(delivery|courier)$/i.test(String(productName ?? "").trim());
}

/** Amount to be charged for an unmarked-up logistics service, ex GST. */
export function passThroughUnitPrice(amount: number): number {
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

/** Normalize all quote save paths so user-supplied form prices cannot reapply a multiplier. */
export function enforcePassThroughLine<T extends { productName: string; unitPrice: string; configurationSnapshot: Record<string, unknown> }>(line: T): T {
  if (!isPassThroughQuoteLine(line.configurationSnapshot, line.productName)) return line;
  const service = line.configurationSnapshot;
  if (!isPassThroughDispatchService(service.serviceType)) return line; // legacy one-off names have no saved charge to recompute
  const amount = passThroughUnitPrice(Number(service.deliveryCharge ?? 0));
  const unitPrice = amount.toFixed(2);
  const pricing = service.pricingSnapshot && typeof service.pricingSnapshot === "object" && !Array.isArray(service.pricingSnapshot)
    ? service.pricingSnapshot as Record<string, unknown> : {};
  return {
    ...line,
    unitPrice,
    configurationSnapshot: {
      ...service,
      unitPriceOverridden: false,
      manualUnitPrice: unitPrice,
      pricingSnapshot: {
        ...pricing,
        markupMultiplier: 1,
        profitMultiplier: 1,
        priceLevelFactor: 1,
        manualQuoteDiscountPercent: 0,
        rawCost: amount,
        autoUnitPrice: amount,
        pricingSource: "pass_through"
      }
    }
  };
}
