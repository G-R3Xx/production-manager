export type MaterialCostInput = {
  type: string;
  widthMm?: number | null;
  heightMm?: number | null;
  rollWidthMm?: number | null;
  unitCost: number;
  minimumBillableSheetFraction?: number | null;
  rollBillingIncrementMetres?: number | null;
  allowRotation?: boolean;
};

export type MachineCostInput = {
  speedValue: number;
  speedUom: string;
  hourlyCost: number;
  setupMinutes: number;
  inkCostPerSqm: number;
};

export type LabourCostInput = {
  name: string;
  hourlyRate: number;
  calculationBasis: string;
  calculationValue: number;
  minimumMinutes: number;
};

export type RecipeCostInput = {
  finishedWidthMm: number;
  finishedHeightMm: number;
  quantity: number;
  material?: MaterialCostInput | null;
  machine?: MachineCostInput | null;
  labour: LabourCostInput[];
  wastePercent: number;
  markupMultiplier: number;
  profitMultiplier: number;
};

export type RecipeCostResult = {
  areaSqm: number;
  materialUsage: {
    mode: "sheet" | "roll" | "area" | "none";
    sheets?: number;
    piecesPerSheet?: number;
    linearMetres?: number;
    lanes?: number;
    wastePieces?: number;
  };
  materialCost: number;
  machineCost: number;
  inkCost: number;
  labourCost: number;
  totalCost: number;
  sellPrice: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const safe = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function calculateProductionRecipeCost(input: RecipeCostInput): RecipeCostResult {
  const width = Math.max(0, safe(input.finishedWidthMm));
  const height = Math.max(0, safe(input.finishedHeightMm));
  const quantity = Math.max(1, Math.ceil(safe(input.quantity, 1)));
  const areaSqm = width * height * quantity / 1_000_000;
  const wasteFactor = 1 + Math.max(0, safe(input.wastePercent)) / 100;

  let materialCost = 0;
  let materialUsage: RecipeCostResult["materialUsage"] = { mode: "none" };
  let sheets = 0;
  let linearMetres = 0;

  if (input.material && width > 0 && height > 0) {
    const material = input.material;
    const type = String(material.type || "").toLowerCase();
    const allowRotation = material.allowRotation !== false;

    if (type.includes("sheet") || type.includes("paper") || type.includes("card")) {
      const parentWidth = Math.max(0, safe(material.widthMm ?? 0));
      const parentHeight = Math.max(0, safe(material.heightMm ?? 0));
      const normalFit = parentWidth > 0 && parentHeight > 0
        ? Math.floor(parentWidth / width) * Math.floor(parentHeight / height)
        : 0;
      const rotatedFit = allowRotation && parentWidth > 0 && parentHeight > 0
        ? Math.floor(parentWidth / height) * Math.floor(parentHeight / width)
        : 0;
      const piecesPerSheet = Math.max(normalFit, rotatedFit);

      if (piecesPerSheet > 0) {
        const rawSheets = quantity / piecesPerSheet;
        const minimumFraction = Math.max(0, safe(material.minimumBillableSheetFraction ?? 0));
        sheets = minimumFraction > 0
          ? Math.ceil(rawSheets / minimumFraction) * minimumFraction
          : rawSheets;
        materialCost = sheets * safe(material.unitCost) * wasteFactor;
        materialUsage = {
          mode: "sheet",
          sheets,
          piecesPerSheet,
          wastePieces: Math.max(0, Math.ceil(sheets * piecesPerSheet) - quantity)
        };
      }
    } else if (type.includes("roll") || type.includes("laminate") || type.includes("cello")) {
      const rollWidth = Math.max(0, safe(material.rollWidthMm ?? material.widthMm ?? 0));
      const normalLanes = rollWidth > 0 ? Math.floor(rollWidth / width) : 0;
      const rotatedLanes = allowRotation && rollWidth > 0 ? Math.floor(rollWidth / height) : 0;
      const normalLinearMetres = normalLanes > 0
        ? Math.ceil(quantity / normalLanes) * height / 1000
        : Number.POSITIVE_INFINITY;
      const rotatedLinearMetres = rotatedLanes > 0
        ? Math.ceil(quantity / rotatedLanes) * width / 1000
        : Number.POSITIVE_INFINITY;

      // Pick the orientation that actually consumes the least roll length for
      // this quantity. Choosing only the orientation with the most lanes can
      // waste media on small quantities (for example, one 800 x 500 panel on
      // 1220 mm stock is cheaper at 500 mm run length than rotating it merely
      // to create a second unused lane).
      let lanes = 1;
      if (Number.isFinite(normalLinearMetres) || Number.isFinite(rotatedLinearMetres)) {
        const rotate = rotatedLinearMetres < normalLinearMetres;
        lanes = rotate ? rotatedLanes : normalLanes;
        linearMetres = rotate ? rotatedLinearMetres : normalLinearMetres;
      } else {
        // Preserve the legacy oversize fallback until panel/tile costing is a
        // dedicated rule. A valid auto-select group will prefer any stock width
        // that genuinely fits before this fallback is reached.
        linearMetres = height / 1000;
      }
      const billingIncrement = material.rollBillingIncrementMetres == null
        ? 0.5
        : Math.max(0, safe(material.rollBillingIncrementMetres));
      if (linearMetres > 0 && billingIncrement > 0) {
        linearMetres = Math.ceil((linearMetres - 0.0000001) / billingIncrement) * billingIncrement;
      }
      materialCost = linearMetres * safe(material.unitCost) * wasteFactor;
      materialUsage = { mode: "roll", linearMetres, lanes };
    } else {
      materialCost = areaSqm * safe(material.unitCost) * wasteFactor;
      materialUsage = { mode: "area" };
    }
  }

  let machineCost = 0;
  let inkCost = 0;
  if (input.machine) {
    const speed = Math.max(0, safe(input.machine.speedValue));
    const setupHours = Math.max(0, safe(input.machine.setupMinutes)) / 60;
    let runHours = 0;
    switch (input.machine.speedUom) {
      case "linear_metres_per_hour":
        runHours = speed > 0 ? linearMetres / speed : 0;
        break;
      case "sheets_per_hour":
        runHours = speed > 0 ? sheets / speed : 0;
        break;
      default:
        runHours = speed > 0 ? areaSqm / speed : 0;
    }
    machineCost = (setupHours + runHours) * Math.max(0, safe(input.machine.hourlyCost));
    inkCost = areaSqm * Math.max(0, safe(input.machine.inkCostPerSqm));
  }

  let labourCost = 0;
  for (const operation of input.labour) {
    let hours = 0;
    const value = Math.max(0, safe(operation.calculationValue));
    switch (operation.calculationBasis) {
      case "per_sqm_hours": hours = areaSqm * value; break;
      case "per_sheet_hours": hours = sheets * value; break;
      case "per_linear_metre_hours": hours = linearMetres * value; break;
      case "per_item_hours": hours = quantity * value; break;
      default: hours = value / 60;
    }
    hours = Math.max(hours, Math.max(0, safe(operation.minimumMinutes)) / 60);
    labourCost += hours * Math.max(0, safe(operation.hourlyRate));
  }

  const totalCost = materialCost + machineCost + inkCost + labourCost;
  const sellPrice = totalCost
    * Math.max(0, safe(input.markupMultiplier, 1))
    * Math.max(0, safe(input.profitMultiplier, 1));

  return {
    areaSqm: Math.round(areaSqm * 1000) / 1000,
    materialUsage,
    materialCost: roundMoney(materialCost),
    machineCost: roundMoney(machineCost),
    inkCost: roundMoney(inkCost),
    labourCost: roundMoney(labourCost),
    totalCost: roundMoney(totalCost),
    sellPrice: roundMoney(sellPrice)
  };
}
