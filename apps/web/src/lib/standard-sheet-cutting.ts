/** Standard straight-cut labour on sheet stock, allocated by cutting yield.
 * Null / missing setting inherits the 5-minute Corflute/ACM default; zero disables.
 * No extra labour is charged if an explicit specialty cutting operation replaces it.
 */
export function standardSheetCuttingMinutesPerSheet(
  baseType: string,
  configured: string | number | null | undefined
): number {
  const inherited = baseType === "corflute" || baseType === "acm" ? 5 : 0;
  if (configured == null || String(configured).trim() === "") return inherited;
  const minutes = Number(configured);
  return Number.isFinite(minutes) && minutes >= 0 && minutes <= 240 ? minutes : inherited;
}

export function allocatedStandardSheetCutting(input: {
  baseType: string;
  configuredMinutesPerSheet: string | number | null | undefined;
  calculatedSheetUse: number;
  finishedQuantity: number;
  specialtyCutSelected: boolean;
}): { minutesPerSheet: number; minutesPerItem: number; totalMinutes: number } {
  const minutesPerSheet = standardSheetCuttingMinutesPerSheet(input.baseType, input.configuredMinutesPerSheet);
  if (input.specialtyCutSelected || input.finishedQuantity <= 0 || !Number.isFinite(input.finishedQuantity)
    || input.calculatedSheetUse <= 0 || !Number.isFinite(input.calculatedSheetUse)) {
    return { minutesPerSheet, minutesPerItem: 0, totalMinutes: 0 };
  }
  const totalMinutes = input.calculatedSheetUse * minutesPerSheet;
  return { minutesPerSheet, minutesPerItem: totalMinutes / input.finishedQuantity, totalMinutes };
}
