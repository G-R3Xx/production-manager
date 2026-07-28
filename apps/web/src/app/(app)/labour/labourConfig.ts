export type LabourBasis =
  | "fixed_minutes"
  | "per_sqm_hours"
  | "per_sheet_hours"
  | "per_linear_metre_hours"
  | "per_item_hours";

export type LabourBasisOption = {
  value: LabourBasis;
  label: string;
  shortLabel: string;
  description: string;
  inputLabel: string;
  unitLabel: string;
  exampleQuantity: number;
  exampleQuantityLabel: string;
};

export const LABOUR_BASIS_OPTIONS: LabourBasisOption[] = [
  {
    value: "fixed_minutes",
    label: "One fixed time",
    shortLabel: "fixed job",
    description: "Charge the same amount of time whenever this operation is used. Best for setup, file checks and packing.",
    inputLabel: "Minutes for the whole operation",
    unitLabel: "per use",
    exampleQuantity: 1,
    exampleQuantityLabel: "each use"
  },
  {
    value: "per_sqm_hours",
    label: "Time per square metre",
    shortLabel: "m²",
    description: "Time grows with the finished area. Best for mounting, hand laminating and surface preparation.",
    inputLabel: "Minutes per square metre",
    unitLabel: "per m²",
    exampleQuantity: 5,
    exampleQuantityLabel: "5 m²"
  },
  {
    value: "per_sheet_hours",
    label: "Time per sheet",
    shortLabel: "sheet",
    description: "Time grows with the number of parent sheets used. Best for sheet handling, loading and sheet finishing.",
    inputLabel: "Minutes per sheet",
    unitLabel: "per sheet",
    exampleQuantity: 5,
    exampleQuantityLabel: "5 sheets"
  },
  {
    value: "per_linear_metre_hours",
    label: "Time per linear metre",
    shortLabel: "linear metre",
    description: "Time grows with roll length. Best for hemming, taping and other roll-media finishing.",
    inputLabel: "Minutes per linear metre",
    unitLabel: "per linear metre",
    exampleQuantity: 4,
    exampleQuantityLabel: "4 linear metres"
  },
  {
    value: "per_item_hours",
    label: "Time per finished item",
    shortLabel: "item",
    description: "Time grows with quantity. Best for drilling, trimming, assembly and individual packing.",
    inputLabel: "Minutes per item",
    unitLabel: "per item",
    exampleQuantity: 10,
    exampleQuantityLabel: "10 items"
  }
];

export function storedLabourValueToMinutes(basis: string, value: string): number {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return basis === "fixed_minutes" ? parsed : parsed * 60;
}

export function labourBasisLabel(basis: string): string {
  return LABOUR_BASIS_OPTIONS.find((option) => option.value === basis)?.label ?? basis.replaceAll("_", " ");
}

export function labourBasisUnit(basis: string): string {
  return LABOUR_BASIS_OPTIONS.find((option) => option.value === basis)?.unitLabel ?? "per use";
}
